from typing import Any

from mcp.server.fastmcp import FastMCP

from .config import get_settings
from .google_api_adapters import (
    append_sheet_row,
    create_calendar_event,
    create_gmail_draft,
    verify_calendar_event,
    verify_gmail_draft,
    verify_sheet_append,
)

mcp = FastMCP("screenops-google-workspace")


@mcp.tool()
def gmail_draft_create(to: str, subject: str, body: str) -> dict[str, Any]:
    """Create a Gmail draft with the supplied recipient, subject, and body."""
    return create_gmail_draft(get_settings(), {"to": to, "subject": subject, "body": body})


@mcp.tool()
def calendar_event_create(summary: str, description: str, deadline: str = "unspecified") -> dict[str, Any]:
    """Create a Google Calendar event in the primary calendar."""
    return create_calendar_event(get_settings(), {"summary": summary, "description": description, "deadline": deadline})


@mcp.tool()
def sheets_values_append(row: list[Any]) -> dict[str, Any]:
    """Append one commitment row to the configured Google Sheet."""
    return append_sheet_row(get_settings(), {"row": row})


@mcp.tool()
def gmail_draft_verify(result: dict[str, Any]) -> dict[str, Any]:
    """Verify a Gmail draft exists after creation."""
    return verify_gmail_draft(get_settings(), result)


@mcp.tool()
def calendar_event_verify(result: dict[str, Any]) -> dict[str, Any]:
    """Verify a Calendar event exists after creation."""
    return verify_calendar_event(get_settings(), result)


@mcp.tool()
def sheets_append_verify(result: dict[str, Any]) -> dict[str, Any]:
    """Verify a Sheets append result contains an updated range."""
    return verify_sheet_append(result)


if __name__ == "__main__":
    mcp.run()
