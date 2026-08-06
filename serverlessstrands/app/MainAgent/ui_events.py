import json
import queue
from contextvars import ContextVar, Token
from typing import Any

from strands import tool

_route_preview_queue: ContextVar[queue.Queue[dict] | None] = ContextVar(
    "route_preview_queue",
    default=None,
)


def set_route_preview_queue(route_queue: queue.Queue[dict]) -> Token:
    return _route_preview_queue.set(route_queue)


def reset_route_preview_queue(token: Token) -> None:
    _route_preview_queue.reset(token)


def _decode_json(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _extract_route_preview_payload(value: Any) -> tuple[dict[str, Any] | None, str | None]:
    payload = _decode_json(value)
    if not isinstance(payload, dict):
        return None, "Invalid route preview JSON."

    if "statusCode" in payload and "body" in payload:
        if payload.get("statusCode") != 200:
            body = _decode_json(payload.get("body"))
            if isinstance(body, dict) and body.get("error"):
                return None, f"Route preview source failed: {body['error']}"
            return None, "Route preview source failed."
        payload = _decode_json(payload.get("body"))

    if isinstance(payload, dict):
        content = payload.get("content")
        if isinstance(content, list) and content and isinstance(content[0], dict):
            payload = _decode_json(content[0].get("json"))

    if not isinstance(payload, dict):
        return None, "Invalid route preview JSON."
    return payload, None


@tool
def show_route_preview(route_preview_json: Any) -> str:
    """Show a route preview card in the chat UI.

    route_preview_json must include destinationLabel, travelMode, mapsUrl, and
    may include distanceText, durationText, eventId, calendarId, minutesBefore.
    """
    payload, error = _extract_route_preview_payload(route_preview_json)
    if error:
        return error
    if payload is None:
        return "Invalid route preview JSON."

    required = [
        "destinationLabel",
        "travelMode",
        "mapsUrl",
    ]
    missing = [key for key in required if not payload.get(key)]
    if missing:
        return f"Missing route preview fields: {', '.join(missing)}"

    route_queue = _route_preview_queue.get()
    if route_queue is None:
        return "Route preview cannot be shown outside an active chat stream."

    route_queue.put_nowait(payload)
    return "Route preview sent to the chat UI."
