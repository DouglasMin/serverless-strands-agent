import json
from datetime import datetime, timezone

from oauth_tools.google_calendar import (
    _build_event_with_reminder,
    _calendar_window_params,
    _events_with_locations,
    _format_event,
    _today_window_params,
)
from temporal_context import build_temporal_context


def test_calendar_window_params_use_seoul_current_time_for_upcoming_events():
    now = datetime(2026, 7, 9, 16, 30, tzinfo=timezone.utc)

    params = _calendar_window_params(now=now, days_ahead=7, max_results=10)

    assert params["timeMin"] == "2026-07-10T01:30:00+09:00"
    assert params["timeMax"] == "2026-07-17T01:30:00+09:00"
    assert params["singleEvents"] == "true"
    assert params["orderBy"] == "startTime"


def test_calendar_window_params_clamp_negative_days_to_upcoming_today():
    now = datetime(2026, 7, 10, 9, 0, tzinfo=timezone.utc)

    params = _calendar_window_params(now=now, days_ahead=-7, max_results=10)

    assert params["timeMin"] == "2026-07-10T18:00:00+09:00"
    assert params["timeMax"] == "2026-07-11T18:00:00+09:00"


def test_today_window_params_use_seoul_day_bounds():
    now = datetime(2026, 7, 9, 16, 30, tzinfo=timezone.utc)

    params = _today_window_params(now=now)

    assert params["timeMin"] == "2026-07-10T00:00:00+09:00"
    assert params["timeMax"] == "2026-07-10T23:59:59+09:00"


def test_temporal_context_includes_current_date_and_relative_calendar_rule():
    now = datetime(2026, 7, 9, 16, 30, tzinfo=timezone.utc)

    context = build_temporal_context(now=now)

    assert "current_date=\"2026-07-10\"" in context
    assert "timezone=\"Asia/Seoul\"" in context
    assert "Relative calendar requests like today, this week, and next 7 days are based on current_date" in context


def test_events_with_locations_filters_blank_locations():
    events = [
        {
            "id": "evt-1",
            "summary": "Lunch",
            "location": "Example Station",
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
            "location": "Example Cafe",
            "start": {"dateTime": "2026-07-11T19:00:00+09:00"},
            "end": {"dateTime": "2026-07-11T20:00:00+09:00"},
        },
    ]

    result = _events_with_locations(events)

    assert [event["id"] for event in result] == ["evt-1", "evt-3"]
    assert result[0]["location"] == "Example Station"


def test_build_event_with_reminder_preserves_existing_event_fields():
    existing = {
        "id": "evt-1",
        "summary": "Meeting",
        "location": "Example Office",
        "start": {"dateTime": "2026-07-11T15:00:00+09:00"},
        "end": {"dateTime": "2026-07-11T16:00:00+09:00"},
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email", "minutes": 1440},
                {"method": "popup", "minutes": 10},
            ],
        },
    }

    updated = _build_event_with_reminder(existing, minutes_before=40, method="popup")

    assert updated["summary"] == "Meeting"
    assert updated["location"] == "Example Office"
    assert updated["reminders"] == {
        "useDefault": False,
        "overrides": [
            {"method": "email", "minutes": 1440},
            {"method": "popup", "minutes": 40},
        ],
    }


def test_format_event_includes_reminders():
    event = {
        "id": "evt-1",
        "summary": "Meeting",
        "location": "Example Office",
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
