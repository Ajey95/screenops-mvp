# AI Usage Documentation

## Summary

Codex/OpenAI was used as an AI-assisted development partner during the hackathon build. It helped turn the PRD into implementation tasks, scaffold code, debug issues, and prepare submission documentation. Final scope decisions, privacy constraints, API setup, and demo choices were reviewed manually.

## Tools Used

- ChatGPT
- Codex / coding agent
- OpenAI models for development assistance

## How AI Assisted the Build

### 1. Product Ideation

Asked Codex to read the ScreenOps PRD and identify the core demo path. The output helped focus the project on privacy-first live browser inference and approved Google Workspace actions.

Manual review: Kept the product centered on zero raw data egress and removed claims that were not implemented.

### 2. Architecture Planning

Asked Codex to map the PRD into browser, backend, agent, approval, and tool layers. It helped define the FastAPI + LangGraph + Google action architecture.

Manual review: Confirmed that raw screen/audio should stay in the browser and that only structured JSON should cross the boundary.

### 3. Frontend Development

Asked Codex to create a judge-facing React UI with live capture controls, readiness checks, intent JSON, agent trace, and approval queue.

Manual review: Adjusted the UI to match the v1.1 no-mock requirement, added live Screen Capture API and microphone flow, and moved model inference into a browser worker.

### 4. Backend Development

Asked Codex to scaffold FastAPI endpoints for health, auth status, signal intake, run lookup, and approval.

Manual review: Verified Python compilation and endpoint behavior through smoke tests.

### 5. Agent Workflow / LangGraph

Asked Codex to implement the PRD agent flow using LangGraph nodes for routing, planning, risk classification, and approval gating.

Manual review: Verified that the generated trace contains the expected planning steps.

### 6. MCP Integration

Asked Codex to identify the external Google requirements and implement an MCP tool layer for Gmail, Calendar, and Sheets.

Manual review: OAuth credentials were created manually in Google Cloud. The backend now calls a Python ScreenOps Google MCP server over stdio; that MCP server wraps the official Google APIs for the required actions and deploys on Render without a platform-specific binary.

### 7. Debugging

Asked Codex to run build and smoke tests. It fixed TypeScript build errors, Python compile issues, and API error handling.

Manual review: Real Gmail draft creation, Calendar event creation, Sheets append, planning evals, and extraction evals were verified after setup was completed.

### 8. Documentation and Demo Preparation

Asked Codex to create README, architecture, AI usage, submission, and demo-script files from the PRD and hackathon guidelines.

Manual review: Docs separate implemented, partial, blocked, and planned items.

## Human Oversight

All architecture decisions, privacy constraints, feature scope, final implementation choices, OAuth setup, and submission decisions were reviewed manually. AI-generated code and documentation were checked through local builds, endpoint smoke tests, and real Google API execution where available.

## Example Prompts

- "Read this PRD and tell me the external API keys, models, and setup required."
- "Break this PRD into a hackathon build plan."
- "Generate a FastAPI /signals endpoint for structured intent JSON."
- "Create a React approval card UI for low, medium, and high risk agent actions."
- "Design a LangGraph workflow for intent routing, risk classification, approval, execution, and verification."
- "Update the PRD for a no-mock WebGPU browser inference MVP."
- "Write submission docs without exaggerating implemented features."

## Build Timeline

- Setup: Created repo structure, backend, frontend, and local secret protection.
- Browser inference: Added live screen capture, microphone capture, and Transformers.js/WebGPU model loading path.
- Backend signal routing: Added FastAPI signal intake and LangGraph planning.
- Approval UI: Added risk cards and approval action.
- Google actions: Added OAuth flow, MCP tool calls, and real Gmail, Calendar, and Sheets execution with verification.
- Demo preparation: Added docs, 15 planning evals, 15 extraction evals, and verified build gates.

## Submission Notes

This project was built during the hackathon. Starter libraries and public packages were used where appropriate. The core idea, implementation, and demo flow were created for this hackathon. AI assistance was used transparently and documented here.
