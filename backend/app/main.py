from datetime import datetime, timezone

import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .agent import execute_approved_actions, execute_low_risk_actions, plan_actions
from .audit import AuditStore
from .config import get_settings
from .google_actions import has_token
from .models import ApprovalRequest, AuthStatus, Signal
from .store import store

settings = get_settings()
audit_store = AuditStore(settings)

app = FastAPI(title="ScreenOps API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin, "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/auth/status", response_model=AuthStatus)
def auth_status() -> AuthStatus:
    return AuthStatus(
        google_token_present=has_token(settings),
        mcp_binary_present=settings.resolve(settings.google_mcp_executable).exists(),
        mcp_config_present=settings.resolve(settings.google_mcp_config_file).exists(),
        sheet_id=settings.commitment_sheet_id,
        recipient_email=settings.demo_recipient_email,
    )


@app.post("/api/signals")
def receive_signal(signal: Signal):
    run = plan_actions(settings, signal)
    run = execute_low_risk_actions(settings, run)
    store.put(run)
    audit_store.write(run.run_id, "signal_received", {"signal": signal.model_dump()})
    audit_store.write(run.run_id, "actions_planned", {"actions": [action.model_dump() for action in run.actions]})
    for event in run.audit_log:
        audit_store.write(run.run_id, event.get("event", "agent_event"), event)
    return run


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    try:
        run = store.get(run_id)
        run.audit_log = audit_store.list_for_run(run_id)
        return run
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


@app.post("/api/runs/{run_id}/approve")
def approve_run(run_id: str, request: ApprovalRequest):
    try:
        run = store.get(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    updated = execute_approved_actions(
        settings,
        run,
        request.approve_medium_actions,
        decision=request.decision,
        modified_email_subject=request.modified_email_subject,
        modified_email_body=request.modified_email_body,
    )
    store.put(updated)
    for event in updated.audit_log:
        audit_store.write(updated.run_id, event.get("event", "agent_event"), event)
    updated.audit_log = audit_store.list_for_run(run_id)
    return updated


@app.get("/api/runs/{run_id}/audit")
def get_audit(run_id: str):
    return {"run_id": run_id, "events": audit_store.list_for_run(run_id)}


@app.get("/api/runs/{run_id}/events")
def stream_run_events(run_id: str):
    try:
        run = store.get(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc

    def event_stream():
        for trace in run.trace:
            yield f"event: trace\ndata: {json.dumps(trace.model_dump())}\n\n"
        for action in run.actions:
            yield f"event: action\ndata: {json.dumps(action.model_dump(), default=str)}\n\n"
        for event in audit_store.list_for_run(run_id):
            yield f"event: audit\ndata: {json.dumps(event, default=str)}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
