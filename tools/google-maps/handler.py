"""
Google Maps Tool Lambda - AgentCore Gateway target.

Provides geocoding, Places text search, route computation, and route preview
payloads backed by a Google Maps Platform API key in Secrets Manager.
"""

import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

import boto3
from botocore.config import Config

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DELIMITER = "___"
REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
SECRET_ARN = os.environ.get("GOOGLE_MAPS_SECRET_ARN", "")

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"

VALID_TRAVEL_MODES = {"DRIVE", "WALK", "BICYCLE", "TRANSIT"}
DEFAULT_FIELD_MASK = (
    "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,"
    "routes.localizedValues,routes.legs.startLocation,routes.legs.endLocation"
)

_cached_api_key: str | None = None
_secrets_client: Any | None = None


def _get_secrets_client() -> Any:
    global _secrets_client
    if _secrets_client is None:
        config = Config(
            retries={"total_max_attempts": 3, "mode": "standard"},
            connect_timeout=3,
            read_timeout=5,
        )
        _secrets_client = boto3.client("secretsmanager", region_name=REGION, config=config)
    return _secrets_client


def _get_api_key() -> str:
    global _cached_api_key
    if _cached_api_key:
        return _cached_api_key
    if not SECRET_ARN:
        raise RuntimeError("GOOGLE_MAPS_SECRET_ARN is required")

    resp = _get_secrets_client().get_secret_value(SecretId=SECRET_ARN)
    secret_string = resp.get("SecretString")
    if not secret_string:
        raise RuntimeError("Google Maps API key secret must contain SecretString")

    _cached_api_key = _extract_api_key_from_secret_string(secret_string)
    return _cached_api_key


def _extract_api_key_from_secret_string(secret_string: str) -> str:
    stripped = secret_string.strip()
    if not stripped:
        raise RuntimeError("Google Maps API key secret is empty")

    try:
        secret = json.loads(stripped)
    except json.JSONDecodeError:
        secret = None

    if isinstance(secret, dict):
        api_key = secret.get("api_key_value") or secret.get("GOOGLE_MAPS_API_KEY")
        if api_key:
            return str(api_key).strip()
    elif isinstance(secret, str) and secret.strip():
        return secret.strip()

    if stripped.startswith("AIza"):
        return stripped

    match = re.search(r"AIza[0-9A-Za-z_-]{10,}", stripped)
    if match:
        return match.group(0)

    raise RuntimeError("Google Maps API key not found in secret")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    tool_name = _extract_tool_name(context)
    logger.info("tool=%s", tool_name)

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
    except ValueError as e:
        logger.warning("tool=%s validation_error=%s", tool_name, str(e))
        return _error(str(e))
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        logger.error("tool=%s google_maps_request_failed", tool_name, exc_info=True)
        return _error("Google Maps request failed")
    except Exception:
        logger.error("tool=%s unexpected_error", tool_name, exc_info=True)
        return _error("An internal error occurred")


def _extract_tool_name(context: Any) -> str:
    try:
        return _extract_tool_name_from_raw(
            context.client_context.custom["bedrockAgentCoreToolName"]
        )
    except (AttributeError, KeyError, TypeError):
        return "unknown"


def _extract_tool_name_from_raw(raw: str) -> str:
    if DELIMITER in raw:
        return raw[raw.index(DELIMITER) + len(DELIMITER) :]
    return raw


def _request_json(
    url: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def _lat_lng(value: Any, field_name: str) -> dict[str, float]:
    if not isinstance(value, dict):
        raise ValueError(f"{field_name} must be an object with lat and lng")
    try:
        return {"lat": float(value["lat"]), "lng": float(value["lng"])}
    except (KeyError, TypeError, ValueError) as e:
        raise ValueError(f"{field_name} must include numeric lat and lng") from e


def _travel_mode(value: Any) -> str:
    mode = str(value or "DRIVE").upper()
    if mode not in VALID_TRAVEL_MODES:
        raise ValueError("travel_mode must be one of: DRIVE, WALK, BICYCLE, TRANSIT")
    return mode


def _maps_url(
    origin: dict[str, float],
    destination: dict[str, float],
    travel_mode: str,
) -> str:
    mode = {
        "DRIVE": "driving",
        "WALK": "walking",
        "BICYCLE": "bicycling",
        "TRANSIT": "transit",
    }.get(travel_mode.upper(), "driving")
    query = urllib.parse.urlencode(
        {
            "api": "1",
            "origin": f"{origin['lat']},{origin['lng']}",
            "destination": f"{destination['lat']},{destination['lng']}",
            "travelmode": mode,
        },
        safe=",",
    )
    return f"https://www.google.com/maps/dir/?{query}"


def _duration_seconds(duration: str) -> int:
    if duration.endswith("s"):
        try:
            return int(float(duration.removesuffix("s")))
        except ValueError:
            return 0
    return 0


def _route_preview_payload(
    route: dict[str, Any],
    origin_label: str,
    destination_label: str,
    travel_mode: str,
) -> dict[str, Any]:
    leg = (route.get("legs") or [{}])[0]
    start = leg.get("startLocation", {}).get("latLng", {})
    end = leg.get("endLocation", {}).get("latLng", {})
    origin = {"lat": start.get("latitude"), "lng": start.get("longitude")}
    destination = {"lat": end.get("latitude"), "lng": end.get("longitude")}
    localized = route.get("localizedValues", {})

    return {
        "originLabel": origin_label,
        "destinationLabel": destination_label,
        "origin": origin,
        "destination": destination,
        "distanceMeters": route.get("distanceMeters"),
        "distanceText": localized.get("distance", {}).get("text", ""),
        "durationSeconds": _duration_seconds(str(route.get("duration", ""))),
        "durationText": localized.get("duration", {}).get("text", ""),
        "travelMode": travel_mode.upper(),
        "polyline": route.get("polyline", {}).get("encodedPolyline", ""),
        "mapsUrl": _maps_url(origin, destination, travel_mode),
        "routeStatus": "ROUTE_OK",
    }


def _route_map_payload(
    params: dict[str, Any],
    reason: str,
) -> dict[str, Any]:
    origin = _lat_lng(params.get("origin"), "origin")
    destination = _lat_lng(params.get("destination"), "destination")
    travel_mode = _travel_mode(params.get("travel_mode"))
    return {
        "originLabel": str(params.get("origin_label", "Origin")),
        "destinationLabel": str(params.get("destination_label", "Destination")),
        "origin": origin,
        "destination": destination,
        "travelMode": travel_mode,
        "mapsUrl": _maps_url(origin, destination, travel_mode),
        "routeStatus": "MAP_ONLY",
        "routeError": reason,
    }


def google_maps_geocode(params: dict[str, Any]) -> dict[str, Any]:
    query = str(params.get("query", "")).strip()
    if not query:
        return _error("query is required")

    url = GEOCODE_URL + "?" + urllib.parse.urlencode(
        {"address": query, "key": _get_api_key()}
    )
    data = _request_json(url)

    results = []
    for item in data.get("results", [])[:5]:
        location = item.get("geometry", {}).get("location", {})
        results.append(
            {
                "formattedAddress": item.get("formatted_address"),
                "placeId": item.get("place_id"),
                "lat": location.get("lat"),
                "lng": location.get("lng"),
            }
        )
    return _ok_json(results)


def google_maps_place_search(params: dict[str, Any]) -> dict[str, Any]:
    query = str(params.get("query", "")).strip()
    if not query:
        return _error("query is required")

    body: dict[str, Any] = {
        "textQuery": query,
        "maxResultCount": min(max(int(params.get("max_results", 5)), 1), 10),
    }
    location = params.get("location")
    if isinstance(location, dict) and "lat" in location and "lng" in location:
        body["locationBias"] = {
            "circle": {
                "center": {
                    "latitude": float(location["lat"]),
                    "longitude": float(location["lng"]),
                },
                "radius": 5000.0,
            }
        }

    data = _request_json(
        PLACES_TEXT_SEARCH_URL,
        method="POST",
        body=body,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": _get_api_key(),
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,places.location"
            ),
        },
    )

    places = []
    for place in data.get("places", []):
        loc = place.get("location", {})
        places.append(
            {
                "placeId": place.get("id"),
                "name": place.get("displayName", {}).get("text"),
                "formattedAddress": place.get("formattedAddress"),
                "lat": loc.get("latitude"),
                "lng": loc.get("longitude"),
            }
        )
    return _ok_json(places)


def google_maps_compute_route(params: dict[str, Any]) -> dict[str, Any]:
    origin = _lat_lng(params.get("origin"), "origin")
    destination = _lat_lng(params.get("destination"), "destination")
    travel_mode = _travel_mode(params.get("travel_mode"))

    body = {
        "origin": {
            "location": {
                "latLng": {"latitude": origin["lat"], "longitude": origin["lng"]}
            }
        },
        "destination": {
            "location": {
                "latLng": {
                    "latitude": destination["lat"],
                    "longitude": destination["lng"],
                }
            }
        },
        "travelMode": travel_mode,
        "computeAlternativeRoutes": bool(params.get("alternatives", False)),
        "languageCode": params.get("language_code", "en"),
        "units": "METRIC",
    }
    if travel_mode == "DRIVE":
        body["routingPreference"] = "TRAFFIC_AWARE"

    data = _request_json(
        ROUTES_URL,
        method="POST",
        body=body,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": _get_api_key(),
            "X-Goog-FieldMask": DEFAULT_FIELD_MASK,
        },
    )
    return _ok_json(data.get("routes", []))


def google_maps_route_preview(params: dict[str, Any]) -> dict[str, Any]:
    route_response = google_maps_compute_route(params)
    if route_response.get("statusCode") != 200:
        try:
            error = json.loads(route_response.get("body", "{}")).get("error")
        except json.JSONDecodeError:
            error = None
        return _ok_json(
            _route_map_payload(params, reason=str(error or "Route computation failed"))
        )

    route_result = json.loads(route_response["body"])["content"][0]["json"]
    routes = route_result if isinstance(route_result, list) else []
    if not routes:
        return _ok_json(_route_map_payload(params, reason="No route found"))

    payload = _route_preview_payload(
        route=routes[0],
        origin_label=str(params.get("origin_label", "Origin")),
        destination_label=str(params.get("destination_label", "Destination")),
        travel_mode=_travel_mode(params.get("travel_mode")),
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
