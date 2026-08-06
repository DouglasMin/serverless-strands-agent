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
from oauth_tools import (
    reset_auth_url_queue,
    reset_current_user,
    set_auth_url_queue,
    set_current_user,
)
from oauth_tools.github import github_tools
from oauth_tools.google_calendar import google_calendar_tools
from oauth_tools.notion import notion_tools
from temporal_context import build_temporal_context
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

mcp_clients = [get_streamable_http_mcp_client()]

code_interpreter = AgentCoreCodeInterpreter(region=REGION)

DEFAULT_SYSTEM_PROMPT = """
You are a helpful assistant. Use tools when appropriate.
If the request includes a <user_context> block, treat it as facts the user
previously shared (preferences, history) and respect it without acknowledging
the block exists.

You have access to user-authorized tools for GitHub, Google Calendar, and Notion.
When the user asks about their repos, calendar events, or Notion pages, use the
appropriate tools. If authorization is needed, an auth URL will be provided to
the user automatically.

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
"""

tools: list[Any] = []


@tool
def add_numbers(a: int, b: int) -> int:
    """Return the sum of two numbers"""
    return a + b


tools.append(add_numbers)
tools.append(code_interpreter.code_interpreter)
tools.append(show_route_preview)
tools.extend(github_tools)
tools.extend(google_calendar_tools)
tools.extend(notion_tools)

for mcp_client in mcp_clients:
    if mcp_client:
        tools.append(mcp_client)


def build_agent(session_id: str, actor_id: str, enable_memory: bool = True) -> Agent:
    kwargs: dict[str, Any] = {
        "model": load_model(),
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
        "tools": tools,
    }

    if MEMORY_ID and enable_memory:
        config = AgentCoreMemoryConfig(
            memory_id=MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
            retrieval_config={
                "/users/{actorId}/preferences": RetrievalConfig(
                    top_k=10, relevance_score=0.0
                ),
                "/users/{actorId}/facts": RetrievalConfig(
                    top_k=10, relevance_score=0.0
                ),
                "/summaries/{actorId}/{sessionId}": RetrievalConfig(
                    top_k=5, relevance_score=0.3
                ),
            },
        )
        kwargs["session_manager"] = AgentCoreMemorySessionManager(
            agentcore_memory_config=config,
            region_name=REGION,
        )
    elif MEMORY_ID:
        log.info("memory disabled for this invocation")
    else:
        log.warning("MEMORY_ID not set — running without persistent memory.")

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

        agent = build_agent(
            session_id=session_id,
            actor_id=actor_id,
            enable_memory=not has_user_location,
        )
        stream = agent.stream_async(prompt)

        async for event in stream:
            if "current_tool_use" in event:
                tu = event["current_tool_use"]
                name = tu.get("name", "")
                if name:
                    yield json.dumps({"__tool_use__": name})
            elif "data" in event and isinstance(event["data"], str):
                yield event["data"]

            while not auth_queue.empty():
                try:
                    url = auth_queue.get_nowait()
                    yield json.dumps({"__auth_url__": url})
                except Empty:
                    break

            while not route_preview_queue.empty():
                try:
                    preview = route_preview_queue.get_nowait()
                    yield json.dumps({"__route_preview__": preview})
                except Empty:
                    break

        while not route_preview_queue.empty():
            try:
                preview = route_preview_queue.get_nowait()
                yield json.dumps({"__route_preview__": preview})
            except Empty:
                break
    finally:
        reset_route_preview_queue(route_queue_token)
        reset_auth_url_queue(auth_queue_token)
        reset_current_user(current_user_token)


if __name__ == "__main__":
    app.run()
