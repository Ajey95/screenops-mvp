# ScreenOps Demo Recording Plan and Avatar Script

## Recording Flow

Target length: 2.5 to 3 minutes.

Keep the recording focused on one story: private screen context becomes real Google Workspace actions without raw screen or audio leaving the browser.

### Scene 1: Open With The Problem

Show:
- ScreenOps app open at `http://127.0.0.1:5173`
- Runtime readiness panel visible
- DevTools Network tab open on the side or bottom

Narration goal:
- Explain that this is not a chatbot.
- Explain that the screen is the richest work context, but cannot be sent to cloud AI in sensitive environments.

### Scene 2: Prove Local Browser Inference

Show:
- Click `Load Local Models`
- Show model readiness/logs
- Show WebGPU indicator
- Show app sections for screen reader, Whisper, intent model, and model raw output

Narration goal:
- Mention Transformers.js and WebGPU.
- Mention SmolVLM for screen understanding, Whisper tiny for audio, and Phi-3 mini or local fallback for intent extraction.
- Say this runs in a browser worker on-device.

### Scene 3: Capture The Discord Scenario

Show:
- Paste the prepared message from `docs/demo_discord_message.md` into Discord
- Return to the ScreenOps tab
- Click `Start Live ScreenOps`
- Select the Discord window or Discord browser tab during browser screen-share prompt
- If Chrome shows a `Share tab audio` or `Share system audio` option, turn it on
- Play or speak the related audio after the screen is already shared
- Keep DevTools Network visible enough to show no raw uploads

Narration goal:
- Explain that screen and audio are fused locally.
- Explain that if SmolVLM OCR is low confidence, ScreenOps runs a local OCR fallback on the captured frame inside the browser worker.
- Mention that if audio refers to visible screen text, ScreenOps carries local context forward and extracts one structured commitment.
- Clarify that the MVP extracts one primary actionable commitment per run, not every task in a long message.
- Point out that only final intent JSON crosses the backend boundary.

### Scene 4: Show The Structured Signal

Show:
- Intent signal JSON panel
- Avoid zooming into private raw Discord text for too long
- Highlight fields: entity, action_required, deadline, confidence

Narration goal:
- Explain that this JSON is the privacy boundary.
- State that pixels, screenshots, audio chunks, and transcript blobs are not sent to backend.

### Scene 5: Show The Agent Trace

Show:
- Agent trace panel
- Steps: local browser inference, intent router, context enricher, action planner, risk classifier, approval gate, low-risk auto-execution

Narration goal:
- Mention FastAPI backend and LangGraph.
- Explain the agent graph: route, enrich, plan, classify risk, approve, execute, verify.

### Scene 6: Show HITL Approval

Show:
- Approval queue cards
- Gmail draft as MEDIUM risk
- Calendar and Sheets as LOW risk and already executed or executing
- 60-second timeout note if visible
- Click `Approve and Execute` for Gmail

Narration goal:
- Explain Human-in-the-Loop safety.
- Low-risk actions can auto-execute.
- Medium-risk actions are queued for approve, modify, reject, or timeout.
- High-risk actions would hard block.

### Scene 7: Show Real MCP Actions

Show:
- Gmail draft created
- Calendar event created
- Sheets row appended
- Return to ScreenOps and show verified result / trace

Narration goal:
- Mention MCP: backend calls a local ScreenOps Google MCP server over stdio.
- That MCP server exposes Gmail draft, Calendar event, Sheets append, and verification tools.
- This is real workflow automation, not mocked UI.

### Scene 8: Show Evals And Close

Show:
- Terminal or docs showing:
  - `PASSED 15 planning scenarios`
  - extraction eval metrics `15/15`
  - `evals/extraction_metrics.json`
- Optionally show `ARCHITECTURE.md` or `SUBMISSION.md`

Narration goal:
- Explain that evals are built into the project.
- Mention Codex/OpenAI usage transparently.
- Close with the differentiator: private browser sensing plus agentic backend action.

## HeyGen Avatar Script

ScreenOps is a privacy-first agentic workspace assistant.

The problem is that the screen has the richest work context, but it is also the most sensitive. In enterprise, finance, healthcare, legal, or HR workflows, raw screen pixels and raw meeting audio cannot safely be sent to a cloud AI model.

ScreenOps solves this with a strict privacy boundary.

Everything private runs inside the browser tab. Screen capture is processed by SmolVLM and local OCR. Audio is transcribed by Whisper tiny. A browser-side Transformer.js pipeline on WebGPU fuses screen and audio into one structured intent.

The key point is this: raw screenshots, raw audio chunks, and transcript blobs never leave the browser. The backend receives only compact intent JSON.

In this demo, I am sharing a real Discord screen. The message asks me to send the finalized Q3 performance report to Priya Nair by Thursday, and includes her email address. ScreenOps reads the screen locally, transcribes the related audio locally, waits for both outputs, and extracts one primary commitment.

The Network tab is the privacy proof. There are no screen frame uploads and no audio file uploads. Only the final structured intent JSON crosses the boundary.

Once that JSON reaches the backend, a FastAPI and LangGraph agent routes the signal, enriches context, plans actions, classifies risk, waits for approval where needed, executes tools, verifies results, and records an audit trail.

Here, the agent proposes three real actions: create a Gmail draft, create a Google Calendar reminder for Thursday, and append the commitment to a Google Sheet.

The approval layer is important. Low-risk actions, like Calendar and Sheets, can execute automatically. The Gmail draft is medium risk, so it waits for human approval. I can approve, modify, or reject before anything is sent.

The backend executes actions through a local ScreenOps Google MCP server over stdio. It exposes Gmail draft creation, Calendar event creation, Sheets append, and verification tools. ScreenOps then verifies that the draft exists, the event exists, and the sheet row was appended.

So this is not just a chatbot or workflow builder. ScreenOps combines local browser inference, a privacy-preserving JSON boundary, LangGraph orchestration, human approval, MCP tool execution, and verified outcomes.

The project also includes evals: sixteen extraction scenarios and fifteen planning scenarios covering parsing, deadlines, false positives, action plans, and risk classification.

Codex and OpenAI tools were used throughout the hackathon for architecture, coding, debugging, evals, and documentation. The final result is a working prototype where the screen stays private, but the workflow still gets done.

## Short Backup Script

ScreenOps is a privacy-first agentic workspace assistant.

It solves a hard problem: the screen has the best context about work, but sensitive screen and audio data cannot be sent to a cloud AI model.

ScreenOps keeps that data local. In the browser, Screen Capture API and microphone input feed a Transformer.js and WebGPU model stack: SmolVLM for screen understanding, Whisper tiny for audio, and a local intent model for structured extraction.

The backend receives only intent JSON. No screenshots, no audio chunks, and no transcript blobs cross the boundary.

From that JSON, a FastAPI and LangGraph backend plans actions, classifies risk, and uses Human-in-the-Loop approval before executing real work.

In this demo, the agent detects one primary commitment from screen and audio context, auto-executes low-risk Calendar and Sheets actions, queues the medium-risk Gmail draft for approval, and then verifies the real Google Workspace results.

The tool layer runs through a local ScreenOps MCP server, exposing Gmail, Calendar, Sheets, and verification tools over stdio.

The project also includes evals: sixteen extraction scenarios and fifteen planning scenarios, both passing.

This is not a chatbot. It is a privacy-preserving agentic workflow system: local browser intelligence, structured intent boundary, LangGraph orchestration, MCP execution, and verified outcomes.
