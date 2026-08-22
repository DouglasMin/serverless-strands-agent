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


def parse_ui_event(data: str | dict[str, Any]) -> dict[str, Any] | None:
    """Parse a UI event envelope, supporting standard AG-UI and legacy formats.

    Returns normalized dict:
      - {"type": "tool_use", "name": "..."}
      - {"type": "auth_url", "url": "..."}
      - {"type": "route_preview", "preview": {...}}
      - {"type": "document_artifact", "document": {...}}
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

    # Standard AG-UI format
    event_type = parsed.get("type")
    if event_type == "tool_use" and parsed.get("name"):
        return {"type": "tool_use", "name": parsed["name"]}
    if event_type == "auth_url" and parsed.get("url"):
        return {"type": "auth_url", "url": parsed["url"]}
    if event_type == "route_preview" and parsed.get("preview"):
        return {"type": "route_preview", "preview": parsed["preview"]}
    if event_type == "document_artifact" and parsed.get("document"):
        return {"type": "document_artifact", "document": parsed["document"]}

    # Legacy envelopes
    if "__tool_use__" in parsed:
        return {"type": "tool_use", "name": parsed["__tool_use__"]}
    if "__auth_url__" in parsed:
        return {"type": "auth_url", "url": parsed["__auth_url__"]}
    if "__route_preview__" in parsed:
        return {"type": "route_preview", "preview": parsed["__route_preview__"]}
    if "__document_artifact__" in parsed:
        return {"type": "document_artifact", "document": parsed["__document_artifact__"]}

    return None
