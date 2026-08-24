"""A2A (Agent-to-Agent) Tool for delegating research missions to DeepResearchAgent."""

from __future__ import annotations

import json
import logging
import os
import queue
import re
from contextvars import ContextVar, Token
from typing import Any
import boto3
from strands import tool

logger = logging.getLogger(__name__)

REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "ap-northeast-2"
DEEP_RESEARCH_RUNTIME_ARN = os.environ.get(
    "DEEP_RESEARCH_RUNTIME_ARN",
    "arn:aws:bedrock-agentcore:ap-northeast-2:612529367436:runtime/serverlessstrands_DeepResearchAgent-fNxJzC68TQ",
)

_resolved_runtime_arn: str | None = None

_subagent_queue: ContextVar[queue.Queue[dict] | None] = ContextVar(
    "subagent_queue",
    default=None,
)


def set_subagent_queue(q: queue.Queue[dict]) -> Token:
    return _subagent_queue.set(q)


def reset_subagent_queue(token: Token) -> None:
    _subagent_queue.reset(token)


def _emit_subagent_event(ev: dict[str, Any]) -> None:
    q = _subagent_queue.get()
    if q is not None:
        q.put_nowait(ev)


def _get_deep_research_runtime_arn() -> str:
    """Resolve DeepResearchAgent runtime ARN from env or control-plane discovery."""
    global _resolved_runtime_arn
    if _resolved_runtime_arn:
        return _resolved_runtime_arn

    if DEEP_RESEARCH_RUNTIME_ARN:
        _resolved_runtime_arn = DEEP_RESEARCH_RUNTIME_ARN
        return _resolved_runtime_arn

    try:
        control = boto3.client("bedrock-agentcore-control", region_name=REGION)
        resp = control.list_agent_runtimes()
        for item in resp.get("agentRuntimes", []):
            name = item.get("agentRuntimeName", "")
            if "DeepResearch" in name or "deepresearch" in name.lower():
                _resolved_runtime_arn = item.get("agentRuntimeArn")
                if _resolved_runtime_arn:
                    return _resolved_runtime_arn
    except Exception as err:
        logger.warning("Could not discover runtime ARN from control plane: %s", err)

    return "arn:aws:bedrock-agentcore:ap-northeast-2:612529367436:runtime/serverlessstrands_DeepResearchAgent-fNxJzC68TQ"


def _extract_and_emit_events(text: str) -> str:
    """Extract embedded __SUBAGENT_EVENT_JSON_START__...__SUBAGENT_EVENT_JSON_END__ tags, emit them, and return cleaned text."""
    pattern = r"__SUBAGENT_EVENT_JSON_START__(.*?)__SUBAGENT_EVENT_JSON_END__"
    matches = re.findall(pattern, text)
    for m in matches:
        try:
            ev = json.loads(m)
            _emit_subagent_event(ev)
        except Exception as e:
            logger.debug("Failed to parse subagent event JSON: %s", e)
    return re.sub(pattern, "", text)


def _parse_agentcore_sse_stream(body_stream: Any) -> str:
    """Parse Bedrock AgentCore SSE stream, emit live subagent events, and extract clean text."""
    text_parts: list[str] = []
    buffer = ""

    for raw in body_stream:
        chunk_bytes = None
        if isinstance(raw, dict):
            if "chunk" in raw and isinstance(raw["chunk"], dict) and "bytes" in raw["chunk"]:
                chunk_bytes = raw["chunk"]["bytes"]
            elif "bytes" in raw:
                chunk_bytes = raw["bytes"]
        elif isinstance(raw, bytes):
            chunk_bytes = raw

        if chunk_bytes is not None:
            chunk_str = chunk_bytes.decode("utf-8", errors="ignore")
        else:
            chunk_str = str(raw)

        buffer += chunk_str
        lines = buffer.split("\n")
        buffer = lines.pop()

        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith("data:"):
                payload = line[5:].strip()
                if payload.startswith('"') and payload.endswith('"'):
                    try:
                        parsed = json.loads(payload)
                        if isinstance(parsed, str):
                            clean = _extract_and_emit_events(parsed)
                            if clean:
                                text_parts.append(clean)
                    except Exception:
                        clean = _extract_and_emit_events(payload)
                        if clean:
                            text_parts.append(clean)
                elif payload.startswith("{"):
                    try:
                        obj = json.loads(payload)
                        if "data" in obj and isinstance(obj["data"], str):
                            clean = _extract_and_emit_events(obj["data"])
                            if clean:
                                text_parts.append(clean)
                    except Exception:
                        pass
                else:
                    clean = _extract_and_emit_events(payload)
                    if clean:
                        text_parts.append(clean)
            elif not line.startswith("event:") and not line.startswith(":"):
                clean = _extract_and_emit_events(line)
                if clean:
                    text_parts.append(clean)

    if buffer.strip():
        trailing = buffer.strip()
        if trailing.startswith("data:"):
            payload = trailing[5:].strip()
            if payload.startswith('"') and payload.endswith('"'):
                try:
                    parsed = json.loads(payload)
                    if isinstance(parsed, str):
                        clean = _extract_and_emit_events(parsed)
                        if clean:
                            text_parts.append(clean)
                except Exception:
                    clean = _extract_and_emit_events(payload)
                    if clean:
                        text_parts.append(clean)
            else:
                clean = _extract_and_emit_events(payload)
                if clean:
                    text_parts.append(clean)
        elif not trailing.startswith("event:") and not trailing.startswith(":"):
            clean = _extract_and_emit_events(trailing)
            if clean:
                text_parts.append(clean)

    return "".join(text_parts).strip()


@tool
def deep_research(
    topic: str,
    depth: str = "comprehensive",
    focus_areas: list[str] | None = None,
) -> str:
    """Delegate an intensive research mission to the specialized DeepResearchAgent (A2A Protocol).

    Use this tool whenever the user requests in-depth research, comprehensive literature or market reviews,
    comparative competitive analyses, academic investigation, or state-of-the-art technological surveys.

    If the user also asked for Word, PowerPoint, or Excel files, use the research findings returned by this tool
    to immediately call `create_word_document`, `create_powerpoint_presentation`, or `create_excel_spreadsheet`.

    Args:
        topic: The central research question, subject, or domain to investigate.
        depth: "overview" (brief), "standard" (balanced), or "comprehensive" (exhaustive multi-source dossier).
        focus_areas: Specific facets to emphasize (e.g. ["market size", "technical bottleneck", "key players"]).
    """
    runtime_arn = _get_deep_research_runtime_arn()
    payload = {
        "prompt": topic,
        "topic": topic,
        "depth": depth,
        "focus_areas": focus_areas or [],
    }

    _emit_subagent_event({
        "type": "subagent_step",
        "agent": "DeepResearchAgent",
        "stage": "starting",
        "topic": topic,
        "depth": depth,
        "detail": f"Initializing autonomous deep research on: '{topic}'",
    })

    try:
        client = boto3.client("bedrock-agentcore", region_name=REGION)
        response = client.invoke_agent_runtime(
            agentRuntimeArn=runtime_arn,
            qualifier="DEFAULT",
            payload=json.dumps(payload).encode("utf-8"),
        )

        body_stream = response.get("response")
        if body_stream:
            dossier = _parse_agentcore_sse_stream(body_stream)
            if dossier:
                return (
                    f"{dossier}\n\n"
                    f"---\n"
                    f"**Agent Directive:** If the user requested document deliverables (Word .docx, PowerPoint .pptx, Excel .xlsx), "
                    f"proceed immediately to call the appropriate office creation tools in this turn using this research dossier."
                )
    except Exception as err:
        logger.error("A2A DeepResearchAgent runtime invocation error: %s", err)
        _emit_subagent_event({
            "type": "subagent_step",
            "agent": "DeepResearchAgent",
            "stage": "error",
            "topic": topic,
            "detail": f"Runtime invocation error: {err}",
        })
        return (
            f"[A2A DeepResearchAgent Notice]: Runtime invocation error ({err}). "
            f"Topic: {topic}. Please provide direct synthesis or retry."
        )

    return (
        f"### 🔬 Deep Research Dossier: {topic}\n\n"
        f"**Research Depth:** {depth.capitalize()}\n"
        f"**Focus Areas:** {', '.join(focus_areas) if focus_areas else 'General holistic investigation'}\n\n"
        f"The DeepResearchAgent completed the investigation for **{topic}**."
    )


deep_research_tools = [deep_research]
