import urllib.request
import urllib.parse
import json
from datetime import datetime, timezone, timedelta
from typing import Any

from strands import tool
from oauth_tools import get_oauth_token, auth_url_queue

PROVIDER_NAME = "google-calendar-provider"
SCOPES = ["https://www.googleapis.com/auth/calendar"]
CALENDAR_API = "https://www.googleapis.com/calendar/v3"


def _gcal_request(
    path: str, token: str, method: str = "GET",
    params: dict[str, str] | None = None, body: Any = None,
) -> Any:
    url = f"{CALENDAR_API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        if not raw:
            return {}
        return json.loads(raw)


def _get_token_or_auth_url() -> tuple[str | None, str | None]:
    result = get_oauth_token(PROVIDER_NAME, SCOPES)
    if "token" in result:
        return result["token"], None
    if "auth_url" in result:
        return None, result["auth_url"]
    return None, None


def _handle_auth(auth_url: str) -> str:
    auth_url_queue.put_nowait(auth_url)
    return "Google Calendar authorization required. A login popup has been sent to the user. Please wait for them to complete authorization and try again."


def _format_event(ev: dict) -> dict:
    start = ev.get("start", {})
    end = ev.get("end", {})
    return {
        "id": ev.get("id", ""),
        "summary": ev.get("summary", "(no title)"),
        "start": start.get("dateTime") or start.get("date", ""),
        "end": end.get("dateTime") or end.get("date", ""),
        "location": ev.get("location"),
        "status": ev.get("status"),
        "description": ev.get("description"),
        "htmlLink": ev.get("htmlLink"),
        "attendees": [
            {"email": a.get("email"), "status": a.get("responseStatus")}
            for a in ev.get("attendees", [])
        ] or None,
    }


# ── Utility Tools ────────────────────────────────────────────────────


@tool
def google_calendar_date_info(date_str: str) -> str:
    """Get the day of week and calendar context for a given date.

    Use this to check what day a date falls on before creating events.

    date_str: Date in YYYY-MM-DD format (e.g. 2026-07-25).
    """
    from calendar import monthcalendar, month_name
    d = datetime.strptime(date_str, "%Y-%m-%d")
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_name = days[d.weekday()]
    is_weekend = d.weekday() >= 5

    cal = monthcalendar(d.year, d.month)
    week_num = None
    for i, week in enumerate(cal, 1):
        if d.day in week:
            week_num = i
            break

    return json.dumps({
        "date": date_str,
        "day_of_week": day_name,
        "is_weekend": is_weekend,
        "month": month_name[d.month],
        "year": d.year,
        "week_of_month": week_num,
    }, ensure_ascii=False)


# ── Read Tools ───────────────────────────────────────────────────────


@tool
def google_calendar_list_calendars() -> str:
    """List all calendars accessible to the user (primary, subscribed, shared)."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    data = _gcal_request("/users/me/calendarList", token)
    results = []
    for cal in data.get("items", []):
        results.append({
            "id": cal.get("id"),
            "summary": cal.get("summary"),
            "primary": cal.get("primary", False),
            "accessRole": cal.get("accessRole"),
            "timeZone": cal.get("timeZone"),
        })
    return json.dumps(results, indent=2, ensure_ascii=False)


@tool
def google_calendar_list_events(
    calendar_id: str = "primary",
    days_ahead: int = 7,
    max_results: int = 10,
    query: str = "",
) -> str:
    """List upcoming Google Calendar events.

    calendar_id: Calendar ID, use "primary" for main calendar.
    days_ahead: Number of days ahead to look (default 7).
    max_results: Maximum events to return (max 50).
    query: Free text search across event titles, descriptions, locations.
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
    results = [_format_event(ev) for ev in data.get("items", [])]
    return json.dumps(results, indent=2, ensure_ascii=False)


@tool
def google_calendar_today(calendar_id: str = "primary") -> str:
    """Get today's Google Calendar events."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    end_of_day = now.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()
    data = _gcal_request(
        f"/calendars/{calendar_id}/events", token,
        params={
            "timeMin": start_of_day,
            "timeMax": end_of_day,
            "singleEvents": "true",
            "orderBy": "startTime",
        },
    )
    results = [_format_event(ev) for ev in data.get("items", [])]
    if not results:
        return "No events scheduled for today."
    return json.dumps(results, indent=2, ensure_ascii=False)


@tool
def google_calendar_get_event(event_id: str, calendar_id: str = "primary") -> str:
    """Get full details of a specific calendar event by its ID."""
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    ev = _gcal_request(f"/calendars/{calendar_id}/events/{event_id}", token)
    return json.dumps(_format_event(ev), indent=2, ensure_ascii=False)


@tool
def google_calendar_check_availability(
    time_min: str, time_max: str, calendar_ids: str = "primary", time_zone: str = "UTC",
) -> str:
    """Check free/busy status for calendars in a time range.

    time_min: Start time in RFC3339 format (e.g. 2026-06-25T09:00:00+09:00).
    time_max: End time in RFC3339 format.
    calendar_ids: Comma-separated calendar IDs to check. Default: "primary".
    time_zone: Timezone (e.g. Asia/Seoul).
    """
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    ids = [c.strip() for c in calendar_ids.split(",") if c.strip()]
    body = {
        "timeMin": time_min,
        "timeMax": time_max,
        "timeZone": time_zone,
        "items": [{"id": cid} for cid in ids],
    }
    data = _gcal_request("/freeBusy", token, method="POST", body=body)
    results = {}
    for cal_id, cal_data in data.get("calendars", {}).items():
        busy = cal_data.get("busy", [])
        results[cal_id] = {
            "busy_slots": [{"start": s["start"], "end": s["end"]} for s in busy],
            "busy_count": len(busy),
        }
    return json.dumps(results, indent=2, ensure_ascii=False)


# ── Write Tools ──────────────────────────────────────────────────────


@tool
def google_calendar_create_event(
    summary: str,
    start_time: str,
    end_time: str,
    calendar_id: str = "primary",
    description: str = "",
    location: str = "",
    attendees: str = "",
    time_zone: str = "Asia/Seoul",
    all_day: bool = False,
) -> str:
    """Create a new calendar event.

    summary: Event title.
    start_time: RFC3339 datetime (e.g. 2026-06-26T14:00:00) or YYYY-MM-DD for all-day.
    end_time: RFC3339 datetime or YYYY-MM-DD for all-day.
    calendar_id: Calendar to create in. Default "primary".
    description: Event notes. Optional.
    location: Event location. Optional.
    attendees: Comma-separated emails. Optional.
    time_zone: Timezone (default Asia/Seoul).
    all_day: If true, use date format YYYY-MM-DD for start/end.
    """
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    event: dict[str, Any] = {"summary": summary}
    if description:
        event["description"] = description
    if location:
        event["location"] = location

    if all_day:
        event["start"] = {"date": start_time}
        event["end"] = {"date": end_time}
    else:
        event["start"] = {"dateTime": start_time, "timeZone": time_zone}
        event["end"] = {"dateTime": end_time, "timeZone": time_zone}

    if attendees:
        event["attendees"] = [
            {"email": e.strip()} for e in attendees.split(",") if e.strip()
        ]

    result = _gcal_request(
        f"/calendars/{calendar_id}/events", token, method="POST", body=event,
    )
    return json.dumps({"created": _format_event(result)}, indent=2, ensure_ascii=False)


@tool
def google_calendar_quick_add(text: str, calendar_id: str = "primary") -> str:
    """Create an event from natural language text. Google parses it automatically.

    Examples: "Meeting with John tomorrow at 3pm", "Dinner Friday 7pm at Italian place"

    text: Natural language event description.
    calendar_id: Calendar to add to. Default "primary".
    """
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    result = _gcal_request(
        f"/calendars/{calendar_id}/events/quickAdd", token,
        method="POST", params={"text": text},
    )
    return json.dumps({"created": _format_event(result)}, indent=2, ensure_ascii=False)


@tool
def google_calendar_update_event(
    event_id: str,
    calendar_id: str = "primary",
    summary: str = "",
    start_time: str = "",
    end_time: str = "",
    description: str = "",
    location: str = "",
    time_zone: str = "",
) -> str:
    """Update an existing calendar event. Only non-empty fields are changed.

    event_id: Event ID to update.
    calendar_id: Calendar containing the event. Default "primary".
    summary: New title. Leave empty to keep current.
    start_time: New start (RFC3339). Leave empty to keep current.
    end_time: New end (RFC3339). Leave empty to keep current.
    description: New description. Leave empty to keep current.
    location: New location. Leave empty to keep current.
    time_zone: Timezone for new times. Leave empty to keep current.
    """
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    existing = _gcal_request(f"/calendars/{calendar_id}/events/{event_id}", token)

    if summary:
        existing["summary"] = summary
    if description:
        existing["description"] = description
    if location:
        existing["location"] = location
    if start_time:
        tz = time_zone or existing.get("start", {}).get("timeZone", "UTC")
        existing["start"] = {"dateTime": start_time, "timeZone": tz}
    if end_time:
        tz = time_zone or existing.get("end", {}).get("timeZone", "UTC")
        existing["end"] = {"dateTime": end_time, "timeZone": tz}

    result = _gcal_request(
        f"/calendars/{calendar_id}/events/{event_id}", token, method="PUT", body=existing,
    )
    return json.dumps({"updated": _format_event(result)}, indent=2, ensure_ascii=False)


@tool
def google_calendar_delete_event(
    event_id: str, calendar_id: str = "primary", notify: bool = False,
) -> str:
    """Delete a calendar event.

    event_id: Event ID to delete.
    calendar_id: Calendar containing the event. Default "primary".
    notify: Send cancellation to attendees. Default false.
    """
    token, auth_url = _get_token_or_auth_url()
    if auth_url:
        return _handle_auth(auth_url)
    if not token:
        return "Failed to get Google Calendar token."

    path = f"/calendars/{calendar_id}/events/{event_id}"
    params = {"sendUpdates": "all"} if notify else None
    _gcal_request(path, token, method="DELETE", params=params)
    return json.dumps({"deleted": event_id}, ensure_ascii=False)


google_calendar_tools = [
    google_calendar_date_info,
    google_calendar_list_calendars,
    google_calendar_list_events,
    google_calendar_today,
    google_calendar_get_event,
    google_calendar_check_availability,
    google_calendar_create_event,
    google_calendar_quick_add,
    google_calendar_update_event,
    google_calendar_delete_event,
]
