from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

APP_TIMEZONE_NAME = "Asia/Seoul"
APP_TIMEZONE = ZoneInfo(APP_TIMEZONE_NAME)


def local_now(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(APP_TIMEZONE).replace(microsecond=0)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.astimezone(APP_TIMEZONE).replace(microsecond=0)


def build_temporal_context(now: datetime | None = None) -> str:
    current = local_now(now)
    return (
        '<runtime_context current_datetime="'
        + current.isoformat()
        + '" current_date="'
        + current.date().isoformat()
        + '" timezone="'
        + APP_TIMEZONE_NAME
        + '">\n'
        + "Relative calendar requests like today, this week, and next 7 days are based on current_date. "
        + "For open-ended upcoming calendar requests, use Google Calendar tools with days_ahead=7 and do not query past events unless the user explicitly asks for the past.\n"
        + "</runtime_context>"
    )
