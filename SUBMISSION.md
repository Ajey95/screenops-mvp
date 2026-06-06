# ScreenOps Submission

## Project Description

ScreenOps is a privacy-first ambient agentic workspace system. It analyzes live screen and meeting context locally in the browser, extracts only structured intent JSON, and uses a backend agent to prepare real-world actions through Google Workspace integrations.

## Problem Statement

Professionals often make commitments during meetings, email threads, and live work sessions, but logging those commitments requires context switching. Cloud AI tools cannot safely process raw screen or audio data in sensitive environments.

## Solution Overview

ScreenOps keeps raw screen and audio data local. Browser-side models extract intent, and the backend receives only structured JSON. A LangGraph agent plans actions, classifies risk, and uses a human approval gate before execution.

## Implemented Features

- Live browser screen capture and microphone permission flow.
- Transformers.js/WebGPU inference worker for SmolVLM, Whisper tiny, and Phi-3 mini, with SmolLM2 fallback for Phi external-data loading failures.
- FastAPI backend for signal intake and approval.
- LangGraph planning, execution, and verification workflow.
- Approval queue UI with approve, modify, and reject.
- SSE event stream for run trace and audit inspection.
- SQLite audit persistence for local demo runs.
- Google OAuth flow.
- Real Gmail draft creation verified.
- Real Calendar event creation verified.
- Real Sheets append verified.
- Backend calls Gmail, Calendar, and Sheets through a local MCP server over stdio.
- Extraction evals: 15/15 scenarios passing.
- Planning evals: 15/15 scenarios passing.

## Partially Implemented

- Generic third-party Google MCP binary/config exists, but the final demo path uses the local ScreenOps Google MCP server because it exposes the exact PRD tools required for Gmail draft, Calendar create, Sheets append, and verification.

## Planned / Future

- Redis commitment memory.
- Postgres audit log. The local demo uses SQLite audit persistence.
- GitHub MCP integration.
- Enterprise extension packaging.

## Tech Stack

- React + Vite + TypeScript
- Transformers.js + WebGPU
- FastAPI
- LangGraph
- Google OAuth
- Gmail, Calendar, and Sheets APIs
- Local ScreenOps Google MCP server over stdio

## AI Usage

Codex/OpenAI was used for architecture breakdown, code scaffolding, debugging, documentation, and submission preparation. See [AI_USAGE.md](AI_USAGE.md).

## Demo Notes

The strongest verified path right now is:

1. Live browser UI starts local inference flow.
2. Backend receives structured JSON.
3. Agent plans Gmail, Calendar, and Sheets actions.
4. User approves Gmail draft.
5. Gmail draft, Calendar event, and Sheets row are created and verified.

Calendar and Sheets are verified in the current local demo path, along with Gmail draft creation and poll-back verification.
