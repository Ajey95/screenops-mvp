# Architecture

ScreenOps is designed around one privacy constraint: raw screen pixels and raw audio must not leave the browser tab.

## Components

```text
Browser
  Screen Capture API
  Microphone API
  Transformers.js / WebGPU
  SmolVLM + Whisper tiny + Phi-3 mini
  Dedicated model worker
  Structured intent JSON

Backend
  FastAPI
  LangGraph planning graph
  LangGraph execution graph
  HITL approval gate
  MCP client
  Python ScreenOps Google MCP server over stdio
  SQLite audit trail for local MVP

External services
  Gmail draft creation
  Google Calendar event creation
  Google Sheets commitment log
```

## Data Boundary

Only this type of payload crosses from browser to backend:

```json
{
  "signal_type": "commitment",
  "source": "audio",
  "context": "meeting",
  "entity": "Priya",
  "action_required": "send the Q3 report",
  "deadline": "Thursday",
  "confidence": 0.91
}
```

Not sent:

- screen pixels
- audio samples
- raw frame captures
- full local model inputs

## Agent Flow

1. Browser worker extracts intent locally with SmolVLM, Whisper tiny, and Phi-3 mini.
2. FastAPI receives the signal.
3. LangGraph routes the signal.
4. Action planner creates Gmail, Calendar, and Sheets actions.
5. Risk classifier marks Gmail draft as MEDIUM and Calendar/Sheets as LOW.
6. Approval gate waits for human confirmation for the Gmail draft.
7. Execution graph calls MCP tools over stdio.
8. The Python ScreenOps Google MCP server module wraps Gmail, Calendar, and Sheets APIs without requiring a platform-specific binary.
9. Verification node poll-confirms Gmail, Calendar, and Sheets results through MCP verify tools.
10. SQLite audit store records signal, plan, execution, and verification events.

## Current Persistence

The MVP currently uses in-memory run state with durable SQLite audit logs. Redis and Postgres remain planned production pieces from the PRD.

## Evaluation

The repository includes two local eval layers:

- Extraction evals: 15 fixtures check local intent parsing, fallback parsing, entity match, action keyword match, deadline match, and false-positive behavior.
- Planning evals: 15 fixtures check expected action plans and risk classification.
