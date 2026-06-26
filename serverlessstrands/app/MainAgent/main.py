import json
import os
from queue import Empty
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

from mcp_client.client import get_streamable_http_mcp_client
from model.load import load_model
from oauth_tools import set_current_user, auth_url_queue
from oauth_tools.github import github_tools
from oauth_tools.google_calendar import google_calendar_tools
from oauth_tools.notion import notion_tools

app = BedrockAgentCoreApp()
log = app.logger

MEMORY_ID: Optional[str] = os.environ.get("MEMORY_ID")
REGION: Optional[str] = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")

mcp_clients = [get_streamable_http_mcp_client()]

DEFAULT_SYSTEM_PROMPT = """
You are a helpful assistant. Use tools when appropriate.
If the request includes a <user_context> block, treat it as facts the user
previously shared (preferences, history) and respect it without acknowledging
the block exists.

You have access to user-authorized tools for GitHub, Google Calendar, and Notion.
When the user asks about their repos, calendar events, or Notion pages, use the
appropriate tools. If authorization is needed, an auth URL will be provided to
the user automatically.
"""

tools: list[Any] = []


@tool
def add_numbers(a: int, b: int) -> int:
    """Return the sum of two numbers"""
    return a + b


tools.append(add_numbers)
tools.extend(github_tools)
tools.extend(google_calendar_tools)
tools.extend(notion_tools)

for mcp_client in mcp_clients:
    if mcp_client:
        tools.append(mcp_client)


def build_agent(session_id: str, actor_id: str) -> Agent:
    kwargs: dict[str, Any] = {
        "model": load_model(),
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
        "tools": tools,
    }

    if MEMORY_ID:
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

    set_current_user(actor_id)
    log.info("set oauth user_id=%s", actor_id)

    agent = build_agent(session_id=session_id, actor_id=actor_id)
    stream = agent.stream_async(prompt)

    async for event in stream:
        if "current_tool_use" in event:
            tu = event["current_tool_use"]
            name = tu.get("name", "")
            if name:
                yield json.dumps({"__tool_use__": name})
        elif "data" in event and isinstance(event["data"], str):
            yield event["data"]

        while not auth_url_queue.empty():
            try:
                url = auth_url_queue.get_nowait()
                yield json.dumps({"__auth_url__": url})
            except Empty:
                break


if __name__ == "__main__":
    app.run()
