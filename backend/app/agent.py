from datetime import datetime, timezone
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from .config import Settings
from .google_actions import GoogleActionError, execute_action, verify_action
from .models import AgentRun, ProposedAction, RiskLevel, Signal, TraceEvent


class PlanningState(TypedDict):
    settings: Settings
    signal: Signal
    trace: list[TraceEvent]
    actions: list[ProposedAction]
    audit_log: list[dict[str, Any]]
    run: AgentRun | None


class ExecutionState(TypedDict):
    settings: Settings
    run: AgentRun
    approve_medium: bool
    decision: str
    modified_email_subject: str | None
    modified_email_body: str | None


def _execute_and_verify_action(settings: Settings, run: AgentRun, action: ProposedAction) -> None:
    action.status = "approved"
    try:
        action.result = execute_action(settings, action)
        action.status = "executed"
        run.audit_log.append({"event": "action_executed", "tool": action.tool, "result": action.result})
    except GoogleActionError as exc:
        action.status = "failed"
        action.error = str(exc)
        run.audit_log.append({"event": "action_failed", "tool": action.tool, "error": str(exc)})
        return

    try:
        verification = verify_action(settings, action)
        action.result = {**action.result, "verification": verification}
        run.audit_log.append({"event": "action_verified", "tool": action.tool, "verification": verification})
    except GoogleActionError as exc:
        action.status = "failed"
        action.error = str(exc)
        run.audit_log.append({"event": "verification_failed", "tool": action.tool, "error": str(exc)})


def _intent_router(state: PlanningState) -> PlanningState:
    signal = state["signal"]
    source_detail = {
        "screen": "visible screen context",
        "audio": "audio transcript",
        "screen_audio": "visible screen context and audio transcript",
        "clipboard": "clipboard context",
        "replay": "replay fixture",
    }.get(signal.source, signal.source)
    state["trace"].append(
        TraceEvent(
            step="Intent router",
            status="completed",
            detail=f"Classified signal as {signal.signal_type} from {source_detail}.",
        )
    )
    return state


def _context_enricher(state: PlanningState) -> PlanningState:
    settings = state["settings"]
    state["trace"].append(
        TraceEvent(
            step="Context enricher",
            status="completed",
            detail=f"Loaded connected workspace targets: recipient {settings.demo_recipient_email}, calendar primary, sheet {settings.commitment_sheet_id}.",
        )
    )
    return state


def _action_planner(state: PlanningState) -> PlanningState:
    state["actions"] = _build_actions(state["settings"], state["signal"])
    state["trace"].append(
        TraceEvent(
            step="Action planner",
            status="completed",
            detail="Planned Gmail draft, calendar reminder, and Sheets commitment log.",
        )
    )
    return state


def _risk_classifier(state: PlanningState) -> PlanningState:
    state["trace"].append(
        TraceEvent(
            step="Risk classifier",
            status="completed",
            detail="Draft email is MEDIUM risk; calendar and sheet updates are LOW risk.",
        )
    )
    return state


def _approval_gate(state: PlanningState) -> PlanningState:
    signal = state["signal"]
    run = AgentRun(signal=signal, trace=state["trace"], actions=state["actions"])
    run.trace.append(
        TraceEvent(
            step="Approval gate",
            status="queued",
            detail="Waiting for medium-risk Gmail draft approval.",
        )
    )
    state["run"] = run
    return state


def _build_planning_graph():
    graph = StateGraph(PlanningState)
    graph.add_node("intent_router", _intent_router)
    graph.add_node("context_enricher", _context_enricher)
    graph.add_node("action_planner", _action_planner)
    graph.add_node("risk_classifier", _risk_classifier)
    graph.add_node("approval_gate", _approval_gate)
    graph.set_entry_point("intent_router")
    graph.add_edge("intent_router", "context_enricher")
    graph.add_edge("context_enricher", "action_planner")
    graph.add_edge("action_planner", "risk_classifier")
    graph.add_edge("risk_classifier", "approval_gate")
    graph.add_edge("approval_gate", END)
    return graph.compile()


PLANNING_GRAPH = _build_planning_graph()


def _decision_node(state: ExecutionState) -> ExecutionState:
    run = state["run"]
    if state["decision"] == "reject" or not state["approve_medium"]:
        run.trace.append(TraceEvent(step="Human approval", status="blocked", detail="User rejected the proposed action set."))
        for action in run.actions:
            action.status = "failed"
            action.error = "Rejected by user before execution."
            run.audit_log.append({"event": "action_rejected", "tool": action.tool, "reason": action.error})
        return state

    if state["decision"] == "modify":
        for action in run.actions:
            if action.tool == "gmail.drafts.create":
                if state["modified_email_subject"]:
                    action.payload["subject"] = state["modified_email_subject"]
                if state["modified_email_body"]:
                    action.payload["body"] = state["modified_email_body"]
        run.trace.append(TraceEvent(step="Human approval", status="approved", detail="User modified the Gmail draft before approval."))
    elif state["decision"] == "timeout":
        run.trace.append(
            TraceEvent(
                step="Human approval",
                status="approved",
                detail="Medium-risk timeout elapsed; auto-executing queued medium-risk action.",
            )
        )
    else:
        run.trace.append(TraceEvent(step="Human approval", status="approved", detail="User approved Gmail draft action."))
    return state


def _should_execute(state: ExecutionState) -> str:
    if state["decision"] == "reject" or not state["approve_medium"]:
        return "done"
    return "execute"


def _execution_agent_node(state: ExecutionState) -> ExecutionState:
    settings = state["settings"]
    run = state["run"]
    for action in run.actions:
        if action.status in {"executed", "failed"}:
            continue
        if action.risk == RiskLevel.medium:
            _execute_and_verify_action(settings, run, action)
    return state


def _verification_agent_node(state: ExecutionState) -> ExecutionState:
    run = state["run"]
    run.trace.append(TraceEvent(step="Verification agent", status="completed", detail="All executed actions were poll-verified where possible."))
    return state


def _build_execution_graph():
    graph = StateGraph(ExecutionState)
    graph.add_node("human_decision", _decision_node)
    graph.add_node("execution_agent", _execution_agent_node)
    graph.add_node("verification_agent", _verification_agent_node)
    graph.set_entry_point("human_decision")
    graph.add_conditional_edges("human_decision", _should_execute, {"execute": "execution_agent", "done": END})
    graph.add_edge("execution_agent", "verification_agent")
    graph.add_edge("verification_agent", END)
    return graph.compile()


EXECUTION_GRAPH = _build_execution_graph()


def _build_actions(settings: Settings, signal: Signal) -> list[ProposedAction]:
    recipient_email = signal.recipient_email or settings.demo_recipient_email
    row = [
        datetime.now(timezone.utc).isoformat(),
        signal.entity,
        signal.action_required,
        signal.deadline,
        signal.source,
        "Detected",
    ]
    return [
        ProposedAction(
            tool="gmail.drafts.create",
            description=f"Draft a follow-up email to {recipient_email}.",
            risk=RiskLevel.medium,
            status="pending_approval",
            payload={
                "to": recipient_email,
                "subject": f"Follow-up: {signal.action_required} by {signal.deadline}",
                "body": (
                    f"Hi {signal.entity},\n\n"
                    f"Following up on the meeting commitment: {signal.action_required} by {signal.deadline}.\n\n"
                    "I will keep this tracked and send the final update once ready.\n\n"
                    "Best,\nScreenOps Demo"
                ),
            },
        ),
        ProposedAction(
            tool="calendar.events.create",
            description=f"Create a calendar reminder for {signal.action_required}.",
            risk=RiskLevel.low,
            status="queued",
            payload={
                "summary": f"ScreenOps reminder: {signal.action_required}",
                "description": f"Detected commitment involving {signal.entity}; deadline: {signal.deadline}.",
                "deadline": signal.deadline,
            },
        ),
        ProposedAction(
            tool="sheets.values.append",
            description="Append the commitment to the tracker sheet.",
            risk=RiskLevel.low,
            status="queued",
            payload={"row": row},
        ),
    ]


def plan_actions(settings: Settings, signal: Signal) -> AgentRun:
    state = PLANNING_GRAPH.invoke(
        {
            "settings": settings,
            "signal": signal,
            "trace": [
                TraceEvent(
                    step="Local browser inference",
                    status="completed",
                    detail="Browser sent structured JSON only after local screen, audio, and intent processing.",
                )
            ],
            "actions": [],
            "audit_log": [],
            "run": None,
        }
    )
    run = state["run"]
    if run is None:
        raise RuntimeError("LangGraph planning did not produce an agent run.")
    return run


def execute_low_risk_actions(settings: Settings, run: AgentRun) -> AgentRun:
    low_actions = [action for action in run.actions if action.risk == RiskLevel.low and action.status == "queued"]
    if not low_actions:
        return run

    run.trace.append(
        TraceEvent(
            step="Low-risk auto-execution",
            status="running",
            detail="Auto-executing LOW-risk Calendar and Sheets actions before human approval.",
        )
    )
    for action in low_actions:
        _execute_and_verify_action(settings, run, action)
    run.trace.append(
        TraceEvent(
            step="Low-risk auto-execution",
            status="completed",
            detail="LOW-risk actions executed and verified; MEDIUM-risk Gmail draft remains queued.",
        )
    )
    return run


def execute_approved_actions(
    settings: Settings,
    run: AgentRun,
    approve_medium: bool,
    decision: str = "approve",
    modified_email_subject: str | None = None,
    modified_email_body: str | None = None,
) -> AgentRun:
    state = EXECUTION_GRAPH.invoke(
        {
            "settings": settings,
            "run": run,
            "approve_medium": approve_medium,
            "decision": decision,
            "modified_email_subject": modified_email_subject,
            "modified_email_body": modified_email_body,
        }
    )
    return state["run"]
