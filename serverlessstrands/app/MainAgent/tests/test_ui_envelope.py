import json

from ui_envelope import (
    format_auth_url_event,
    format_route_preview_event,
    format_tool_use_event,
    parse_ui_event,
)


def test_format_and_parse_tool_use():
    raw = format_tool_use_event("google_maps_geocode")
    data = json.loads(raw)
    assert data["type"] == "tool_use"
    assert data["name"] == "google_maps_geocode"
    assert data["__tool_use__"] == "google_maps_geocode"

    parsed = parse_ui_event(raw)
    assert parsed == {"type": "tool_use", "name": "google_maps_geocode"}


def test_format_and_parse_auth_url():
    url = "https://example.com/oauth/authorize?foo=bar"
    raw = format_auth_url_event(url)
    data = json.loads(raw)
    assert data["type"] == "auth_url"
    assert data["url"] == url
    assert data["__auth_url__"] == url

    parsed = parse_ui_event(raw)
    assert parsed == {"type": "auth_url", "url": url}


def test_format_and_parse_route_preview():
    preview = {
        "destinationLabel": "Seoul Station",
        "travelMode": "TRANSIT",
        "mapsUrl": "https://maps.google.com",
    }
    raw = format_route_preview_event(preview)
    data = json.loads(raw)
    assert data["type"] == "route_preview"
    assert data["preview"] == preview
    assert data["__route_preview__"] == preview

    parsed = parse_ui_event(raw)
    assert parsed == {"type": "route_preview", "preview": preview}


def test_parse_legacy_envelopes():
    assert parse_ui_event('{"__tool_use__": "calculator"}') == {
        "type": "tool_use",
        "name": "calculator",
    }
    assert parse_ui_event('{"__auth_url__": "https://auth.example.com"}') == {
        "type": "auth_url",
        "url": "https://auth.example.com",
    }
    assert parse_ui_event('{"__route_preview__": {"destinationLabel": "Coex"}}') == {
        "type": "route_preview",
        "preview": {"destinationLabel": "Coex"},
    }


def test_parse_non_event_strings():
    assert parse_ui_event("plain text delta") is None
    assert parse_ui_event('{"random": 123}') is None
    assert parse_ui_event("") is None
    assert parse_ui_event(123) is None
