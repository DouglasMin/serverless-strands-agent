import os
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

app = BedrockAgentCoreApp()
log = app.logger

# Injected by agentcore.json `envVars`. Optional — if absent the agent falls
# back to stateless behaviour (no STM/LTM, no cross-session preferences).
MEMORY_ID: Optional[str] = os.environ.get("MEMORY_ID")
REGION: Optional[str] = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")

mcp_clients = [get_streamable_http_mcp_client()]

DEFAULT_SYSTEM_PROMPT = """
You are a helpful assistant. Use tools when appropriate.
If the request includes a <user_context> block, treat it as facts the user
previously shared (preferences, history) and respect it without acknowledging
the block exists.
"""

tools: list[Any] = []


@tool
def add_numbers(a: int, b: int) -> int:
    """Return the sum of two numbers"""
    return a + b


tools.append(add_numbers)

for mcp_client in mcp_clients:
    if mcp_client:
        tools.append(mcp_client)


def build_agent(session_id: str, actor_id: str) -> Agent:
    """Construct an Agent for one invocation.

    Memory is wired via AgentCoreMemorySessionManager. Both session_id (per
    conversation) and actor_id (per user, stable across conversations) must
    be supplied — they drive Memory's namespace partitioning.
    """
    kwargs: dict[str, Any] = {
        "model": load_model(),
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
        "tools": tools,
    }

    if MEMORY_ID:
        # SessionManager only queries LTM namespaces listed here.
        # Without retrieval_config it silently skips ALL LTM retrieval —
        # extraction still happens, but the agent never sees the records.
        # Namespace templates mirror what agentcore.json declared on the Memory.
        config = AgentCoreMemoryConfig(
            memory_id=MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
            retrieval_config={
                # USER_PREFERENCE: pull everything (relevance 0) so prefs apply
                # even when the query is semantically unrelated.
                "/users/{actorId}/preferences": RetrievalConfig(
                    top_k=10, relevance_score=0.0
                ),
                # SEMANTIC: facts the user shared (name, role, context).
                # USER_PREFERENCE extracts only stated preferences; identity
                # facts ("my name is X") need SEMANTIC. Pull everything so
                # identity stays in scope regardless of query similarity.
                "/users/{actorId}/facts": RetrievalConfig(
                    top_k=10, relevance_score=0.0
                ),
                # SUMMARIZATION: only semantically relevant past-session summaries.
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

    # session_id comes from the AgentCore Runtime invocation envelope
    # (runtimeSessionId on InvokeAgentRuntime). actor_id is supplied by the
    # caller (Lambda/frontend) — falls back to the session for anonymous use.
    session_id = context.session_id or "default-session"
    actor_id = payload.get("userId") or session_id

    log.info("invoking agent session=%s actor=%s", session_id, actor_id)

    agent = build_agent(session_id=session_id, actor_id=actor_id)
    stream = agent.stream_async(prompt)

    async for event in stream:
        if "current_tool_use" in event:
            tu = event["current_tool_use"]
            name = tu.get("name", "")
            if name:
                import json
                yield json.dumps({"__tool_use__": name})
        elif "data" in event and isinstance(event["data"], str):
            yield event["data"]


if __name__ == "__main__":
    app.run()
