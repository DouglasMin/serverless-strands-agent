from __future__ import annotations

import json
from typing import Any


def format_tool_use_event(name: str) -> str:
    """Format a tool use notification for the SSE stream."""
    return json.dumps({
        "type": "tool_use",
        "name": name,
        "__tool_use__": name,  # backward compatibility
    })


def format_auth_url_event(url: str) -> str:
    """Format an OAuth authorization URL notification for the SSE stream."""
    return json.dumps({
        "type": "auth_url",
        "url": url,
        "__auth_url__": url,  # backward compatibility
    })


def format_route_preview_event(preview: dict[str, Any]) -> str:
    """Format a route preview card notification for the SSE stream."""
    return json.dumps({
        "type": "route_preview",
        "preview": preview,
        "__route_preview__": preview,  # backward compatibility
    })


def format_document_artifact_event(doc: dict[str, Any]) -> str:
    """Format an MS Office document artifact notification for the SSE stream."""
    return json.dumps({
        "type": "document_artifact",
        "document": doc,
        "__document_artifact__": doc,  # backward compatibility
    })


def format_subagent_event(event_payload: dict[str, Any]) -> str:
    """Format a subagent live progress/source event for the SSE stream."""
    return json.dumps({
        "type": "subagent_event",
        "subagent": event_payload,
        "__subagent_event__": event_payload,  # backward compatibility
    })


def parse_ui_event(data: str | dict[str, Any]) -> dict[str, Any] | None:
    """Parse a UI event envelope, supporting standard AG-UI and legacy formats.

    Returns normalized dict:
      - {"type": "tool_use", "name": "..."}
      - {"type": "auth_url", "url": "..."}
      - {"type": "route_preview", "preview": {...}}
      - {"type": "document_artifact", "document": {...}}
      - {"type": "subagent_event", "subagent": {...}}
    or None if data is not a structured UI event.
    """
    if isinstance(data, str):
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError:
            return None
    elif isinstance(data, dict):
        parsed = data
    else:
        return None

    if not isinstance(parsed, dict):
        return None

    # Standard AG-UI Envelope format
    if "type" in parsed:
        t = parsed["type"]
        if t == "tool_use" and "name" in parsed:
            return {"type": "tool_use", "name": parsed["name"]}
        if t == "auth_url" and "url" in parsed:
            return {"type": "auth_url", "url": parsed["url"]}
        if t == "route_preview" and "preview" in parsed:
            return {"type": "route_preview", "preview": parsed["preview"]}
        if t == "document_artifact" and "document" in parsed:
            return {"type": "document_artifact", "document": parsed["document"]}
        if t == "subagent_event" and "subagent" in parsed:
            return {"type": "subagent_event", "subagent": parsed["subagent"]}

    # Legacy double-underscore format fallback
    if "__tool_use__" in parsed:
        return {"type": "tool_use", "name": parsed["__tool_use__"]}
    if "__auth_url__" in parsed:
        return {"type": "auth_url", "url": parsed["__auth_url__"]}
    if "__route_preview__" in parsed:
        return {"type": "route_preview", "preview": parsed["__route_preview__"]}
    if "__document_artifact__" in parsed:
        return {"type": "document_artifact", "document": parsed["__document_artifact__"]}
    if "__subagent_event__" in parsed:
        return {"type": "subagent_event", "subagent": parsed["__subagent_event__"]}

    return None
