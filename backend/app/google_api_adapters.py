import base64
import re
from datetime import date, datetime, time, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .config import Settings

SCOPES = [
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]


class GoogleActionError(RuntimeError):
    pass


def token_path(settings: Settings) -> Path:
    return settings.resolve(settings.google_token_file)


def has_token(settings: Settings) -> bool:
    return token_path(settings).exists()


def _credentials(settings: Settings) -> Credentials:
    path = token_path(settings)
    if not path.exists():
        raise GoogleActionError(
            "Google token is missing. Run `python scripts/google_auth.py` once before executing real actions."
        )
    creds = Credentials.from_authorized_user_file(str(path), SCOPES)
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(creds.to_json(), encoding="utf-8")
        except Exception as exc:
            raise GoogleActionError(f"Google token refresh failed. Re-run `python scripts/google_auth.py`. {exc}") from exc
    if not creds.valid:
        raise GoogleActionError("Google token exists but is not valid. Re-run `python scripts/google_auth.py`.")
    return creds


def _service(settings: Settings, api: str, version: str):
    return build(api, version, credentials=_credentials(settings), cache_discovery=False)


def create_gmail_draft(settings: Settings, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        gmail = _service(settings, "gmail", "v1")
        message = EmailMessage()
        message["To"] = payload["to"]
        message["Subject"] = payload["subject"]
        message.set_content(payload["body"])
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        result = gmail.users().drafts().create(userId="me", body={"message": {"raw": raw}}).execute()
        return {"provider": "gmail_api", "draft_id": result.get("id"), "message_id": result.get("message", {}).get("id")}
    except HttpError as exc:
        raise GoogleActionError(_google_error_message(exc)) from exc


def create_calendar_event(settings: Settings, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        calendar = _service(settings, "calendar", "v3")
        timezone_name = _calendar_timezone(settings)
        start = _calendar_start(settings, str(payload.get("deadline", "unspecified")), timezone_name)
        end = start + timedelta(minutes=30)
        event = {
            "summary": payload["summary"],
            "description": payload["description"],
            "start": {"dateTime": start.isoformat(), "timeZone": timezone_name},
            "end": {"dateTime": end.isoformat(), "timeZone": timezone_name},
        }
        result = calendar.events().insert(calendarId="primary", body=event).execute()
        return {
            "provider": "calendar_api",
            "event_id": result.get("id"),
            "html_link": result.get("htmlLink"),
            "summary": result.get("summary"),
            "start": result.get("start", {}),
            "end": result.get("end", {}),
        }
    except HttpError as exc:
        raise GoogleActionError(_google_error_message(exc)) from exc


def _calendar_timezone(settings: Settings) -> str:
    if settings.calendar_timezone in {"Asia/Kolkata", "UTC"}:
        return settings.calendar_timezone
    return "UTC"


def _calendar_start(settings: Settings, deadline: str, timezone_name: str) -> datetime:
    tz = _calendar_tzinfo(timezone_name)
    now = datetime.now(tz)
    target_date = _resolve_deadline_date(deadline, now.date())
    hour = max(0, min(settings.calendar_reminder_hour, 23))
    return datetime.combine(target_date, time(hour=hour), tzinfo=tz)


def _calendar_tzinfo(timezone_name: str) -> timezone:
    if timezone_name == "Asia/Kolkata":
        return timezone(timedelta(hours=5, minutes=30), name="Asia/Kolkata")
    return timezone.utc


def _resolve_deadline_date(deadline: str, today: date) -> date:
    normalized = re.sub(r"\s+", " ", deadline.strip().lower())
    normalized = re.sub(r"^(by|before|on)\s+", "", normalized)
    if not normalized or normalized == "unspecified":
        return today + timedelta(days=1)
    if normalized in {"today", "tonight"}:
        return today
    if normalized == "tomorrow":
        return today + timedelta(days=1)
    if normalized == "next week":
        return today + timedelta(days=7)

    iso_match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", normalized)
    if iso_match:
        try:
            return date.fromisoformat(iso_match.group(1))
        except ValueError:
            pass

    weekdays = {
        "monday": 0,
        "mon": 0,
        "tuesday": 1,
        "tue": 1,
        "wednesday": 2,
        "wed": 2,
        "thursday": 3,
        "thu": 3,
        "friday": 4,
        "fri": 4,
        "saturday": 5,
        "sat": 5,
        "sunday": 6,
        "sun": 6,
    }
    for label, weekday in weekdays.items():
        if re.search(rf"\b{label}\b", normalized):
            days_ahead = (weekday - today.weekday()) % 7
            if days_ahead == 0:
                days_ahead = 7
            return today + timedelta(days=days_ahead)

    return today + timedelta(days=1)


def append_sheet_row(settings: Settings, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        sheets = _service(settings, "sheets", "v4")
        values = [payload["row"]]
        result = (
            sheets.spreadsheets()
            .values()
            .append(
                spreadsheetId=settings.commitment_sheet_id,
                range="A:F",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": values},
            )
            .execute()
        )
        return {"provider": "sheets_api", "updates": result.get("updates", {})}
    except HttpError as exc:
        raise GoogleActionError(_google_error_message(exc)) from exc


def verify_gmail_draft(settings: Settings, result: dict[str, Any]) -> dict[str, Any]:
    try:
        draft_id = result.get("draft_id")
        if not draft_id:
            raise GoogleActionError("Gmail draft result did not include draft_id.")
        gmail = _service(settings, "gmail", "v1")
        draft = gmail.users().drafts().get(userId="me", id=draft_id).execute()
        return {"verified": bool(draft.get("id")), "provider": "gmail_api", "draft_id": draft.get("id")}
    except HttpError as exc:
        raise GoogleActionError(_google_error_message(exc)) from exc


def verify_calendar_event(settings: Settings, result: dict[str, Any]) -> dict[str, Any]:
    try:
        event_id = result.get("event_id")
        if not event_id:
            raise GoogleActionError("Calendar result did not include event_id.")
        calendar = _service(settings, "calendar", "v3")
        event = calendar.events().get(calendarId="primary", eventId=event_id).execute()
        return {"verified": bool(event.get("id")), "provider": "calendar_api", "event_id": event.get("id")}
    except HttpError as exc:
        raise GoogleActionError(_google_error_message(exc)) from exc


def verify_sheet_append(result: dict[str, Any]) -> dict[str, Any]:
    updates = result.get("updates", {})
    return {"verified": bool(updates.get("updatedRange")), "provider": "sheets_api", "updated_range": updates.get("updatedRange")}


def _google_error_message(exc: HttpError) -> str:
    try:
        payload = exc.error_details[0]["message"]
    except (AttributeError, IndexError, KeyError, TypeError):
        payload = str(exc)
    return payload
