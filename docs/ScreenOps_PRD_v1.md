# SCREENOPS
## Product Requirements Document
### Ambient Agentic Workspace Intelligence — Privacy-First by Architecture

**Version:** 1.1
**Event:** Codex Community Hackathon Kochi
**Date:** June 6–7, 2026
**Builder:** Jashwanth Reddy (Solo)

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Problem Statement](#2-problem-statement)
3. [System Architecture](#3-system-architecture)
4. [Human-in-the-Loop (HITL)](#4-human-in-the-loop-hitl-design)
5. [MCP Tool Layer](#5-mcp-tool-layer)
6. [Evaluation Framework](#6-evaluation-framework)
7. [Tech Stack](#7-tech-stack)
8. [MVP Scope](#8-mvp-scope-hackathon-build)
9. [Hackathon Build Plan](#9-hackathon-build-plan)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Future Roadmap](#11-future-roadmap-post-hackathon)
12. [Glossary](#12-glossary)

---

## 1. Product Overview

### 1.1 Product Name & Tagline

**ScreenOps**
*Your screen knows everything. Now it can act on it — without sending a single pixel to the cloud.*

---

### 1.2 The Core Problem

Your screen is the richest real-time context signal about your work. It captures meeting conversations, email threads, deadlines, action items, confidential documents, and live decisions — all simultaneously, all in context.

**But it is also the one thing you can never send to a cloud AI.**

Enterprise employees, lawyers, doctors, HR professionals, and financial analysts operate in environments where screen content cannot legally or professionally touch a third-party server. The result: the people with the most complex, high-stakes work get zero AI assistance on the most important context they have.

---

### 1.3 The Solution

ScreenOps is a **split-architecture ambient agent**. The browser runs inference locally using Transformer.js — reading the screen and transcribing audio without any raw data leaving the tab. The backend receives only structured intent signals, orchestrates a full LangGraph agent harness, and fires real-world actions through MCP tools.

> **Critical constraint:** Transformer.js is load-bearing in this architecture.
> - Replace with a cloud LLM → screen data hits third-party servers → GDPR violation in most enterprise contexts
> - Replace with a downloaded local model → requires install, IT approval, 8GB RAM → breaks zero-friction browser deployment
> - **There is no alternative implementation that preserves privacy at this level of integration.**

---

### 1.4 One-Line Architecture

```
Browser (sense + reason locally) → Structured JSON signal → Backend (orchestrate + act) → MCP tools → Real world
```

---

### 1.5 Privacy Guarantee

The guarantee is **architectural**, not a claim:

- Raw screen pixels never leave the browser tab
- Raw audio never leaves the browser tab
- The backend receives only structured intent JSON
- The backend has no knowledge of what the screen looked like
- Only MCP action payloads reach external services

---

## 2. Problem Statement

### 2.1 Who Is Blocked From AI Today

| Professional Category | Why Cloud AI Is Blocked |
|---|---|
| Enterprise employees | Screen may show proprietary IP, internal financials, unreleased product data |
| Healthcare workers | Patient data on screen = HIPAA violation if sent to cloud |
| Legal professionals | Client communications are attorney-client privileged |
| HR & Finance | Salary, performance, and financial data is strictly regulated |
| Journalists | Source protection prohibits third-party data exposure |

---

### 2.2 The Commitment Tracking Gap

During meetings, calls, and async work, professionals make and receive dozens of micro-commitments daily:
- *"Send me that by Friday"*
- *"I'll follow up with Ravi"*
- *"Let's schedule a review next week"*

These commitments:
- Are never captured in any system
- Require context-switching mid-conversation to log manually
- Fall through the cracks because no tool has access to the right context at the right time

ScreenOps watches the context passively and handles the operational overhead — **without the professional ever typing a prompt.**

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER TAB                          │
│                                                             │
│  Screen Capture API ──► SmolVLM (Transformer.js)           │
│  Microphone API     ──► Whisper tiny (Transformer.js)      │
│  Clipboard API      ──► Text parser                        │
│                               │                             │
│                       Intent Extractor                      │
│                    (Phi-3 mini, Transformer.js)             │
│                               │                             │
│                 { structured JSON signal only }             │
│                                                             │
│  ✗ Raw pixels never leave     ✗ Raw audio never leaves     │
└───────────────────────┬─────────────────────────────────────┘
                        │  HTTPS POST (structured signal only)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                      FASTAPI BACKEND                        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              LangGraph Agent Harness                 │   │
│  │                                                     │   │
│  │  Intent Router ──► Context Enricher                 │   │
│  │        │                  │                         │   │
│  │  Risk Classifier ◄────────┘                         │   │
│  │        │                                             │   │
│  │  Approval Gate (HITL) ◄── Human                     │   │
│  │        │                                             │   │
│  │  Execution Agent                                     │   │
│  │        │                                             │   │
│  │  Verification Agent                                  │   │
│  └────────┬────────────────────────────────────────────┘   │
│           │                                                  │
│  ┌────────▼──────────────────────────────────────────┐     │
│  │                  MCP Tool Layer                    │     │
│  │  Gmail MCP │ Calendar MCP │ Sheets MCP │ Drive MCP │     │
│  └───────────────────────────────────────────────────┘     │
│                                                             │
│  Redis (commitment memory)   Postgres (audit log)          │
└─────────────────────────────────────────────────────────────┘
```

---

### 3.2 Browser Layer (Zero Egress)

| Component | Model / API | What It Does |
|---|---|---|
| Screen reader | SmolVLM via Transformer.js | Reads active screen frames every 3s, extracts visible text and UI context |
| Audio transcriber | Whisper tiny via Transformer.js | Transcribes meeting audio in 10s chunks, detects speaker turns |
| Clipboard watcher | Browser Clipboard API | Reads clipboard on change, parses URLs, issue IDs, ticket numbers |
| Intent extractor | Phi-3 mini via Transformer.js | Fuses screen + audio + clipboard into structured intent JSON |
| Signal filter | Rule-based + embeddings | Deduplicates signals, suppresses low-confidence noise |

---

### 3.3 Intent Signal Schema

**This is the ONLY data that crosses the browser–backend boundary.**

```json
{
  "signal_id": "uuid",
  "signal_type": "commitment | deadline | question | task | mention",
  "source": "screen | audio | clipboard",
  "context": "meeting | email | document | code | chat",
  "entity": "Ravi",
  "action_required": "send report",
  "deadline": "Thursday",
  "confidence": 0.91,
  "timestamp": "ISO8601",
  "session_id": "uuid"
}
```

> **NOT in this payload:** screen pixels, audio samples, document content, email body text, passwords, or any raw visual or auditory data.

---

### 3.4 Backend Agent Harness (LangGraph Nodes)

| Agent Node | Responsibility |
|---|---|
| **Intent Router** | Classifies incoming signal type, selects specialist sub-graph |
| **Context Enricher** | Pulls current state from connected MCP tools — what is already on the calendar, what emails are open, what issues are assigned |
| **Action Planner** | Decides optimal sequence of MCP tool calls based on signal + enriched context |
| **Risk Classifier** | Scores proposed actions LOW / MEDIUM / HIGH, routes to approval gate accordingly |
| **Approval Gate (HITL)** | Surfaces medium and high risk actions for human approval before execution |
| **Execution Agent** | Fires approved MCP tool calls in sequence |
| **Verification Agent** | Polls MCP tools to confirm actions succeeded — email in drafts, calendar block exists, sheet row added |
| **Memory Manager** | Updates Redis with commitment state and session context |
| **Audit Logger** | Writes full reasoning trace to Postgres — signal, plan, risk score, approval, execution result, verification result |

---

### 3.5 Data Flow (Step by Step)

```
1. Browser captures screen frame / audio chunk / clipboard change
2. Transformer.js models run locally — SmolVLM + Whisper + Phi-3 mini
3. Intent extractor produces structured JSON signal
4. HTTPS POST to FastAPI /signals endpoint (JSON only, no raw data)
5. Intent Router classifies signal type
6. Context Enricher pulls state from MCP tools (read-only calls)
7. Action Planner builds proposed action sequence
8. Risk Classifier scores each action
9. LOW actions → auto-queue for execution
   MEDIUM actions → surface in approval queue (60s timeout)
   HIGH actions → hard block, wait for explicit approval
10. User approves via UI
11. Execution Agent fires MCP tool calls in sequence
12. Verification Agent confirms success via poll-back
13. Audit Logger writes full trace to Postgres
14. UI updates: action log, commitment tracker, agent trace panel
```

---

## 4. Human-in-the-Loop (HITL) Design

### 4.1 Risk Classification

| Risk Level | Example Actions | Behavior |
|---|---|---|
| **LOW** | Log to Sheets, create local reminder, tag a contact | Auto-execute immediately. Show in activity log. |
| **MEDIUM** | Draft an email, create a calendar block for self, create a GitHub issue | Surface in approval queue. Auto-execute after 60s timeout if no response. |
| **HIGH** | Send an email, create event for others, post to Slack, delete or overwrite data | Hard block. Explicit approval required. No timeout. Full context shown. |

---

### 4.2 Approval Queue UI — Card Spec

Each approval card surfaces:
- What the agent detected (quoted from the signal)
- What it is proposing to do (action description)
- Which MCP tools will be called
- Confidence score
- Risk level badge (colour-coded)
- Three action buttons: **Approve** / **Modify** / **Reject**

> **Trust calibration:** Over time the user can promote specific action types to a lower risk tier. Example: *"Always auto-execute calendar blocks for meetings with Ravi."* Stored in user preferences table in Postgres.

---

### 4.3 HITL State Machine

```
Signal received
     │
     ▼
Risk classified
     │
     ├── LOW ─────────────────────────► Auto-execute ──► Verify ──► Log
     │
     ├── MEDIUM ──► Queue (60s timeout)
     │                  ├── No response? ──► Auto-execute ──► Verify ──► Log
     │                  ├── Approved?    ──► Execute ──► Verify ──► Log
     │                  └── Rejected?    ──► Log rejection, no action
     │
     └── HIGH ──► Hard block ──► Wait for explicit approval
                      ├── Approved? ──► Execute ──► Verify ──► Log
                      └── Rejected? ──► Log rejection, no action
```

---

## 5. MCP Tool Layer

### 5.1 Connected MCP Servers

| MCP Server | Actions Used | Example Use Case |
|---|---|---|
| **Python ScreenOps Google MCP** | `gmail_draft_create`, `gmail_draft_verify` | Draft and verify a follow-up email after a commitment is detected |
| **Python ScreenOps Google MCP** | `calendar_event_create`, `calendar_event_verify` | Create and verify a reminder for the extracted deadline |
| **Python ScreenOps Google MCP** | `sheets_values_append`, `sheets_append_verify` | Log and verify the commitment in the tracker sheet |
| **Google Drive MCP** *(stretch)* | `create_file`, `update_file` | Create meeting notes doc from transcribed audio |
| **GitHub MCP** *(stretch)* | `create_issue`, `assign_issue`, `add_comment` | Create issue when bug report detected in clipboard |

---

### 5.2 MCP Transport and Deployment

The MVP uses a Python-based ScreenOps Google MCP server module instead of a platform-specific Google MCP binary. The FastAPI backend starts the MCP server over stdio and calls its tools through the MCP Python SDK.

Current implementation path:

```text
FastAPI / LangGraph
  -> MCP stdio client
  -> app.screenops_google_mcp
  -> official Google Gmail, Calendar, and Sheets APIs
```

This keeps the PRD's MCP tool boundary while making the deployment cross-platform. Locally it runs on Windows, and on Render it runs as a Python module without requiring `tools/google-mcp-server.exe`. Google OAuth token/config files are supplied as environment-specific secrets.

---

### 5.3 Tool Call Sequence Example

**Signal:** `commitment_detected` — *"send the Q3 report to Priya by Thursday"*

```
Step 1 — Context Enricher
  → Gmail MCP: list_threads(query="Priya Q3 report")
  → finds existing thread, extracts Priya's email address

Step 2 — Action Planner decides:
  a. Draft email reply to Priya referencing Q3 report
  b. Create calendar reminder: Thursday 9AM "Send Q3 report to Priya"
  c. Append row to Sheets commitment tracker

Step 3 — Risk Classifier:
  a. Email draft → MEDIUM
  b. Calendar block (self) → LOW
  c. Sheets append → LOW

Step 4 — Approval Gate:
  → Surfaces email draft card for approval
  → Auto-executes calendar + sheets as LOW-risk actions

Step 5 — User approves email draft

Step 6 — Execution Agent fires the MEDIUM-risk Gmail MCP call

Step 7 — Verification Agent:
  → Gmail: confirms draft exists in Drafts folder
  → Calendar: confirms event created at correct time
  → Sheets: confirms row appended with correct data

Step 8 — Audit Logger writes full trace to Postgres
```

---

## 6. Evaluation Framework

Three eval layers are baked **structurally** into the system — not added as an afterthought.

---

### 6.1 Layer 1 — Extraction Accuracy (Browser)

*Did the local Transformer.js models correctly extract intent from screen and audio?*

| Metric | Definition |
|---|---|
| **Intent Match Rate** | % of signals where extracted `signal_type` matches ground truth label |
| **Entity F1** | Precision and recall on extracted entities (person name, deadline, action verb) |
| **False Positive Rate** | Signals fired on benign screen content with no actionable intent |
| **Latency p95** | Time from screen frame capture to signal dispatched, 95th percentile |

---

### 6.2 Layer 2 — Action Correctness (Backend)

*Did the agent propose the right MCP actions for the detected intent?*

| Metric | Definition |
|---|---|
| **Action Precision** | Fraction of proposed actions that were correct given the signal |
| **Action Recall** | Fraction of expected actions that were actually proposed |
| **Risk Classification Accuracy** | Fraction of actions correctly classified as LOW / MEDIUM / HIGH |
| **Unnecessary Actions Rate** | Fraction of proposed actions that were redundant or already done |

---

### 6.3 Layer 3 — End-to-End Verification (Real World)

*After MCP execution — did it actually work?*

| Metric | Definition |
|---|---|
| **Execution Success Rate** | Fraction of approved actions that succeeded at the MCP level |
| **Verification Confirmation Rate** | Fraction of executed actions confirmed by verification agent poll-back |
| **Recovery Rate** | Fraction of failed executions successfully recovered via retry or fallback |
| **False Completion Rate** | Actions marked successful by MCP but not actually reflected in the target app |

---

### 6.4 Eval Dataset — Golden Set (15 Scenarios)

- 5 × meeting transcript scenarios with embedded commitments
- 5 × email thread scenarios with unanswered questions and deadlines
- 5 × mixed scenarios combining screen content + audio + clipboard

**Each scenario includes:**
- Ground truth `signal_type`
- Expected extracted entities
- Expected proposed action set
- Expected MCP calls (name + params)
- Expected risk classification per action

> **Eval runner:** A script that replays each scenario through the full pipeline end-to-end and compares outputs against ground truth, producing a per-layer accuracy report with pass/fail per scenario.

---

## 7. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Browser inference | Transformer.js v4 (WebGPU) | Only viable path for local inference in browser — load-bearing for the privacy guarantee |
| Screen understanding | SmolVLM via Transformer.js | Lightweight VLM, runs at acceptable speed in browser with WebGPU |
| Audio transcription | Whisper tiny via Transformer.js | Fast, accurate enough for commitment detection in meeting audio |
| Intent reasoning | Phi-3 mini via Transformer.js | Small enough for browser, strong enough for structured signal extraction |
| Backend framework | FastAPI (Python) | Async, lightweight, pairs naturally with LangGraph and Python MCP SDKs |
| Agent orchestration | LangGraph | Native support for stateful graph-based workflows, branching, retries, HITL interrupts |
| MCP tooling | Python ScreenOps Google MCP server, MCP Python SDK | Cross-platform stdio MCP tool boundary for Gmail, Calendar, and Sheets; wraps official Google APIs and deploys on Render without a platform-specific binary |
| Commitment memory | Redis | Fast session-level and cross-session commitment state tracking |
| Audit log | Postgres | Durable, queryable audit trail for all agent actions and reasoning traces |
| Frontend | React + Tailwind | Streaming approval queue UI, agent trace panel, action log |
| Real-time streaming | WebSocket or SSE | Push agent trace updates from backend to frontend in real time |

### 7.1 Hardware Validation Update (v1.1)

The MVP target machine has been validated as an Intel i7 system with an NVIDIA RTX 4060 GPU and 8GB VRAM. This removes the earlier need for browser-layer mocks.

The full local inference stack is expected to fit comfortably in GPU memory:

| Model | Approximate Footprint | Purpose |
|---|---:|---|
| SmolVLM | ~500MB | Live screen understanding from Screen Capture API frames |
| Whisper tiny | ~150MB | Live meeting audio transcription from microphone input |
| Phi-3 mini, 4-bit quantized | ~2.3GB | Local structured intent extraction |

Total expected model memory is under 3GB, leaving roughly 5GB of VRAM headroom on the RTX 4060. All three models are therefore in MVP scope as live WebGPU-accelerated browser inference components.

Implementation note: the browser inference stack runs inside a dedicated Web Worker. If Phi-3 mini hits a browser ONNX external-data loading failure, the local intent extractor falls back to SmolLM2-360M-Instruct so the demo remains fully on-device.

This makes the core privacy guarantee demonstrable in real time: screen frames and audio chunks remain inside the browser tab, while the network inspector can show that only structured intent JSON is sent to the backend.

---

## 8. MVP Scope (Hackathon Build)

> **Goal:** A working end-to-end demo, not a complete product. Every item below must function for the 90-second demo flow.

---

### 8.1 What Gets Built Real

- [ ] Live Screen Capture API browser layer feeding SmolVLM through Transformer.js/WebGPU
- [ ] Live microphone capture feeding Whisper tiny through Transformer.js/WebGPU
- [ ] Intent extractor: Phi-3 mini 4-bit quantized producing structured JSON signals from fused screen and audio context
- [ ] FastAPI backend: `/signals` endpoint receiving and routing intent JSON
- [ ] LangGraph orchestrator: intent router → context enricher → risk classifier → approval gate → execution agent → verification agent
- [ ] Python MCP Gmail integration: `gmail_draft_create` from signal context
- [ ] Python MCP Google Calendar integration: `calendar_event_create`
- [ ] Python MCP Google Sheets integration: `sheets_values_append`
- [ ] Redis: commitment state tracking across session
- [ ] Postgres: audit log schema + writer
- [ ] React frontend: approval queue UI + streaming agent trace panel + action log

---

### 8.2 What Is No Longer Mocked in v1.1

- Screen capture is live through the browser Screen Capture API.
- Audio capture is live through the browser microphone permission flow.
- SmolVLM, Whisper tiny, and Phi-3 mini run locally in the browser through Transformer.js/WebGPU.
- The demo must not send raw screen pixels, raw audio, or full transcript blobs to the backend.

### 8.3 What Remains Out of Scope or Stretch

- GitHub MCP is a stretch integration and may be shown only as a proposed future action.
- Multi-window context fusion remains future roadmap.
- Enterprise browser extension packaging remains future roadmap.

---

### 8.4 Demo Flow (90 Seconds)

```
1. Open browser tab → click "Start ScreenOps"
2. Browser requests screen share and microphone permissions
3. Agent trace panel shows live:
     SmolVLM reading live screen frames on WebGPU
     Whisper tiny transcribing live meeting audio on WebGPU
     Phi-3 mini extracting intent locally on WebGPU
4. Network inspector visible in corner → zero outbound raw data
5. Backend log populates:
     "Commitment detected — send report to Priya by Thursday, confidence 0.91"
6. Approval queue UI populates:
     Gmail draft card (MEDIUM — approval required)
     Calendar block (LOW — auto-queuing)
     Sheets log (LOW — auto-queuing)
7. User clicks Approve on Gmail draft
8. All three MCP calls fire:
     Gmail → draft appears in Drafts
     Calendar → block visible in Google Calendar
     Sheets → row added to tracker
9. Audit log shown → full reasoning trace, every tool call, every verification result
```

**The screen data stayed in the browser. The world changed anyway.**

---

## 9. Hackathon Build Plan

> **Single builder. 11 hours. 8PM June 6 → 7AM June 7. Build in this exact order.**

| Phase | Time Window | What to Build |
|---|---|---|
| **Phase 1** — Setup | 8:00–9:00 PM | Repo scaffold. FastAPI running. React skeleton. Transformer.js loading SmolVLM in browser. Verify WebGPU acceleration. |
| **Phase 2** — Browser layer | 9:00–10:30 PM | Screen Capture API → SmolVLM → raw text out. Whisper tiny on mic input → transcript out. Phi-3 mini fusing both → intent JSON out. Verify signal schema. |
| **Phase 3** — Backend harness | 10:30 PM–12:00 AM | FastAPI `/signals` endpoint. LangGraph graph wired: intent router → risk classifier → approval gate → execution placeholder. Redis + Postgres schema. Audit logger. |
| **Phase 4** — MCP wiring | 12:00–2:00 AM | Wire Gmail MCP: `draft_email`. Wire Calendar MCP: `create_event`. Wire Sheets MCP: `append_row`. Test each MCP call independently before connecting to LangGraph. |
| **Phase 5** — Verification + HITL UI | 2:00–3:30 AM | Verification agent polling MCP after execution. Approval queue cards in React. WebSocket / SSE streaming trace from backend. Approve / Reject working end-to-end. |
| **Phase 6** — Eval runner | 3:30–5:00 AM | Build eval script against 5 golden scenarios. Measure extraction accuracy, action correctness, execution success rate. Fix whatever is broken in the demo flow. |
| **Phase 7** — Demo prep | 5:00–6:30 AM | Lock 90-second demo flow. Prepare static meeting scenario. Rehearse narration. Prepare one-sentence architecture explanation. |
| **Phase 8** — Buffer | 6:30–7:00 AM | Fix last-minute issues. Do NOT add features. Rehearse twice more. |

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Signal extraction latency | < 3 seconds from screen frame capture to JSON signal dispatched to backend |
| Backend round-trip | < 1 second from signal received to action queue populated in UI |
| MCP execution latency | < 2 seconds per MCP tool call |
| Raw data egress | **Zero bytes** of screen, audio, or clipboard raw data leave the browser |
| Audit completeness | 100% of executed actions logged with full reasoning trace |
| HITL responsiveness | Approval queue card renders within 500ms of backend decision |
| Verification coverage | Every executed MCP action has a corresponding verification poll |

---

## 11. Future Roadmap (Post-Hackathon)

### Phase 2
- Continuous capture loop with rolling screen/audio windows instead of one manual chunk per run
- Multi-turn local context memory for follow-up audio that refers to previously visible screen content
- Trust calibration — user teaches agent their approval preferences over time
- Production persistence with Redis run state and Postgres audit storage
- Slack MCP, Notion MCP, Linear MCP integration

### Phase 3
- Multi-window context fusion — agent understands relationships between open tabs
- Proactive morning briefing — open commitments summary + suggested actions
- Team mode — shared commitment tracking across multiple users via Sheets
- Automated browser-level model quality evals using recorded screen/audio fixtures

### Phase 4
- Enterprise deployment — IT-managed browser extension with org-level MCP config
- Compliance mode — HIPAA and SOC2 audit trail export
- On-device fine-tuning — models adapt to individual user's commitment language patterns

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Transformer.js** | JavaScript library that runs Hugging Face transformer models directly in the browser using WebGPU or WASM — no server required |
| **MCP (Model Context Protocol)** | Anthropic's open protocol for connecting AI agents to external tools and services through standardized server interfaces |
| **HITL** | Human-in-the-Loop — the architectural pattern where the agent pauses and surfaces proposed actions for human review before executing |
| **Intent signal** | The structured JSON object produced by the browser's local inference layer — the only data that crosses to the backend |
| **LangGraph** | Python library for building stateful, graph-based agent workflows — supports branching, retries, cycles, and HITL interrupts |
| **SmolVLM** | A small vision-language model capable of understanding screen content — runs fast enough for near-real-time inference in browser |
| **Verification agent** | The LangGraph node that poll-confirms MCP actions actually succeeded after execution |
| **Risk classifier** | The LangGraph node that scores proposed actions as LOW / MEDIUM / HIGH and routes to the appropriate HITL tier |
| **Commitment** | An actionable obligation detected from screen or audio context — the core unit ScreenOps tracks and acts on |
| **Zero egress** | The architectural property that no raw sensory data (screen, audio, clipboard) ever leaves the browser tab |

---

## 13. Implementation Status Matrix

Last updated: June 7, 2026

Status legend:

| Status | Meaning |
|---|---|
| **Done** | Implemented and verified for the current MVP/demo scope |
| **Partial** | Implemented in part, or implemented but still needs runtime/demo validation |
| **Not Yet** | Not implemented in the current build |

| PRD Section | Status | Current Evidence / Gap |
|---|---|---|
| **1. Product Overview** | **Done** | Product positioning, privacy-first architecture, and intent-only backend boundary are reflected in docs and implementation. |
| **2. Problem Statement** | **Done** | Commitment tracking problem and target user gap are captured as product context. |
| **3. System Architecture** | **Partial** | Browser, backend, LangGraph agent, approval flow, MCP execution, and audit logging exist. Redis/Postgres are not implemented; current MVP uses in-memory run state plus SQLite audit. |
| **3.1 High-Level Architecture** | **Partial** | Main flow exists: browser local inference UI to FastAPI backend to LangGraph to MCP tools. Production-grade persistence pieces remain simplified. |
| **3.2 Browser Layer (Zero Egress)** | **Partial** | Screen capture, microphone capture, Web Worker model loading, and structured signal sending are implemented. Final live WebGPU validation on the target RTX 4060 machine still needs to be demonstrated in-browser. |
| **3.3 Intent Signal Schema** | **Done** | Shared structured signal model is implemented in backend models and frontend intent extraction flow. |
| **3.4 Backend Agent Harness** | **Partial** | LangGraph planning/execution/verification nodes are implemented. Redis memory manager and Postgres audit store are not implemented; SQLite audit is used for MVP. |
| **3.5 Data Flow** | **Partial** | End-to-end backend flow is implemented and smoke-tested with real Google actions. Full live browser-to-model demo still needs final operator validation. |
| **4. Human-in-the-Loop Design** | **Done** | LOW-risk actions auto-execute, MEDIUM-risk actions queue for approval with a 60-second timeout, and approve/modify/reject decisions are implemented. Trust calibration remains a roadmap item, not MVP scope. |
| **4.1 Risk Classification** | **Done** | LOW/MEDIUM/HIGH classification is implemented in the agent planning path. |
| **4.2 Approval Queue UI** | **Done** | Approval cards render proposed actions with approve, modify, and reject controls. |
| **4.3 HITL State Machine** | **Done** | The implemented state machine covers low-risk auto-execution, medium-risk queueing, 60-second timeout auto-execution, approval, modification, rejection, verification, and audit logging. |
| **5. MCP Tool Layer** | **Partial** | Core Gmail, Calendar, and Sheets actions run through the Python ScreenOps MCP stdio server with verification tools. Drive/GitHub stretch integrations are not implemented. |
| **5.1 Connected MCP Servers** | **Partial** | Gmail, Calendar, and Sheets are covered by the Python ScreenOps Google MCP server. Drive and GitHub remain stretch/not implemented. |
| **5.2 MCP Transport and Deployment** | **Done** | The active MVP path uses a Python MCP module over stdio, deployable on Render without the old Windows Google MCP binary. |
| **5.3 Tool Call Sequence Example** | **Done** | The planned Gmail, Calendar, and Sheets sequence has been implemented and verified through MCP-backed tool calls. |
| **6. Evaluation Framework** | **Done** | MVP eval coverage includes backend planning/action evals and frontend extraction evals with persisted metrics. Browser-level model quality evals remain a future roadmap item. |
| **6.1 Extraction Accuracy** | **Done** | Extraction fixture evals validate JSON parsing, fallback extraction, entity/action/deadline matching, false-positive rate, and write metrics to `evals/extraction_metrics.json`. |
| **6.2 Action Correctness** | **Done** | Backend planning/action scenarios are covered by golden evals. |
| **6.3 End-to-End Verification** | **Partial** | Real Gmail/Calendar/Sheets verification is implemented and smoke-tested. Automated full browser-to-Google regression testing is not yet implemented. |
| **6.4 Golden Set** | **Done** | 15 planning scenarios and 15 extraction scenarios are present. |
| **7. Tech Stack** | **Partial** | React/Vite, FastAPI, LangGraph, Google APIs, MCP SDK, and Transformer.js are implemented. Redis/Postgres from the PRD are replaced by simpler MVP storage. |
| **7.1 Hardware Validation Update** | **Partial** | Hardware assumption is documented and model stack is wired. Live in-browser WebGPU model loading on the confirmed RTX 4060 machine still needs final validation. |
| **8. MVP Scope** | **Partial** | Core MVP is substantially implemented: local inference path, approval queue, agent harness, MCP Google actions, HITL timeout behavior, and audit trail. Remaining gaps are live browser model validation and production persistence. |
| **8.1 What Gets Built Real** | **Partial** | Real backend actions, Google integrations, HITL, audit, and local inference wiring are built. Persistence and final live model proof are still incomplete. |
| **8.2 What Is No Longer Mocked in v1.1** | **Partial** | Code path avoids browser-layer mocks, but this claim still needs live demo proof via network inspector and model loading on the target machine. |
| **8.3 Out of Scope or Stretch** | **Done** | Stretch items are clearly separated and not required for MVP completion. |
| **8.4 Demo Flow** | **Partial** | Demo script and backend action flow are ready. The live browser capture/model/network-inspector proof still needs to be performed during the demo. |
| **9. Hackathon Build Plan** | **Partial** | Most planned build phases are complete. Remaining work is focused on runtime validation, presentation polish, and any final demo recording assets. |
| **10. Non-Functional Requirements** | **Partial** | Zero-egress design is implemented by sending only structured intent JSON. Latency targets, automated network proof, and production reliability metrics are not fully measured. |
| **11. Future Roadmap** | **Not Yet** | Post-hackathon roadmap items are documented only. |
| **12. Glossary** | **Done** | Key product and architecture terms are documented. |

---

*ScreenOps PRD v1.1 — Single Source of Truth — Do not modify without versioning*
