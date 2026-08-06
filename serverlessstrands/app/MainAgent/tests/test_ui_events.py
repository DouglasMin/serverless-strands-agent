import json
from queue import Queue

from ui_events import (
    reset_route_preview_queue,
    set_route_preview_queue,
    show_route_preview,
)


def _route_payload():
    return {
        "originLabel": "Origin",
        "destinationLabel": "Destination",
        "origin": {"lat": 1.25, "lng": 2.5},
        "destination": {"lat": 3.75, "lng": 4.0},
        "distanceText": "8.4 km",
        "durationText": "32 min",
        "travelMode": "WALK",
        "mapsUrl": "https://www.google.com/maps/dir/?api=1",
    }


def test_show_route_preview_accepts_gateway_response_envelope():
    route_queue = Queue()
    token = set_route_preview_queue(route_queue)
    try:
        gateway_response = {
            "statusCode": 200,
            "body": json.dumps(
                {"content": [{"type": "json", "json": _route_payload()}]}
            ),
        }

        result = show_route_preview._tool_func(json.dumps(gateway_response))

        assert result == "Route preview sent to the chat UI."
        assert route_queue.get_nowait()["destinationLabel"] == "Destination"
    finally:
        reset_route_preview_queue(token)


def test_show_route_preview_accepts_direct_dict_payload():
    route_queue = Queue()
    token = set_route_preview_queue(route_queue)
    try:
        result = show_route_preview._tool_func(_route_payload())

        assert result == "Route preview sent to the chat UI."
        assert route_queue.get_nowait()["travelMode"] == "WALK"
    finally:
        reset_route_preview_queue(token)


def test_show_route_preview_accepts_map_only_payload_without_route_metrics():
    route_queue = Queue()
    token = set_route_preview_queue(route_queue)
    try:
        payload = _route_payload()
        payload.pop("distanceText")
        payload.pop("durationText")
        payload["routeStatus"] = "MAP_ONLY"

        result = show_route_preview._tool_func(payload)

        assert result == "Route preview sent to the chat UI."
        queued = route_queue.get_nowait()
        assert queued["routeStatus"] == "MAP_ONLY"
        assert "distanceText" not in queued
        assert "durationText" not in queued
    finally:
        reset_route_preview_queue(token)
