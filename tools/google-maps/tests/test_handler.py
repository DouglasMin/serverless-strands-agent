import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from handler import (
    _extract_api_key_from_secret_string,
    _extract_tool_name_from_raw,
    _maps_url,
    _route_preview_payload,
    google_maps_geocode,
    google_maps_place_search,
    google_maps_route_preview,
)

ORIGIN = {"lat": 1.25, "lng": 2.5}
DESTINATION = {"lat": 3.75, "lng": 4.0}
ROUTE_START = {
    "startLocation": {
        "latLng": {"latitude": ORIGIN["lat"], "longitude": ORIGIN["lng"]}
    }
}
ROUTE_END = {
    "endLocation": {
        "latLng": {
            "latitude": DESTINATION["lat"],
            "longitude": DESTINATION["lng"],
        }
    }
}


class GoogleMapsHandlerTests(unittest.TestCase):
    def test_extract_tool_name_from_agentcore_context_value(self):
        self.assertEqual(
            _extract_tool_name_from_raw("gateway___google_maps_compute_route"),
            "google_maps_compute_route",
        )
        self.assertEqual(
            _extract_tool_name_from_raw("google_maps_geocode"),
            "google_maps_geocode",
        )

    def test_extract_api_key_from_json_secret(self):
        self.assertEqual(
            _extract_api_key_from_secret_string('{"api_key_value":"AIzaTEST_123"}'),
            "AIzaTEST_123",
        )

    def test_extract_api_key_from_plaintext_secret(self):
        self.assertEqual(
            _extract_api_key_from_secret_string("AIzaPLAINTEXT_123"),
            "AIzaPLAINTEXT_123",
        )

    def test_extract_api_key_from_malformed_secret_without_exposing_it(self):
        self.assertEqual(
            _extract_api_key_from_secret_string('{api_key_value:"AIzaBROKEN_123"}'),
            "AIzaBROKEN_123",
        )

    def test_maps_url_uses_coordinates_without_spaces(self):
        url = _maps_url(
            origin=ORIGIN,
            destination=DESTINATION,
            travel_mode="DRIVE",
        )

        self.assertIn("api=1", url)
        self.assertIn("origin=1.25,2.5", url)
        self.assertIn("destination=3.75,4.0", url)
        self.assertIn("travelmode=driving", url)

    def test_route_preview_payload_extracts_primary_route(self):
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
                    **ROUTE_START,
                    **ROUTE_END,
                }
            ],
        }

        payload = _route_preview_payload(
            route=route,
            origin_label="Origin",
            destination_label="Destination",
            travel_mode="DRIVE",
        )

        self.assertEqual(payload["distanceText"], "8.4 km")
        self.assertEqual(payload["durationText"], "32 min")
        self.assertEqual(payload["polyline"], "abc123")
        self.assertEqual(payload["destinationLabel"], "Destination")
        self.assertEqual(payload["origin"], ORIGIN)
        self.assertEqual(payload["destination"], DESTINATION)

    @patch("handler._get_api_key", return_value="fake-key")
    @patch("handler._request_json")
    def test_geocode_shapes_results_without_exposing_api_key(self, request_json, _api_key):
        request_json.return_value = {
            "results": [
                {
                    "formatted_address": "Example Place",
                    "place_id": "place-1",
                    "geometry": {
                        "location": {
                            "lat": DESTINATION["lat"],
                            "lng": DESTINATION["lng"],
                        }
                    },
                }
            ]
        }

        response = google_maps_geocode({"query": "Example Place"})
        body = json.loads(response["body"])

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(
            body["content"][0]["json"][0]["formattedAddress"],
            "Example Place",
        )
        self.assertNotIn("fake-key", json.dumps(body))

    @patch("handler._get_api_key", return_value="fake-key")
    @patch("handler._request_json")
    def test_place_search_adds_location_bias_when_location_is_present(
        self, request_json, _api_key
    ):
        request_json.return_value = {
            "places": [
                {
                    "id": "place-1",
                    "displayName": {"text": "Example Place"},
                    "formattedAddress": "Example Address",
                    "location": {
                        "latitude": DESTINATION["lat"],
                        "longitude": DESTINATION["lng"],
                    },
                }
            ]
        }

        response = google_maps_place_search(
            {
                "query": "Example Place",
                "location": ORIGIN,
                "max_results": 3,
            }
        )

        sent_body = request_json.call_args.kwargs["body"]
        self.assertEqual(sent_body["maxResultCount"], 3)
        self.assertEqual(
            sent_body["locationBias"]["circle"]["center"],
            {"latitude": ORIGIN["lat"], "longitude": ORIGIN["lng"]},
        )
        self.assertEqual(
            json.loads(response["body"])["content"][0]["json"][0]["name"],
            "Example Place",
        )

    @patch("handler.google_maps_compute_route")
    def test_route_preview_computes_route_and_returns_payload(self, compute_route):
        compute_route.return_value = {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "content": [
                        {
                            "type": "json",
                            "json": [
                                {
                                    "distanceMeters": 8400,
                                    "duration": "1920s",
                                    "polyline": {"encodedPolyline": "abc123"},
                                    "localizedValues": {
                                        "distance": {"text": "8.4 km"},
                                        "duration": {"text": "32 min"},
                                    },
                                    "legs": [
                                        {
                                            **ROUTE_START,
                                            **ROUTE_END,
                                        }
                                    ],
                                }
                            ],
                        }
                    ]
                }
            ),
        }

        response = google_maps_route_preview(
            {
                "origin": ORIGIN,
                "destination": DESTINATION,
                "destination_label": "Destination",
            }
        )

        payload = json.loads(response["body"])["content"][0]["json"]
        self.assertEqual(payload["distanceMeters"], 8400)
        self.assertEqual(payload["destinationLabel"], "Destination")
        self.assertEqual(payload["routeStatus"], "ROUTE_OK")

    @patch("handler.google_maps_compute_route")
    def test_route_preview_returns_map_only_payload_when_route_is_unavailable(
        self, compute_route
    ):
        compute_route.return_value = {
            "statusCode": 200,
            "body": json.dumps({"content": [{"type": "json", "json": []}]}),
        }

        response = google_maps_route_preview(
            {
                "origin": ORIGIN,
                "destination": DESTINATION,
                "origin_label": "Origin",
                "destination_label": "Destination",
                "travel_mode": "WALK",
            }
        )

        payload = json.loads(response["body"])["content"][0]["json"]
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(payload["routeStatus"], "MAP_ONLY")
        self.assertEqual(payload["routeError"], "No route found")
        self.assertNotIn("distanceText", payload)
        self.assertNotIn("durationText", payload)
        self.assertEqual(payload["origin"], ORIGIN)
        self.assertEqual(payload["destination"], DESTINATION)
        self.assertIn("travelmode=walking", payload["mapsUrl"])


if __name__ == "__main__":
    unittest.main()
