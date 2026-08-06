# Google Mobility Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Google mobility flow where the assistant can inspect Calendar events, resolve event locations through Google Maps, show a route preview from the user's current browser location in chat, and set Calendar reminders after user confirmation.

**Architecture:** Google Calendar stays as a direct AgentCore Identity 3LO runtime tool because it operates on user-owned calendar data. Google Maps is added as an AgentCore Gateway Lambda target backed by a Google Maps API key secret because it is an API-key service and does not need per-user OAuth. The frontend owns browser geolocation permission and renders structured `route_preview` SSE events as chat cards; the backend forwards location context and structured events without interpreting route data.

**Tech Stack:** Python Strands tools, AgentCore Runtime, AgentCore Identity, AgentCore Gateway, Lambda container tool target, Terraform tool-lambda module, Node.js 22 Lambda SSE proxy, React 19 + Vite + TypeScript.

---

## Milestones

| Milestone | Outcome | Completion Signal |
| --- | --- | --- |
| M1 Calendar Location + Reminder Tools | Calendar can list events with locations and set popup/email reminders safely. | Unit tests pass; deployed prompt can find an event with location and set a reminder. |
| M2 Google Maps Gateway Tool | Maps Lambda can geocode, search places, compute route, and return preview-ready route JSON. | Lambda helper tests pass; Gateway target exposes `google_maps_*` tools. |
| M3 Location-Aware Chat Request | Frontend can ask for current location only when useful and backend forwards it to AgentCore. | `streamChat()` sends `userLocation`; backend payload includes it. |
| M4 Route Preview Event Protocol | MainAgent can emit structured `route_preview` events separately from text. | SSE parser handles `route_preview`; frontend stores it on assistant messages. |
| M5 Route Preview UI + Reminder Action | Chat shows route card with distance, duration, destination, and set-reminder action. | Frontend build passes; manual route prompt renders a card. |
| M6 End-to-End Smoke | Full flow works: calendar event -> location -> route -> preview -> reminder. | Smoke runbook passes against deployed CloudFront app. |

## File Structure

Create:
- `serverlessstrands/app/MainAgent/tests/test_google_calendar_tools.py`: offline tests for Calendar event filtering and reminder payload construction.
- `tools/google-maps/handler.py`: AgentCore Gateway Lambda target for Google Maps Platform APIs.
- `tools/google-maps/tool-schema.json`: Gateway tool definitions for geocode, place search, route compute, route preview.
- `tools/google-maps/requirements.txt`: Lambda Python dependencies.
- `tools/google-maps/Dockerfile`: container image for the Maps Lambda target.
- `tools/google-maps/tests/test_handler.py`: offline tests for request parsing and response shaping.
- `scripts/register_google_maps_gateway_target.py`: idempotent Gateway target registration/update script.
- `frontend/src/lib/geolocation.ts`: browser geolocation helper and route-intent heuristic.
- `frontend/src/components/RoutePreviewCard.tsx`: route card renderer and reminder action button.
- `docs/google-mobility-assistant.md`: operator and smoke-test documentation.

Modify:
- `serverlessstrands/app/MainAgent/oauth_tools/google_calendar.py`: add location-specific listing and reminder update tools.
- `serverlessstrands/app/MainAgent/main.py`: accept `userLocation` context and flush queued UI route preview events.
- `serverlessstrands/app/MainAgent/oauth_tools/__init__.py`: no behavior change expected; referenced by Calendar tools.
- `backend/handler.mjs`: forward `userLocation` and pass through `route_preview` structured SSE events.
- `frontend/src/lib/types.ts`: add `UserLocation`, `RoutePreview`, and `route_preview` stream event types.
- `frontend/src/lib/api.ts`: send `userLocation`, parse `route_preview`.
- `frontend/src/App.tsx`: request location for route-like prompts, store route previews on assistant messages, handle set-reminder action.
- `frontend/src/components/Composer.tsx`: optionally surface location readiness without blocking normal chat.
- `frontend/src/components/MessageList.tsx`: render route cards on assistant messages and add tool icons.
- `frontend/src/App.css`: route card styling.
- `infra/envs/dev/main.tf`: add `tool_google_maps` Lambda module and secret read policy.
- `infra/envs/dev/variables.tf`: add `google_maps_secret_id` and `google_maps_secret_arn_pattern`.
- `infra/envs/dev/terraform.tfvars`: set non-secret ARN value for the Google Maps API key secret.
- `README.md`: add Google Mobility feature status and deployment steps.

## Scope Boundaries

- This plan does not add Cognito. It uses the existing localStorage user ID model.
- This plan does not store current location in DynamoDB, AgentCore Memory, or logs. Location is per-request context only.
- This plan does not automatically mutate Calendar reminders without user action in the UI.
- This plan does not implement live turn-by-turn navigation. It shows route preview and an open-in-Google-Maps URL.
- This plan does not use AgentCore Registry because Registry is preview-unavailable in `ap-northeast-2`.

## Prerequisites

- Complete the existing P0 MCP endpoint/tool registry cleanup before M2 registration, so the MainAgent reliably consumes the deployed Gateway URL.
- Create a Google Maps Platform API key with Routes API, Places API, and Geocoding API enabled.
- Store the Maps API key in Secrets Manager or AgentCore Token Vault as a secret that the `serverlessstrands-dev-tool-google-maps` Lambda role can read.
- Keep API key value out of this repo. Only ARNs may be committed.

## Milestone 1: Calendar Location + Reminder Tools

**Files:**
- Create: `serverlessstrands/app/MainAgent/tests/test_google_calendar_tools.py`
- Modify: `serverlessstrands/app/MainAgent/oauth_tools/google_calendar.py`

- [ ] **Step 1: Write offline tests for location filtering and reminder body construction**

Create `serverlessstrands/app/MainAgent/tests/test_google_calendar_tools.py`:

```python
import json

from oauth_tools.google_calendar import (
    _events_with_locations,
    _build_event_with_reminder,
    _format_event,
)


def test_events_with_locations_filters_blank_locations():
    events = [
        {
            "id": "evt-1",
            "summary": "Lunch",
            "location": "Seoul Station",
            "start": {"dateTime": "2026-07-11T12:00:00+09:00"},
            "end": {"dateTime": "2026-07-11T13:00:00+09:00"},
        },
        {
            "id": "evt-2",
            "summary": "Focus",
            "location": "   ",
            "start": {"dateTime": "2026-07-11T14:00:00+09:00"},
            "end": {"dateTime": "2026-07-11T15:00:00+09:00"},
        },
        {
            "id": "evt-3",
            "summary": "Dinner",
            "location": "Gangnam Station",
            "start": {"dateTime": "2026-07-11T19:00:00+09:00"},
            "end": {"dateTime": "2026-07-11T20:00:00+09:00"},
        },
    ]

    result = _events_with_locations(events)

    assert [event["id"] for event in result] == ["evt-1", "evt-3"]
    assert result[0]["location"] == "Seoul Station"


def test_build_event_with_reminder_preserves_existing_event_fields():
    existing = {
        "id": "evt-1",
        "summary": "Meeting",
        "location": "Google Seoul",
        "start": {"dateTime": "2026-07-11T15:00:00+09:00"},
        "end": {"dateTime": "2026-07-11T16:00:00+09:00"},
    }

    updated = _build_event_with_reminder(existing, minutes_before=40, method="popup")

    assert updated["summary"] == "Meeting"
    assert updated["location"] == "Google Seoul"
    assert updated["reminders"] == {
        "useDefault": False,
        "overrides": [{"method": "popup", "minutes": 40}],
    }


def test_format_event_includes_reminders():
    event = {
        "id": "evt-1",
        "summary": "Meeting",
        "location": "Google Seoul",
        "start": {"dateTime": "2026-07-11T15:00:00+09:00"},
        "end": {"dateTime": "2026-07-11T16:00:00+09:00"},
        "reminders": {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": 30}],
        },
    }

    formatted = _format_event(event)

    assert formatted["reminders"]["overrides"][0]["minutes"] == 30
    assert json.dumps(formatted)
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd serverlessstrands/app/MainAgent
uv run pytest tests/test_google_calendar_tools.py -q
```

Expected: FAIL because `_events_with_locations` and `_build_event_with_reminder` are not defined.

- [ ] **Step 3: Add pure helpers and expose reminders in formatted events**

Modify `serverlessstrands/app/MainAgent/oauth_tools/google_calendar.py`:

```python
def _events_with_locations(events: list[dict]) -> list[dict]:
    return [
        _format_event(ev)
        for ev in events
        if str(ev.get("location") or "").strip()
    ]


def _build_event_with_reminder(existing: dict, minutes_before: int, method: str) -> dict:
    if method not in {"popup", "email"}:
        raise ValueError("method must be 'popup' or 'email'")
    if minutes_before < 0 or minutes_before > 40320:
        raise ValueError("minutes_before must be between 0 and 40320")
    updated = dict(existing)
    updated["reminders"] = {
        "useDefault": False,
        "overrides": [{"method": method, "minutes": minutes_before}],
    }
    return updated
```

Extend `_format_event()` return object with:

```python
"reminders": ev.get("reminders"),
```

- [ ] **Step 4: Add `google_calendar_find_events_with_location`**

Add this tool after `google_calendar_list_events`:

```python
@tool
def google_calendar_find_events_with_location(
    calendar_id: str = "primary",
    days_ahead: int = 7,
    max_results: int = 20,
    query: str = "",
) -> str:
    """List upcoming events that have a non-empty location field.

    Use this before route planning from Calendar events.
    calendar_id: Calendar ID, use "primary" for main calendar.
    days_ahead: Number of days ahead to inspect.
    max_results: Maximum events to inspect, capped at 50.
    query: Optional text search across event title, description, and location.
    """
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    now = datetime.now(timezone.utc)
    params: dict[str, str] = {
        "timeMin": now.isoformat(),
        "timeMax": (now + timedelta(days=days_ahead)).isoformat(),
        "maxResults": str(min(max_results, 50)),
        "singleEvents": "true",
        "orderBy": "startTime",
    }
    if query:
        params["q"] = query

    data = _gcal_request(f"/calendars/{calendar_id}/events", token, params=params)
    return json.dumps(_events_with_locations(data.get("items", [])), indent=2, ensure_ascii=False)
```

- [ ] **Step 5: Add `google_calendar_set_event_reminder`**

Add this tool before `google_calendar_delete_event`:

```python
@tool
def google_calendar_set_event_reminder(
    event_id: str,
    minutes_before: int,
    method: str = "popup",
    calendar_id: str = "primary",
) -> str:
    """Set a single reminder on an existing Calendar event.

    event_id: Event ID to update.
    minutes_before: Number of minutes before event start.
    method: "popup" or "email".
    calendar_id: Calendar containing the event. Default "primary".
    """
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    try:
        existing = _gcal_request(f"/calendars/{calendar_id}/events/{event_id}", token)
        updated = _build_event_with_reminder(existing, minutes_before, method)
    except ValueError as exc:
        return str(exc)

    result = _gcal_request(
        f"/calendars/{calendar_id}/events/{event_id}",
        token,
        method="PUT",
        body=updated,
    )
    return json.dumps({"updated": _format_event(result)}, indent=2, ensure_ascii=False)
```

Append both new tools to `google_calendar_tools`:

```python
google_calendar_find_events_with_location,
google_calendar_set_event_reminder,
```

- [ ] **Step 6: Run Calendar tests**

Run:

```bash
cd serverlessstrands/app/MainAgent
uv run pytest tests/test_google_calendar_tools.py -q
```

Expected: PASS.

- [ ] **Step 7: Commit Milestone 1**

```bash
git add serverlessstrands/app/MainAgent/oauth_tools/google_calendar.py serverlessstrands/app/MainAgent/tests/test_google_calendar_tools.py
git commit -m "feat: add calendar location and reminder tools"
```

## Milestone 2: Google Maps Gateway Lambda Tool

**Files:**
- Create: `tools/google-maps/handler.py`
- Create: `tools/google-maps/tool-schema.json`
- Create: `tools/google-maps/requirements.txt`
- Create: `tools/google-maps/Dockerfile`
- Create: `tools/google-maps/tests/test_handler.py`
- Modify: `infra/envs/dev/main.tf`
- Modify: `infra/envs/dev/variables.tf`
- Modify: `infra/envs/dev/terraform.tfvars`

- [ ] **Step 1: Write Google Maps handler tests**

Create `tools/google-maps/tests/test_handler.py`:

```python
from handler import (
    _extract_tool_name_from_raw,
    _maps_url,
    _route_preview_payload,
)


def test_extract_tool_name_from_agentcore_context_value():
    assert _extract_tool_name_from_raw("gateway___google_maps_compute_route") == "google_maps_compute_route"
    assert _extract_tool_name_from_raw("google_maps_geocode") == "google_maps_geocode"


def test_maps_url_uses_coordinates_without_spaces():
    url = _maps_url(
        origin={"lat": 37.5665, "lng": 126.9780},
        destination={"lat": 37.4979, "lng": 127.0276},
        travel_mode="DRIVE",
    )

    assert "api=1" in url
    assert "origin=37.5665,126.978" in url
    assert "destination=37.4979,127.0276" in url
    assert "travelmode=driving" in url


def test_route_preview_payload_extracts_primary_route():
    route = {
        "distanceMeters": 8400,
        "duration": "1920s",
        "polyline": {"encodedPolyline": "abc123"},
        "localizedValues": {
            "distance": {"text": "8.4 km"},
            "duration": {"text": "32 min"},
        },
        "legs": [
            {
                "startLocation": {"latLng": {"latitude": 37.5665, "longitude": 126.978}},
                "endLocation": {"latLng": {"latitude": 37.4979, "longitude": 127.0276}},
            }
        ],
    }

    payload = _route_preview_payload(
        route=route,
        origin_label="Current location",
        destination_label="Google Seoul",
        travel_mode="DRIVE",
    )

    assert payload["distanceText"] == "8.4 km"
    assert payload["durationText"] == "32 min"
    assert payload["polyline"] == "abc123"
    assert payload["destinationLabel"] == "Google Seoul"
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd tools/google-maps
python3 -m unittest discover -s tests -p 'test_*.py'
```

Expected: FAIL because `handler.py` does not exist.

- [ ] **Step 3: Create the Lambda handler**

Create `tools/google-maps/handler.py`:

```python
import json
import logging
import os
import urllib.parse
import urllib.request
from typing import Any

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DELIMITER = "___"
REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
SECRET_ARN = os.environ.get("GOOGLE_MAPS_SECRET_ARN", "")

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

_cached_api_key: str | None = None


def _get_api_key() -> str:
    global _cached_api_key
    if _cached_api_key:
        return _cached_api_key
    if not SECRET_ARN:
        raise RuntimeError("GOOGLE_MAPS_SECRET_ARN is required")
    client = boto3.client("secretsmanager", region_name=REGION)
    resp = client.get_secret_value(SecretId=SECRET_ARN)
    secret = json.loads(resp["SecretString"])
    _cached_api_key = secret.get("api_key_value") or secret.get("GOOGLE_MAPS_API_KEY")
    if not _cached_api_key:
        raise RuntimeError("Google Maps API key not found in secret")
    return _cached_api_key


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    logger.info("event=%s", json.dumps(event))
    tool_name = _extract_tool_name(context)
    router = {
        "google_maps_geocode": google_maps_geocode,
        "google_maps_place_search": google_maps_place_search,
        "google_maps_compute_route": google_maps_compute_route,
        "google_maps_route_preview": google_maps_route_preview,
    }
    handler_fn = router.get(tool_name)
    if not handler_fn:
        return _error(f"Unknown tool: {tool_name}")
    try:
        return handler_fn(event)
    except Exception:
        logger.error("tool=%s unexpected_error", tool_name, exc_info=True)
        return _error("An internal error occurred")


def _extract_tool_name(context: Any) -> str:
    try:
        return _extract_tool_name_from_raw(context.client_context.custom["bedrockAgentCoreToolName"])
    except (AttributeError, KeyError, TypeError):
        return "unknown"


def _extract_tool_name_from_raw(raw: str) -> str:
    if DELIMITER in raw:
        return raw[raw.index(DELIMITER) + len(DELIMITER):]
    return raw


def _request_json(url: str, method: str = "GET", body: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> dict[str, Any]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def _lat_lng(value: dict[str, Any]) -> dict[str, float]:
    return {"lat": float(value["lat"]), "lng": float(value["lng"])}


def _maps_url(origin: dict[str, float], destination: dict[str, float], travel_mode: str) -> str:
    mode = {
        "DRIVE": "driving",
        "WALK": "walking",
        "BICYCLE": "bicycling",
        "TRANSIT": "transit",
    }.get(travel_mode.upper(), "driving")
    query = urllib.parse.urlencode({
        "api": "1",
        "origin": f"{origin['lat']},{origin['lng']}",
        "destination": f"{destination['lat']},{destination['lng']}",
        "travelmode": mode,
    })
    return f"https://www.google.com/maps/dir/?{query}"


def _duration_seconds(duration: str) -> int:
    return int(duration.removesuffix("s")) if duration.endswith("s") else 0


def _route_preview_payload(route: dict[str, Any], origin_label: str, destination_label: str, travel_mode: str) -> dict[str, Any]:
    leg = (route.get("legs") or [{}])[0]
    start = leg.get("startLocation", {}).get("latLng", {})
    end = leg.get("endLocation", {}).get("latLng", {})
    origin = {"lat": start.get("latitude"), "lng": start.get("longitude")}
    destination = {"lat": end.get("latitude"), "lng": end.get("longitude")}
    localized = route.get("localizedValues", {})
    return {
        "originLabel": origin_label,
        "destinationLabel": destination_label,
        "distanceMeters": route.get("distanceMeters"),
        "distanceText": localized.get("distance", {}).get("text", ""),
        "durationSeconds": _duration_seconds(route.get("duration", "")),
        "durationText": localized.get("duration", {}).get("text", ""),
        "travelMode": travel_mode.upper(),
        "polyline": route.get("polyline", {}).get("encodedPolyline", ""),
        "mapsUrl": _maps_url(origin, destination, travel_mode),
    }


def google_maps_geocode(params: dict[str, Any]) -> dict[str, Any]:
    query = str(params.get("query", "")).strip()
    if not query:
        return _error("query is required")
    api_key = _get_api_key()
    url = GEOCODE_URL + "?" + urllib.parse.urlencode({"address": query, "key": api_key})
    data = _request_json(url)
    results = []
    for item in data.get("results", [])[:5]:
        location = item.get("geometry", {}).get("location", {})
        results.append({
            "formattedAddress": item.get("formatted_address"),
            "placeId": item.get("place_id"),
            "lat": location.get("lat"),
            "lng": location.get("lng"),
        })
    return _ok_json(results)


def google_maps_place_search(params: dict[str, Any]) -> dict[str, Any]:
    query = str(params.get("query", "")).strip()
    if not query:
        return _error("query is required")
    api_key = _get_api_key()
    body = {"textQuery": query, "maxResultCount": min(int(params.get("max_results", 5)), 10)}
    location = params.get("location")
    if isinstance(location, dict) and "lat" in location and "lng" in location:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": float(location["lat"]), "longitude": float(location["lng"])},
                "radius": 5000.0,
            }
        }
    data = _request_json(
        PLACES_TEXT_SEARCH_URL,
        method="POST",
        body=body,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
        },
    )
    places = []
    for place in data.get("places", []):
        loc = place.get("location", {})
        places.append({
            "placeId": place.get("id"),
            "name": place.get("displayName", {}).get("text"),
            "formattedAddress": place.get("formattedAddress"),
            "lat": loc.get("latitude"),
            "lng": loc.get("longitude"),
        })
    return _ok_json(places)


def google_maps_compute_route(params: dict[str, Any]) -> dict[str, Any]:
    api_key = _get_api_key()
    origin = _lat_lng(params["origin"])
    destination = _lat_lng(params["destination"])
    travel_mode = str(params.get("travel_mode", "DRIVE")).upper()
    body = {
        "origin": {"location": {"latLng": {"latitude": origin["lat"], "longitude": origin["lng"]}}},
        "destination": {"location": {"latLng": {"latitude": destination["lat"], "longitude": destination["lng"]}}},
        "travelMode": travel_mode,
        "routingPreference": "TRAFFIC_AWARE",
        "computeAlternativeRoutes": bool(params.get("alternatives", False)),
        "languageCode": params.get("language_code", "en"),
        "units": "METRIC",
    }
    data = _request_json(
        ROUTES_URL,
        method="POST",
        body=body,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.localizedValues,routes.legs.startLocation,routes.legs.endLocation",
        },
    )
    return _ok_json(data.get("routes", []))


def google_maps_route_preview(params: dict[str, Any]) -> dict[str, Any]:
    route_result = json.loads(google_maps_compute_route(params)["body"])["content"][0]["json"]
    routes = route_result if isinstance(route_result, list) else []
    if not routes:
        return _error("No route found")
    payload = _route_preview_payload(
        route=routes[0],
        origin_label=params.get("origin_label", "Current location"),
        destination_label=params.get("destination_label", "Destination"),
        travel_mode=str(params.get("travel_mode", "DRIVE")),
    )
    return _ok_json(payload)


def _ok_json(value: Any) -> dict[str, Any]:
    return {
        "statusCode": 200,
        "body": json.dumps({"content": [{"type": "json", "json": value}]}),
    }


def _error(msg: str) -> dict[str, Any]:
    logger.error("error_response: %s", msg)
    return {
        "statusCode": 400,
        "body": json.dumps({"error": msg}),
    }
```

- [ ] **Step 4: Add the Gateway tool schema**

Create `tools/google-maps/tool-schema.json`:

```json
[
  {
    "name": "google_maps_geocode",
    "description": "Resolve a free-form address or place query into coordinates and a formatted address.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string" }
      },
      "required": ["query"]
    }
  },
  {
    "name": "google_maps_place_search",
    "description": "Search Google Places by text, optionally biased around a latitude and longitude.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string" },
        "location": {
          "type": "object",
          "properties": {
            "lat": { "type": "number" },
            "lng": { "type": "number" }
          }
        },
        "max_results": { "type": "integer", "default": 5 }
      },
      "required": ["query"]
    }
  },
  {
    "name": "google_maps_compute_route",
    "description": "Compute route data between origin and destination coordinates.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "origin": {
          "type": "object",
          "properties": {
            "lat": { "type": "number" },
            "lng": { "type": "number" }
          },
          "required": ["lat", "lng"]
        },
        "destination": {
          "type": "object",
          "properties": {
            "lat": { "type": "number" },
            "lng": { "type": "number" }
          },
          "required": ["lat", "lng"]
        },
        "travel_mode": { "type": "string", "enum": ["DRIVE", "WALK", "BICYCLE", "TRANSIT"], "default": "DRIVE" },
        "alternatives": { "type": "boolean", "default": false },
        "language_code": { "type": "string", "default": "en" }
      },
      "required": ["origin", "destination"]
    }
  },
  {
    "name": "google_maps_route_preview",
    "description": "Compute a preview-ready route card payload between origin and destination coordinates.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "origin": {
          "type": "object",
          "properties": {
            "lat": { "type": "number" },
            "lng": { "type": "number" }
          },
          "required": ["lat", "lng"]
        },
        "destination": {
          "type": "object",
          "properties": {
            "lat": { "type": "number" },
            "lng": { "type": "number" }
          },
          "required": ["lat", "lng"]
        },
        "origin_label": { "type": "string", "default": "Current location" },
        "destination_label": { "type": "string", "default": "Destination" },
        "travel_mode": { "type": "string", "enum": ["DRIVE", "WALK", "BICYCLE", "TRANSIT"], "default": "DRIVE" },
        "language_code": { "type": "string", "default": "en" }
      },
      "required": ["origin", "destination"]
    }
  }
]
```

- [ ] **Step 5: Add Dockerfile and requirements**

Create `tools/google-maps/requirements.txt`:

```text
boto3>=1.35.0
```

Create `tools/google-maps/Dockerfile`:

```dockerfile
FROM public.ecr.aws/lambda/python:3.12-arm64

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY handler.py .

CMD ["handler.lambda_handler"]
```

- [ ] **Step 6: Add Terraform module wiring**

Modify `infra/envs/dev/variables.tf`:

```hcl
variable "google_maps_secret_id" {
  description = "Secrets Manager secret name or full ARN containing JSON with api_key_value for Google Maps Platform."
  type        = string
}

variable "google_maps_secret_arn_pattern" {
  description = "Secrets Manager ARN pattern allowing GetSecretValue for the Google Maps API key secret."
  type        = string
}
```

Modify `infra/envs/dev/main.tf`:

```hcl
module "tool_google_maps" {
  source = "../../modules/tool-lambda"

  name_prefix       = local.name_prefix
  tool_name         = "google-maps"
  region            = var.region
  aws_profile       = var.aws_profile
  lambda_source_dir = "${path.module}/../../../tools/google-maps"
  timeout           = 30
  memory_size       = 256
  environment_variables = {
    GOOGLE_MAPS_SECRET_ARN = var.google_maps_secret_id
  }
}

resource "aws_iam_role_policy" "google_maps_secrets" {
  name = "secrets-read"
  role = module.tool_google_maps.lambda_role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = var.google_maps_secret_arn_pattern
    }]
  })
}
```

Add this non-secret value to `infra/envs/dev/terraform.tfvars` after creating the secret:

```hcl
google_maps_secret_id          = "google-maps-api-key"
google_maps_secret_arn_pattern = "arn:aws:secretsmanager:ap-northeast-2:612529367436:secret:google-maps-api-key*"
```

- [ ] **Step 7: Run local Maps tests**

Run:

```bash
cd tools/google-maps
python3 -m unittest discover -s tests -p 'test_*.py'
```

Expected: PASS.

- [ ] **Step 8: Run Terraform plan**

Run:

```bash
cd infra/envs/dev
terraform fmt
terraform plan -var-file=terraform.tfvars
```

Expected: plan adds one ECR repo, one Lambda, one log group, one Gateway invoke permission, and one IAM inline policy for the Google Maps tool Lambda.

- [ ] **Step 9: Commit Milestone 2**

```bash
git add tools/google-maps infra/envs/dev/main.tf infra/envs/dev/variables.tf infra/envs/dev/terraform.tfvars
git commit -m "feat: add google maps gateway lambda"
```

## Milestone 3: Gateway Target Registration

**Files:**
- Create: `scripts/register_google_maps_gateway_target.py`
- Modify: `docs/agentcore-inventory.md`
- Modify: `serverlessstrands/agentcore/expected-agentcore-resources.json`

- [ ] **Step 1: Create idempotent Gateway registration script**

Create `scripts/register_google_maps_gateway_target.py`:

```python
#!/usr/bin/env -S uv run --with boto3 -- python
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


def load_schema(path: Path) -> list[dict]:
    return json.loads(path.read_text())


def find_gateway(client, gateway_name: str) -> dict:
    for gateway in client.list_gateways().get("items", []):
        if gateway.get("name") == gateway_name:
            return gateway
    raise RuntimeError(f"Gateway not found: {gateway_name}")


def find_target(client, gateway_id: str, target_name: str) -> dict | None:
    for target in client.list_gateway_targets(gatewayIdentifier=gateway_id).get("items", []):
        if target.get("name") == target_name:
            return target
    return None


def target_config(lambda_arn: str, schema: list[dict]) -> dict:
    return {
        "mcp": {
            "lambda": {
                "lambdaArn": lambda_arn,
                "toolSchema": {"inlinePayload": schema},
            }
        }
    }


def upsert_target(client, gateway_id: str, target_name: str, lambda_arn: str, schema: list[dict]) -> str:
    existing = find_target(client, gateway_id, target_name)
    config = target_config(lambda_arn, schema)
    if existing:
        client.update_gateway_target(
            gatewayIdentifier=gateway_id,
            targetId=existing["targetId"],
            name=target_name,
            targetConfiguration=config,
        )
        return f"updated {target_name}"
    client.create_gateway_target(
        gatewayIdentifier=gateway_id,
        name=target_name,
        description="Google Maps Platform tools",
        targetConfiguration=config,
    )
    return f"created {target_name}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", default="developer-dongik")
    parser.add_argument("--region", default="ap-northeast-2")
    parser.add_argument("--gateway-name", default="serverlessstrands-MainGateway")
    parser.add_argument("--target-name", default="google-maps")
    parser.add_argument("--lambda-arn", required=True)
    parser.add_argument("--schema", type=Path, default=Path("tools/google-maps/tool-schema.json"))
    args = parser.parse_args()

    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    client = session.client("bedrock-agentcore-control")
    try:
        gateway = find_gateway(client, args.gateway_name)
        schema = load_schema(args.schema)
        result = upsert_target(client, gateway["gatewayId"], args.target_name, args.lambda_arn, schema)
        print(result)
        return 0
    except (ClientError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Run registration after Terraform apply**

Run:

```bash
cd infra/envs/dev
terraform apply -var-file=terraform.tfvars
cd ../../..
python3 scripts/register_google_maps_gateway_target.py \
  --profile developer-dongik \
  --region ap-northeast-2 \
  --lambda-arn "$(terraform -chdir=infra/envs/dev output -raw google_maps_lambda_arn)"
```

Expected: prints `created google-maps` on first run, `updated google-maps` on repeat runs.

- [ ] **Step 3: Update audit baseline**

Modify `serverlessstrands/agentcore/expected-agentcore-resources.json` under `gateway.targets`:

```json
"google-maps": {
  "status": "READY",
  "lambdaArn": "arn:aws:lambda:ap-northeast-2:612529367436:function:serverlessstrands-dev-tool-google-maps",
  "tools": [
    "google_maps_geocode",
    "google_maps_place_search",
    "google_maps_compute_route",
    "google_maps_route_preview"
  ]
}
```

- [ ] **Step 4: Run AgentCore audit**

Run:

```bash
python3 scripts/audit_agentcore_resources.py --profile developer-dongik
```

Expected: Google Maps target and four tools are present. Registry may still warn because Registry is unavailable in `ap-northeast-2`.

- [ ] **Step 5: Commit Milestone 3**

```bash
git add scripts/register_google_maps_gateway_target.py serverlessstrands/agentcore/expected-agentcore-resources.json docs/agentcore-inventory.md
git commit -m "chore: register google maps gateway target"
```

## Milestone 4: Location-Aware Chat Request

**Files:**
- Create: `frontend/src/lib/geolocation.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `backend/handler.mjs`
- Modify: `serverlessstrands/app/MainAgent/main.py`

- [ ] **Step 1: Add frontend location types**

Modify `frontend/src/lib/types.ts`:

```ts
export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  capturedAt: number;
}
```

Add to `ChatMessage` later in Milestone 5:

```ts
routePreviews?: RoutePreview[];
```

- [ ] **Step 2: Add geolocation helper**

Create `frontend/src/lib/geolocation.ts`:

```ts
import type { UserLocation } from "./types";

const ROUTE_WORDS = [
  "route",
  "directions",
  "how do i get",
  "how to get",
  "navigate",
  "가는",
  "경로",
  "길찾기",
  "어떻게 가",
  "어디까지"
];

export function promptLikelyNeedsLocation(prompt: string): boolean {
  const value = prompt.toLowerCase();
  return ROUTE_WORDS.some((word) => value.includes(word));
}

export function getCurrentLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: Date.now()
        });
      },
      (error) => reject(new Error(error.message)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
```

- [ ] **Step 3: Extend `streamChat` request payload**

Modify `frontend/src/lib/api.ts`:

```ts
import type {
  SessionDetail,
  SessionSummary,
  StreamEvent,
  UserLocation
} from "./types";

interface ChatOpts {
  sessionId: string | null;
  prompt: string;
  userId: string;
  userLocation?: UserLocation | null;
  signal?: AbortSignal;
}
```

Change request body:

```ts
body: JSON.stringify({ sessionId, prompt, userId, userLocation }),
```

- [ ] **Step 4: Request location only for route-like prompts**

Modify `frontend/src/App.tsx` imports:

```ts
import { getCurrentLocation, promptLikelyNeedsLocation } from "./lib/geolocation";
import type { ChatMessage, SessionSummary, UserLocation } from "./lib/types";
```

Inside `send`, before `streamChat()`:

```ts
let userLocation: UserLocation | null = null;
if (promptLikelyNeedsLocation(prompt)) {
  try {
    userLocation = await getCurrentLocation();
  } catch (err) {
    console.warn("geolocation unavailable:", err);
  }
}
```

Pass it:

```ts
for await (const ev of streamChat({
  sessionId: activeId,
  prompt,
  userId,
  userLocation
})) {
```

- [ ] **Step 5: Forward location through backend**

Modify `backend/handler.mjs` in `handleChat()`:

```js
const userLocation = body.userLocation && typeof body.userLocation === "object"
  ? {
      lat: Number(body.userLocation.lat),
      lng: Number(body.userLocation.lng),
      accuracy: body.userLocation.accuracy == null ? undefined : Number(body.userLocation.accuracy),
      capturedAt: body.userLocation.capturedAt == null ? undefined : Number(body.userLocation.capturedAt)
    }
  : null;
```

Change AgentCore payload:

```js
payload: new TextEncoder().encode(JSON.stringify({ prompt, userId, userLocation }))
```

- [ ] **Step 6: Add user location context to MainAgent prompt**

Modify `serverlessstrands/app/MainAgent/main.py` in `invoke()`:

```python
user_location = payload.get("userLocation")
if isinstance(user_location, dict) and "lat" in user_location and "lng" in user_location:
    prompt = (
        prompt
        + "\n\n<user_location>"
        + json.dumps(user_location)
        + "</user_location>"
    )
```

- [ ] **Step 7: Run frontend and backend syntax checks**

Run:

```bash
npm --prefix frontend run build
node --check backend/handler.mjs
python3 -m py_compile serverlessstrands/app/MainAgent/main.py
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit Milestone 4**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/geolocation.ts frontend/src/App.tsx backend/handler.mjs serverlessstrands/app/MainAgent/main.py
git commit -m "feat: pass user location to agent runtime"
```

## Milestone 5: Route Preview Event Protocol

**Files:**
- Create: `serverlessstrands/app/MainAgent/ui_events.py`
- Modify: `serverlessstrands/app/MainAgent/main.py`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `backend/handler.mjs`

- [ ] **Step 1: Create MainAgent UI event queue and tool**

Create `serverlessstrands/app/MainAgent/ui_events.py`:

```python
import json
import queue

from strands import tool

route_preview_queue: queue.Queue[dict] = queue.Queue()


@tool
def show_route_preview(route_preview_json: str) -> str:
    """Show a route preview card in the chat UI.

    route_preview_json must include destinationLabel, distanceText, durationText,
    travelMode, mapsUrl, and may include eventId, calendarId, minutesBefore.
    """
    try:
        payload = json.loads(route_preview_json)
    except json.JSONDecodeError:
        return "Invalid route preview JSON."

    required = ["destinationLabel", "distanceText", "durationText", "travelMode", "mapsUrl"]
    missing = [key for key in required if not payload.get(key)]
    if missing:
        return f"Missing route preview fields: {', '.join(missing)}"

    route_preview_queue.put_nowait(payload)
    return "Route preview sent to the chat UI."
```

- [ ] **Step 2: Add the UI event tool and queue flush**

Modify `serverlessstrands/app/MainAgent/main.py` imports:

```python
from ui_events import show_route_preview, route_preview_queue
```

Append the tool:

```python
tools.append(show_route_preview)
```

Flush route preview events inside the stream loop after auth URL queue flushing:

```python
while not route_preview_queue.empty():
    try:
        preview = route_preview_queue.get_nowait()
        yield json.dumps({"__route_preview__": preview})
    except Empty:
        break
```

- [ ] **Step 3: Pass through `route_preview` from backend**

Modify `backend/handler.mjs` in `flushFrame()` wherever `__auth_url__` is handled:

```js
if (inner && typeof inner === "object" && inner.__route_preview__) {
  writeFrame("route_preview", inner.__route_preview__);
  continue;
}
```

Add the same branch for non-string outer objects:

```js
} else if (typeof outer === "object" && outer.__route_preview__) {
  writeFrame("route_preview", outer.__route_preview__);
  continue;
```

- [ ] **Step 4: Add frontend stream event type and parser**

Modify `frontend/src/lib/types.ts`:

```ts
export interface RoutePreview {
  originLabel?: string;
  destinationLabel: string;
  distanceMeters?: number;
  distanceText: string;
  durationSeconds?: number;
  durationText: string;
  travelMode: string;
  polyline?: string;
  mapsUrl: string;
  eventId?: string;
  calendarId?: string;
  minutesBefore?: number;
}
```

Add to `StreamEvent`:

```ts
| { type: "route_preview"; preview: RoutePreview }
```

Modify `frontend/src/lib/api.ts` parser:

```ts
case "route_preview":
  return { type: "route_preview", preview: safeJson(body) as unknown as RoutePreview };
```

Change `safeJson` return type:

```ts
function safeJson(input: string): Record<string, unknown> | null {
```

- [ ] **Step 5: Store previews on assistant messages**

Modify `frontend/src/lib/types.ts`:

```ts
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools?: ToolUse[];
  routePreviews?: RoutePreview[];
}
```

Modify `frontend/src/App.tsx` stream switch:

```ts
case "route_preview":
  setMessages((prev) => {
    const next = [...prev];
    const last = next[next.length - 1];
    if (last?.role === "assistant") {
      next[next.length - 1] = {
        ...last,
        routePreviews: [...(last.routePreviews ?? []), ev.preview]
      };
    }
    return next;
  });
  break;
```

- [ ] **Step 6: Run protocol checks**

Run:

```bash
npm --prefix frontend run build
node --check backend/handler.mjs
python3 -m py_compile serverlessstrands/app/MainAgent/main.py serverlessstrands/app/MainAgent/ui_events.py
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit Milestone 5**

```bash
git add serverlessstrands/app/MainAgent/ui_events.py serverlessstrands/app/MainAgent/main.py backend/handler.mjs frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/App.tsx
git commit -m "feat: add route preview stream events"
```

## Milestone 6: Route Preview UI + Reminder Action

**Files:**
- Create: `frontend/src/components/RoutePreviewCard.tsx`
- Modify: `frontend/src/components/MessageList.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.css`

- [ ] **Step 1: Create route card component**

Create `frontend/src/components/RoutePreviewCard.tsx`:

```tsx
import type { RoutePreview } from "../lib/types";

interface Props {
  preview: RoutePreview;
  onSetReminder?: (preview: RoutePreview) => void;
}

export function RoutePreviewCard({ preview, onSetReminder }: Props) {
  return (
    <div className="route-card">
      <div className="route-card__map" aria-hidden>
        <div className="route-card__line" />
        <span className="route-card__pin route-card__pin--start" />
        <span className="route-card__pin route-card__pin--end" />
      </div>
      <div className="route-card__body">
        <div className="route-card__label mono">{preview.travelMode.toLowerCase()}</div>
        <div className="route-card__title">{preview.destinationLabel}</div>
        <div className="route-card__meta">
          <span>{preview.durationText}</span>
          <span>{preview.distanceText}</span>
        </div>
        <div className="route-card__actions">
          <a className="route-card__button" href={preview.mapsUrl} target="_blank" rel="noreferrer">
            open maps
          </a>
          {preview.eventId && onSetReminder && (
            <button className="route-card__button" onClick={() => onSetReminder(preview)}>
              set reminder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render route cards inside assistant messages**

Modify `frontend/src/components/MessageList.tsx`:

```tsx
import { RoutePreviewCard } from "./RoutePreviewCard";
import type { ChatMessage, RoutePreview, ToolUse } from "../lib/types";
```

Update props:

```tsx
interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  empty: boolean;
  onSetReminder?: (preview: RoutePreview) => void;
}
```

Pass `onSetReminder` through `MessageList` to `Message`, and render after text:

```tsx
{message.routePreviews && message.routePreviews.length > 0 && (
  <div className="msg__route-previews">
    {message.routePreviews.map((preview, idx) => (
      <RoutePreviewCard
        key={`${preview.destinationLabel}-${idx}`}
        preview={preview}
        onSetReminder={onSetReminder}
      />
    ))}
  </div>
)}
```

- [ ] **Step 3: Add reminder action in App**

Modify `frontend/src/App.tsx`:

```ts
const setReminderFromPreview = useCallback(
  (preview: RoutePreview) => {
    if (!preview.eventId) return;
    const minutes = preview.minutesBefore ?? Math.max(10, Math.ceil((preview.durationSeconds ?? 1800) / 60) + 10);
    void send(
      `Set a popup reminder ${minutes} minutes before calendar event ${preview.eventId} on calendar ${preview.calendarId ?? "primary"}.`
    );
  },
  [send]
);
```

Pass to `MessageList`:

```tsx
<MessageList
  messages={messages}
  streaming={streaming}
  error={error}
  empty={!activeId && messages.length === 0}
  onSetReminder={setReminderFromPreview}
/>
```

- [ ] **Step 4: Add route card CSS**

Modify `frontend/src/App.css`:

```css
.msg__route-previews {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.route-card {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.045);
}

.route-card__map {
  position: relative;
  min-height: 112px;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px),
    linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 24px 24px;
}

.route-card__line {
  position: absolute;
  left: 28px;
  right: 28px;
  top: 54px;
  height: 3px;
  background: #7dd3fc;
  transform: rotate(-18deg);
  transform-origin: center;
}

.route-card__pin {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #f8fafc;
  border: 2px solid #111827;
}

.route-card__pin--start {
  left: 22px;
  top: 66px;
}

.route-card__pin--end {
  right: 22px;
  top: 36px;
  background: #f97316;
}

.route-card__body {
  min-width: 0;
  padding: 14px;
}

.route-card__label {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
}

.route-card__title {
  margin-top: 4px;
  font-size: 15px;
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.94);
}

.route-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
}

.route-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.route-card__button {
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  padding: 6px 9px;
  font: inherit;
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
}

@media (max-width: 640px) {
  .route-card {
    grid-template-columns: 1fr;
  }

  .route-card__map {
    min-height: 88px;
  }
}
```

- [ ] **Step 5: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: build exits 0.

- [ ] **Step 6: Commit Milestone 6**

```bash
git add frontend/src/components/RoutePreviewCard.tsx frontend/src/components/MessageList.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: render route previews in chat"
```

## Milestone 7: Agent Routing Prompt and End-to-End Flow

**Files:**
- Modify: `serverlessstrands/app/MainAgent/main.py`
- Modify: `README.md`
- Create: `docs/google-mobility-assistant.md`
- Modify: `docs/agentcore-inventory.md`

- [ ] **Step 1: Update MainAgent system prompt**

Modify `DEFAULT_SYSTEM_PROMPT` in `serverlessstrands/app/MainAgent/main.py` by adding:

```text
For route planning from calendar events:
1. Use Google Calendar tools to find the relevant event.
2. If the event has a location, resolve it with Google Maps geocode or place search.
3. If <user_location> is present, use it as the route origin.
4. Use google_maps_route_preview for the route payload.
5. Call show_route_preview with the route payload and include eventId/calendarId when the route is for a Calendar event.
6. Do not set Calendar reminders unless the user explicitly asks or confirms.
```

- [ ] **Step 2: Document user flows**

Create `docs/google-mobility-assistant.md`:

```markdown
# Google Mobility Assistant

## Supported Flow

User asks how to get to a Calendar event location.

The app:

1. Requests browser geolocation only for route-like prompts.
2. Sends `userLocation` to the backend for that request.
3. MainAgent reads Calendar events through AgentCore Identity 3LO.
4. MainAgent resolves event `location` through Google Maps Gateway tools.
5. MainAgent computes a route preview.
6. MainAgent emits `route_preview`.
7. Frontend renders a route card and offers a reminder action.

## Smoke Prompts

```text
오늘 위치가 있는 일정 중 다음 일정까지 어떻게 가?
```

```text
Find my next calendar event with a location and show a driving route from my current location.
```

```text
Set a popup reminder 40 minutes before that event.
```

## Privacy

The frontend sends current location only when a route-like prompt is detected. The backend does not persist `userLocation` separately. The route card may contain map URLs and destination labels in the assistant message history.
```

- [ ] **Step 3: Add README feature row**

Modify `README.md` feature status:

```markdown
- [x] Google Mobility Assistant — Calendar event location + Maps route preview + reminder confirmation
```

Add a gotcha:

```markdown
8. **Browser geolocation is per-request context** — do not store current location in Memory or DynamoDB unless product requirements change and user consent is explicit.
```

- [ ] **Step 4: Run full local verification**

Run:

```bash
python3 -m unittest discover -s tools/google-maps/tests -p 'test_*.py'
cd serverlessstrands/app/MainAgent && uv run pytest tests/test_google_calendar_tools.py -q
cd ../../..
node --check backend/handler.mjs
npm --prefix frontend run build
python3 scripts/audit_agentcore_resources.py --profile developer-dongik
```

Expected:
- Maps tests PASS.
- Calendar tests PASS.
- Backend syntax check exits 0.
- Frontend build exits 0.
- AgentCore audit exits 0 with only the known Registry warning.

- [ ] **Step 5: Deploy and smoke test**

Run:

```bash
AWS_PROFILE=developer-dongik AWS_REGION=ap-northeast-2 ./scripts/deploy.sh
terraform -chdir=infra/envs/dev apply -var-file=terraform.tfvars
npm --prefix frontend run build
```

Deploy frontend through the existing S3/CloudFront process from `README.md`.

Manual smoke:

```text
Find my next calendar event with a location and show a route from my current location.
```

Expected:
- Browser asks for location permission.
- Assistant uses Calendar and Google Maps tools.
- A route card appears.
- Open Maps link opens a route.
- Set reminder action triggers Calendar reminder tool.

- [ ] **Step 6: Commit Milestone 7**

```bash
git add serverlessstrands/app/MainAgent/main.py README.md docs/google-mobility-assistant.md docs/agentcore-inventory.md
git commit -m "docs: add google mobility assistant runbook"
```

## Milestone 8: Safety and Quality Pass

**Files:**
- Modify: `frontend/src/lib/geolocation.ts`
- Modify: `backend/handler.mjs`
- Modify: `serverlessstrands/app/MainAgent/main.py`
- Modify: `docs/google-mobility-assistant.md`

- [ ] **Step 1: Verify location is not persisted separately**

Check:

```bash
rg -n "userLocation|lat|lng|capturedAt" backend frontend serverlessstrands/app/MainAgent
```

Expected:
- `userLocation` appears in request forwarding, prompt context, and frontend state only.
- `appendMessage()` stores user prompt and assistant text, not raw separate location fields.

- [ ] **Step 2: Confirm reminders require user intent**

Check:

```bash
rg -n "google_calendar_set_event_reminder|set reminder|show_route_preview" serverlessstrands/app/MainAgent frontend/src
```

Expected:
- `google_calendar_set_event_reminder` exists as a tool.
- Route card button or explicit user prompt triggers reminder.
- System prompt tells the model not to set reminders without confirmation.

- [ ] **Step 3: Add final smoke checklist**

Append to `docs/google-mobility-assistant.md`:

```markdown
## Release Checklist

- [ ] Route prompt without browser location permission returns a useful fallback.
- [ ] Route prompt with permission renders a route card.
- [ ] Calendar event without location asks the user which destination to use.
- [ ] Calendar event with ambiguous location uses Maps place search before routing.
- [ ] Reminder action sets one popup reminder and preserves event title, time, attendees, and location.
- [ ] Raw Google Maps API key never appears in logs, frontend bundle, README, or Git history.
```

- [ ] **Step 4: Run final verification**

Run:

```bash
git diff --check
python3 -m unittest discover -s tools/google-maps/tests -p 'test_*.py'
cd serverlessstrands/app/MainAgent && uv run pytest tests/test_google_calendar_tools.py -q
cd ../../..
npm --prefix frontend run build
node --check backend/handler.mjs
python3 scripts/audit_agentcore_resources.py --profile developer-dongik
```

Expected: all checks pass; audit may include the known Registry warning.

- [ ] **Step 5: Commit Milestone 8**

```bash
git add frontend/src/lib/geolocation.ts backend/handler.mjs serverlessstrands/app/MainAgent/main.py docs/google-mobility-assistant.md
git commit -m "chore: harden google mobility flow"
```

## Implementation Order

1. M1 Calendar Location + Reminder Tools
2. M2 Google Maps Gateway Lambda Tool
3. M3 Gateway Target Registration
4. M4 Location-Aware Chat Request
5. M5 Route Preview Event Protocol
6. M6 Route Preview UI + Reminder Action
7. M7 Agent Routing Prompt and End-to-End Flow
8. M8 Safety and Quality Pass

## Completion Definition

This feature is complete when:

- Calendar can return location-bearing events and set reminders.
- Google Maps Gateway target exposes geocode, place search, compute route, and route preview tools.
- Browser geolocation is requested only for route-like prompts and is forwarded per request.
- MainAgent can emit `route_preview` events.
- Backend passes `route_preview` SSE frames through.
- Frontend renders route cards and can ask the agent to set a reminder.
- Full smoke flow works from deployed CloudFront UI.
- API keys and current location are not leaked into frontend code, docs, logs, or persistent storage beyond the assistant message content required for the conversation.

## Self-Review

- Spec coverage: The plan covers Calendar event location lookup, Maps route computation, current-location routing, chat preview rendering, and reminder setting.
- Placeholder scan: The plan has no unresolved placeholder markers, empty implementation references, or unnamed files. Secret values are explicitly excluded and represented only by ARN variables.
- Type consistency: `UserLocation`, `RoutePreview`, `route_preview`, `google_maps_route_preview`, and `google_calendar_set_event_reminder` names are used consistently across frontend, backend, and agent tasks.
