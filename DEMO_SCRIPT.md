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

The core problem is simple: my screen has the richest context about my work, but it is also the one thing I cannot safely send to a cloud AI model.

That matters for enterprise teams, legal work, healthcare, HR, finance, and any environment where private screen content cannot leave the device.

ScreenOps is not a chatbot. I am not typing a prompt and asking a model what to do.

Instead, ScreenOps watches live work context in the browser, extracts one primary structured intent signal locally, and then lets a backend agent safely act on that signal.

The architecture is split into two parts.

First, the browser does the sensing and reasoning locally. Screen capture goes into SmolVLM for screen understanding. Microphone audio goes into Whisper tiny for transcription. ScreenOps waits for both local outputs, then fuses the screen and audio context into one structured intent using a local Transformer.js model pipeline running with WebGPU.

This is the key privacy boundary. Raw screen pixels never leave the browser tab. Raw audio never leaves the browser tab. The backend receives only a small JSON signal with fields like entity, action required, deadline, and confidence.

Here I am loading the local model stack. These models run inside a browser worker using Transformers.js and WebGPU, so the private context is processed on-device instead of being uploaded to a cloud model.

Now I start the live ScreenOps flow.

I am sharing a real Discord screen, and if the browser offers it, I enable shared tab or system audio. If the vision model's OCR output is low confidence, ScreenOps runs a local OCR fallback on the captured frame inside the browser worker. The backend still never receives the raw Discord message, screenshots, audio chunks, or transcript blobs.

For the MVP, ScreenOps intentionally extracts one primary actionable commitment per run. A long Discord message may contain several possible follow-ups, but the demo focuses on the strongest one: sending the finalized Q3 performance report to Priya by Thursday.

In the Network tab, the important proof is what is missing. There are no screen frame uploads, no audio file uploads, and no transcript blob being sent to the backend. The application sends only the final structured intent JSON.

That JSON is the only boundary-crossing payload.

Once the backend receives the signal, the second half of the system starts. A FastAPI backend runs a LangGraph agent workflow. The graph routes the intent, enriches context, plans actions, classifies risk, waits for human approval where needed, executes tools, verifies the result, and writes an audit trail.

Here the agent has proposed three real actions: create a Gmail draft, create a Google Calendar reminder, and append the commitment to a Google Sheet.

The Human-in-the-Loop layer is important. Low-risk actions, like logging to Sheets or creating a personal calendar reminder, can execute automatically. Medium-risk actions, like drafting an email, go into the approval queue. I can approve, modify, reject, or let the timeout path execute according to the risk policy. High-risk actions would hard block.

Now I approve the Gmail draft.

The backend does not call random custom scripts directly. It calls a local ScreenOps Google MCP server over stdio. That MCP layer exposes tools for Gmail draft creation, Calendar event creation, Sheets append, and verification. After execution, the verification agent checks that the draft exists, the event exists, and the sheet row was appended.

So the screen data stayed private in the browser, but the outside world still changed through controlled MCP tool calls.

This is the main difference from a normal automation tool or a simple chatbot. ScreenOps combines local browser inference, a privacy-preserving JSON boundary, a LangGraph agent harness, Human-in-the-Loop risk control, MCP tool execution, and verification.

I also added evals so the project is not judged only by one happy-path demo. There are fifteen extraction scenarios checking intent, entity, action, deadline, fallback parsing, and false positives. There are also fifteen planning scenarios checking the expected action plan and risk classification.

Codex and OpenAI tools were used throughout the hackathon to break down the PRD, scaffold the React and FastAPI code, implement the LangGraph workflow, debug browser model issues, wire the MCP layer, write evals, and prepare the documentation. I manually reviewed the privacy boundary, Google OAuth setup, final scope, and demo path.

ScreenOps shows a practical direction for agentic AI in sensitive workplaces: local private sensing in the browser, structured intent at the boundary, and verified real-world action through MCP.

The screen stays private. The workflow still gets done.

## Short Backup Script

ScreenOps is a privacy-first agentic workspace assistant.

It solves a hard problem: the screen has the best context about work, but sensitive screen and audio data cannot be sent to a cloud AI model.

ScreenOps keeps that data local. In the browser, Screen Capture API and microphone input feed a Transformer.js and WebGPU model stack: SmolVLM for screen understanding, Whisper tiny for audio, and a local intent model for structured extraction.

The backend receives only intent JSON. No screenshots, no audio chunks, and no transcript blobs cross the boundary.

From that JSON, a FastAPI and LangGraph backend plans actions, classifies risk, and uses Human-in-the-Loop approval before executing real work.

In this demo, the agent detects one primary commitment from screen and audio context, auto-executes low-risk Calendar and Sheets actions, queues the medium-risk Gmail draft for approval, and then verifies the real Google Workspace results.

The tool layer runs through a local ScreenOps MCP server, exposing Gmail, Calendar, Sheets, and verification tools over stdio.

The project also includes evals: fifteen extraction scenarios and fifteen planning scenarios, both passing.

This is not a chatbot. It is a privacy-preserving agentic workflow system: local browser intelligence, structured intent boundary, LangGraph orchestration, MCP execution, and verified outcomes.
