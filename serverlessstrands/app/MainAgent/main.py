import asyncio
import json
import os
from queue import Empty, Queue
from typing import Any, Optional
from bedrock_agentcore.memory.integrations.strands.config import (
    AgentCoreMemoryConfig,
    RetrievalConfig,
)
from bedrock_agentcore.memory.integrations.strands.session_manager import (
    AgentCoreMemorySessionManager,
)
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent, tool

from strands_tools.code_interpreter import AgentCoreCodeInterpreter

from mcp_client.client import get_streamable_http_mcp_client
from model.load import load_model
from a2a_tools import (
    deep_research_tools,
    reset_subagent_queue,
    set_subagent_queue,
)
from oauth_tools import (
    reset_auth_url_queue,
    reset_current_user,
    set_auth_url_queue,
    set_current_user,
)
from oauth_tools.github import github_tools
from oauth_tools.google_calendar import google_calendar_tools
from oauth_tools.notion import notion_tools
from office_tools import (
    office_tools,
    reset_document_queue,
    set_document_queue,
)
from temporal_context import build_temporal_context
from tool_registry import ToolFactorySet, build_tools
from ui_envelope import (
    format_auth_url_event,
    format_document_artifact_event,
    format_route_preview_event,
    format_subagent_event,
    format_tool_use_event,
)
from ui_events import (
    reset_route_preview_queue,
    set_route_preview_queue,
    show_route_preview,
)

app = BedrockAgentCoreApp()
log = app.logger

MEMORY_ID: Optional[str] = os.environ.get("MEMORY_ID")
REGION: str = (
    os.environ.get("AWS_REGION")
    or os.environ.get("AWS_DEFAULT_REGION")
    or "ap-northeast-2"
)
ENVIRONMENT: str = os.environ.get("ENVIRONMENT", "dev")

DEFAULT_SYSTEM_PROMPT = """
You are a helpful assistant. Use tools when appropriate.
If the request includes a <user_context> block, treat it as facts the user
previously shared (preferences, history) and respect it without acknowledging
the block exists.

You have access to user-authorized developer tools for GitHub, Notion, and Google Calendar:
- GitHub: list/inspect repos, read source code file contents directly (github_get_file_contents), review pull requests (github_list_pull_requests, github_get_pull_request), search code (github_search_code), create issues (github_create_issue), and comment (github_create_issue_comment).
- Notion: search pages/databases (notion_search), read full page blocks (notion_get_page), query/filter databases (notion_query_database), create formatted pages or Kanban items (notion_create_page), append notes (notion_append_blocks), and add comments (notion_add_comment).
- Google Calendar: list events, find events with location, and set reminders.
If authorization is needed for any provider, an auth URL will be prompted to the user automatically.

For deep research and comprehensive investigations:
1. When asked to perform deep research, in-depth market or technical surveys, competitive analysis, academic reviews, or exhaustive literature synthesis, use the `deep_research` tool.
2. The `deep_research` tool delegates the mission to the specialized DeepResearchAgent (A2A Protocol) to gather multi-source evidence from live web searches, Wikipedia, and ArXiv papers.
3. MANDATORY MULTI-STEP WORKFLOW: If the user asks to conduct research AND generate deliverable files (e.g. Word .docx, PowerPoint .pptx, Excel .xlsx):
   - First call `deep_research` to obtain the comprehensive research dossier.
   - Do NOT stop after deep research. Immediately in the same turn, take the research findings and call `create_word_document`, `create_powerpoint_presentation`, or `create_excel_spreadsheet` (or all requested tools).
   - In your final response, summarize the executive findings and confirm the deliverables generated.

For document, spreadsheet, and presentation generation:
1. Use `create_excel_spreadsheet` when asked to create Excel spreadsheets, financial models, budgets, data tables, or .xlsx files. Include calculated formula rows (e.g. "=SUM(...)") and styled headers.
2. Use `create_word_document` when asked to create Word documents, formal reports, documentation, executive summaries, or .docx files with styled headings and tables.
3. Use `create_powerpoint_presentation` when asked to create slide decks, pitch decks, briefings, presentations, or .pptx files with modern widescreen slide layouts.

For route planning:
1. When the user asks for directions, routes, travel time, or how to get from
   one place to another, resolve both origin and destination with Google Maps
   geocode or place search unless coordinates are already available.
2. If <user_location> is present and the user asks from "here", "my location",
   or does not provide an origin, use <user_location> as the route origin.
3. If <user_location> is not present, never infer the user's current location,
   never use Seoul City Hall or any other default origin, and never say "from
   your current location". Ask the user to enable location access or provide an
   explicit origin before computing a current-location route.
4. Use google_maps_route_preview to compute the route payload.
5. Always call show_route_preview with the google_maps_route_preview JSON result
   so the chat UI renders the embedded map card. Do this before giving a text
   summary. If the route payload has routeStatus=MAP_ONLY, the card is only a
   Google Maps route map; do not state distance, duration, or turn-by-turn
   details as facts. Do not fall back to manual directions unless the route tool
   fails completely.

For route planning from calendar events:
1. Use Google Calendar tools to find the relevant event.
2. If the event has a location, resolve it with Google Maps geocode or place search.
3. Include eventId/calendarId in show_route_preview when the route is for a
   Calendar event.
4. Do not set Calendar reminders unless the user explicitly asks or confirms.

For computational tasks, data analysis, and uploaded files:
1. When asked to perform calculations, data analysis, script generation, or test
   code, use the `code_interpreter` tool to execute Python code in the sandbox.
2. When the user attaches files in `<user_attachments>` (e.g. CSV, Excel, JSON, or images),
   use `code_interpreter` with `pandas`, `openpyxl`, or standard Python to load and
   analyze the data directly from the provided S3 URI or parse the content.
3. Verify computational results through code execution rather than estimation.
"""


@tool
def add_numbers(a: int, b: int) -> int:
    """Return the sum of two numbers"""
    return a + b


def _create_code_interpreter():
    try:
        interpreter = AgentCoreCodeInterpreter(region=REGION)
        return interpreter.code_interpreter
    except Exception as err:
        log.warning("failed to initialize Code Interpreter: %s", err)
        return None


def _create_oauth_tools() -> list[Any]:
    tools: list[Any] = []
    tools.extend(github_tools)
    tools.extend(google_calendar_tools)
    tools.extend(notion_tools)
    return tools


def _create_mcp_tools() -> list[Any]:
    client = get_streamable_http_mcp_client()
    return [client] if client else []


_tool_factories = ToolFactorySet(
    base_tools=lambda: [add_numbers, show_route_preview],
    mcp_tools=_create_mcp_tools,
    oauth_tools=_create_oauth_tools,
    office_tools=lambda: office_tools,
    code_interpreter_tool=_create_code_interpreter,
    browser_tools=lambda: [],
    a2a_tools=lambda: deep_research_tools,
)

tools: list[Any] = build_tools(_tool_factories)


def trace_attributes(
    session_id: str, actor_id: str, enable_memory: bool
) -> dict[str, Any]:
    """Attributes Langfuse maps onto its session/user/tag concepts.

    Without these every trace is anonymous, so "show me what this user hit"
    and multi-turn replay are both impossible — and it cannot be backfilled.

    Keys must match Langfuse's OTel mapping exactly, and Strands silently
    drops any value that is not str/int/float/bool or a list of those
    (Agent.__init__), so both are covered by tests.
    """
    return {
        "session.id": session_id,
        "user.id": actor_id,
        "langfuse.session.id": session_id,
        "langfuse.user.id": actor_id,
        "langfuse.version": "1.0.0",
        "langfuse.release": f"serverlessstrands-agentcore-{ENVIRONMENT}",
        "langfuse.trace.tags": [
            f"env:{ENVIRONMENT}",
            # Location-bearing turns run without Memory; being able to filter
            # on that separates "the agent forgot" from "Memory was off".
            f"memory:{'on' if enable_memory else 'off'}",
            "model:claude-3.7-sonnet",
        ],
    }


def build_agent(session_id: str, actor_id: str, enable_memory: bool = True) -> Agent:
    kwargs: dict[str, Any] = {
        "model": load_model(),
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
        "tools": tools,
        "trace_attributes": trace_attributes(session_id, actor_id, enable_memory),
    }

    if enable_memory and MEMORY_ID:
        try:
            config = AgentCoreMemoryConfig(
                memory_id=MEMORY_ID,
                session_id=session_id,
                actor_id=actor_id,
                retrieval_config={
                    f"/users/{actor_id}/facts": RetrievalConfig(
                        top_k=10,
                        max_tokens=2000,
                    ),
                    f"/users/{actor_id}/preferences": RetrievalConfig(
                        top_k=10,
                        max_tokens=2000,
                    ),
                },
            )
            session_manager = AgentCoreMemorySessionManager(
                config,
                region_name=REGION,
            )
            kwargs["session_manager"] = session_manager
            log.info("attached AgentCoreMemorySessionManager memory_id=%s", MEMORY_ID)
        except Exception as err:
            log.warning("failed to attach memory session manager: %s", err)

    return Agent(**kwargs)


@app.entrypoint
async def invoke(payload, context):
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        yield "[error] prompt is required"
        return

    session_id = context.session_id or "default-session"
    actor_id = payload.get("userId") or session_id

    log.info("invoking agent session=%s actor=%s", session_id, actor_id)

    current_user_token = set_current_user(actor_id)
    auth_queue: Queue[str] = Queue()
    auth_queue_token = set_auth_url_queue(auth_queue)
    log.info("set oauth user_id=%s", actor_id)

    route_preview_queue: Queue[dict] = Queue()
    route_queue_token = set_route_preview_queue(route_preview_queue)

    doc_queue: Queue[dict] = Queue()
    doc_queue_token = set_document_queue(doc_queue)

    subagent_queue: Queue[dict] = Queue()
    subagent_queue_token = set_subagent_queue(subagent_queue)

    try:
        prompt = prompt + "\n\n" + build_temporal_context()

        user_location = payload.get("userLocation")
        has_user_location = (
            isinstance(user_location, dict)
            and "lat" in user_location
            and "lng" in user_location
        )
        if has_user_location:
            prompt = (
                prompt
                + "\n\n<user_location ephemeral=\"true\">"
                + json.dumps(user_location)
                + "</user_location>"
                + "\nUse this location only for this route-planning turn. Do not remember it."
            )
        else:
            prompt = (
                prompt
                + "\n\n<user_location unavailable=\"true\">"
                + "No current user location was supplied by the UI. "
                + "Do not infer, approximate, or invent the user's current location. "
                + "If the route needs the user's current location, ask for location access or an explicit origin."
                + "</user_location>"
            )

        attachments = payload.get("attachments")
        if isinstance(attachments, list) and attachments:
            att_lines = ["\n\n<user_attachments>"]
            for att in attachments:
                if isinstance(att, dict):
                    fname = att.get("filename", "file.dat")
                    ctype = att.get("contentType", "application/octet-stream")
                    durl = att.get("downloadUrl") or att.get("s3Uri", "")
                    size = att.get("sizeBytes", 0)
                    att_lines.append(
                        f"Attachment '{fname}' (Type: {ctype}, Size: {size} bytes):\n"
                        f"  Download URL: {durl}\n"
                        f"  In code_interpreter, download and load with:\n"
                        f"    import urllib.request\n"
                        f"    urllib.request.urlretrieve('''{durl}''', '{fname}')\n"
                        f"    # Then open '{fname}' using openpyxl, pandas, csv, or json.\n"
                    )
            att_lines.append(
                "</user_attachments>\n"
                "The user has attached the file(s) listed above. "
                "You MUST use `code_interpreter` to download the file(s) via the provided Download URL, "
                "analyze the contents, perform the requested calculations or charting, and provide the insights."
            )
            prompt = prompt + "\n".join(att_lines)

        agent = build_agent(
            session_id=session_id,
            actor_id=actor_id,
            enable_memory=not has_user_location,
        )
        out_queue: asyncio.Queue[str | None] = asyncio.Queue()

        async def stream_consumer():
            try:
                async for event in agent.stream_async(prompt):
                    if "current_tool_use" in event:
                        tu = event["current_tool_use"]
                        name = tu.get("name", "")
                        if name:
                            await out_queue.put(format_tool_use_event(name))
                    elif "data" in event and isinstance(event["data"], str):
                        await out_queue.put(event["data"])
            except Exception as e:
                log.error("Agent stream error: %s", e)
                await out_queue.put(f"\n\n[Agent Error]: {e}")
            finally:
                await out_queue.put(None)

        async def queue_poller():
            seen_auth_urls: set[str] = set()
            while True:
                while not subagent_queue.empty():
                    try:
                        sub_ev = subagent_queue.get_nowait()
                        await out_queue.put(format_subagent_event(sub_ev))
                    except Empty:
                        break

                while not auth_queue.empty():
                    try:
                        url = auth_queue.get_nowait()
                        if url and url not in seen_auth_urls:
                            seen_auth_urls.add(url)
                            await out_queue.put(format_auth_url_event(url))
                    except Empty:
                        break

                while not route_preview_queue.empty():
                    try:
                        preview = route_preview_queue.get_nowait()
                        await out_queue.put(format_route_preview_event(preview))
                    except Empty:
                        break

                while not doc_queue.empty():
                    try:
                        doc = doc_queue.get_nowait()
                        await out_queue.put(format_document_artifact_event(doc))
                    except Empty:
                        break

                await asyncio.sleep(0.05)

        consumer_task = asyncio.create_task(stream_consumer())
        poller_task = asyncio.create_task(queue_poller())

        try:
            while True:
                item = await out_queue.get()
                if item is None:
                    break
                yield item
        finally:
            poller_task.cancel()
            await asyncio.gather(consumer_task, return_exceptions=True)
            while not subagent_queue.empty():
                try:
                    yield format_subagent_event(subagent_queue.get_nowait())
                except Empty:
                    break
            while not route_preview_queue.empty():
                try:
                    yield format_route_preview_event(route_preview_queue.get_nowait())
                except Empty:
                    break
            while not doc_queue.empty():
                try:
                    yield format_document_artifact_event(doc_queue.get_nowait())
                except Empty:
                    break
    finally:
        reset_subagent_queue(subagent_queue_token)
        reset_document_queue(doc_queue_token)
        reset_route_preview_queue(route_queue_token)
        reset_auth_url_queue(auth_queue_token)
        reset_current_user(current_user_token)


if __name__ == "__main__":
    app.run()
