from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    low = "LOW"
    medium = "MEDIUM"
    high = "HIGH"


class Signal(BaseModel):
    signal_id: str = Field(default_factory=lambda: str(uuid4()))
    signal_type: Literal["commitment", "deadline", "question", "task", "mention"] = "commitment"
    source: Literal["screen", "audio", "screen_audio", "clipboard", "replay"] = "replay"
    context: Literal["meeting", "email", "document", "code", "chat"] = "meeting"
    entity: str = "Priya"
    action_required: str = "send the Q3 report"
    deadline: str = "Thursday"
    confidence: float = 0.91
    recipient_email: str | None = None
    timestamp: str
    session_id: str


class TraceEvent(BaseModel):
    step: str
    status: Literal["queued", "running", "approved", "completed", "blocked", "failed"]
    detail: str


class ProposedAction(BaseModel):
    action_id: str = Field(default_factory=lambda: str(uuid4()))
    tool: str
    description: str
    risk: RiskLevel
    status: Literal["queued", "pending_approval", "approved", "executed", "failed"] = "queued"
    payload: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None


class AgentRun(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid4()))
    signal: Signal
    trace: list[TraceEvent]
    actions: list[ProposedAction]
    audit_log: list[dict[str, Any]] = Field(default_factory=list)


class ApprovalRequest(BaseModel):
    approve_medium_actions: bool = True
    decision: Literal["approve", "reject", "modify", "timeout"] = "approve"
    modified_email_subject: str | None = None
    modified_email_body: str | None = None


class AuthStatus(BaseModel):
    google_token_present: bool
    mcp_binary_present: bool
    mcp_config_present: bool
    sheet_id: str
    recipient_email: str
