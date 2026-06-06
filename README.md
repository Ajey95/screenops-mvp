# ScreenOps

Privacy-first ambient agentic workspace intelligence.

ScreenOps watches live work context in the browser, extracts structured intent locally, and sends only that JSON signal to a backend agent that can draft emails, create calendar reminders, and log commitments after human approval.

## Problem

The screen is the richest context source for modern work, but it often contains confidential data that should not be sent to a cloud AI service. That blocks AI assistance for enterprise, legal, healthcare, HR, finance, and other sensitive workflows.

## Solution

ScreenOps uses a split architecture:

```text
Browser local inference
  Screen Capture API -> SmolVLM
  Microphone API -> Whisper tiny
  Screen/audio fusion -> Phi-3 mini
        |
        v
Structured intent JSON only
        |
        v
FastAPI + LangGraph backend
        |
        v
Human approval gate
        |
        v
Google Workspace actions
  Gmail draft
  Calendar reminder
  Sheets commitment log
```

Raw screen frames and raw audio are not sent to the backend.

## Current Implementation Status

Implemented:

- React/Vite frontend with live screen capture and microphone permission flow.
- Browser-side Transformers.js/WebGPU inference worker for SmolVLM, Whisper tiny, and Phi-3 mini with SmolLM2 fallback for Phi external-data failures.
- FastAPI backend with signal intake, auth status, approval, and run lookup endpoints.
- LangGraph planning and execution graphs for routing, context enrichment, action planning, risk classification, approval, execution, and verification.
- Approval controls for approve, modify, and reject.
- SSE run event stream at `/api/runs/{run_id}/events`.
- SQLite audit persistence for local demo runs.
- Google OAuth token flow.
- Gmail draft creation verified with the test account.
- Calendar event creation verified with the test account.
- Sheets append verified against the commitment tracker.
- Poll-back verification for Gmail draft, Calendar event, and Sheets append.
- Planning eval runner with 15 golden scenarios.
- Extraction eval runner with 15 scenarios for intent match, entity, action, deadline, fallback parsing, and false positives.
- Local ScreenOps Google MCP server over stdio for Gmail draft, Calendar event, Sheets append, and verification tools.

Partially complete:

- The generic third-party Google MCP binary is present, but the demo uses the local ScreenOps MCP server because the third-party server does not expose Gmail draft and Sheets append tools.

Not implemented yet:

- Redis persistence.
- Postgres audit database. Local demo uses SQLite audit persistence.
- GitHub MCP stretch integration.

## Tech Stack

- Frontend: React, Vite, TypeScript
- Browser inference: Transformers.js with WebGPU
- Intent model repo: `microsoft/Phi-3-mini-4k-instruct-onnx-web`, with fallback `HuggingFaceTB/SmolLM2-360M-Instruct`
- Backend: FastAPI, Python
- Agent orchestration: LangGraph
- Google actions: ScreenOps Google MCP server over stdio, wrapping Gmail API, Calendar API, and Sheets API

## Local Setup

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r backend\requirements.txt

cd frontend
npm install
npm run build
npm run eval:extraction
```

Run one-time Google OAuth:

```powershell
.\.venv\Scripts\python scripts\google_auth.py
```

Start backend:

```powershell
.\.venv\Scripts\uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Start frontend:

```powershell
cd frontend
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

## Demo Flow

1. Open ScreenOps.
2. Click Start Live ScreenOps.
3. Grant screen and microphone permissions.
4. Browser loads local models and extracts an intent signal.
5. Browser worker returns SmolVLM text, Whisper transcript, Phi raw output, and final structured JSON.
6. Backend receives only structured JSON.
7. Approval queue shows Gmail, Calendar, and Sheets actions.
8. User approves the Gmail draft.
9. Backend executes approved actions and records verified results.

## AI Usage

See [AI_USAGE.md](AI_USAGE.md).
