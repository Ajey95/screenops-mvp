import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  CalendarClock,
  Check,
  Database,
  FileText,
  Mail,
  Play,
  ShieldCheck,
  XCircle
} from "lucide-react";
import {
  captureFrame,
  checkWebGpu,
  decodeAudioBlob,
  isStreamActive,
  preloadLocalModels,
  recordAudioChunk,
  runLocalInference,
  startMicrophone,
  startScreenCapture
} from "./localInference";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8001";

type Risk = "LOW" | "MEDIUM" | "HIGH";
type ActionStatus = "queued" | "pending_approval" | "approved" | "executed" | "failed";
type ModelStatus = "idle" | "loading" | "loaded" | "failed";
type ApprovalDecision = "approve" | "reject" | "modify" | "timeout";
type SignalSource = "screen" | "audio" | "screen_audio" | "clipboard" | "replay";

type AuthStatus = {
  google_token_present: boolean;
  mcp_binary_present: boolean;
  mcp_config_present: boolean;
  sheet_id: string;
  recipient_email: string;
};

type TraceEvent = {
  step: string;
  status: string;
  detail: string;
};

type ProposedAction = {
  action_id: string;
  tool: string;
  description: string;
  risk: Risk;
  status: ActionStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
};

type AgentRun = {
  run_id: string;
  signal: {
    signal_id: string;
    signal_type: string;
    source: string;
    context: string;
    entity: string;
    action_required: string;
    deadline: string;
    confidence: number;
    recipient_email?: string | null;
    timestamp: string;
    session_id: string;
  };
  trace: TraceEvent[];
  actions: ProposedAction[];
  audit_log: Array<Record<string, unknown>>;
};

const buildSignal = (
  intent: { entity: string; action_required: string; deadline: string; confidence: number },
  source: SignalSource,
  screenText: string
) => ({
  signal_type: "commitment",
  source,
  context: "meeting",
  entity: intent.entity,
  action_required: intent.action_required,
  deadline: intent.deadline,
  confidence: intent.confidence,
  recipient_email: extractRecipientEmail(screenText, intent.entity),
  timestamp: new Date().toISOString(),
  session_id: crypto.randomUUID()
});

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

function isRunNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Run not found");
}

function inferSignalSource(screenText: string, transcript: string): SignalSource {
  const hasScreen = screenText.trim().length > 20;
  const hasAudio = transcript.trim().length > 12;
  if (hasScreen && hasAudio) return "screen_audio";
  if (hasAudio) return "audio";
  if (hasScreen) return "screen";
  return "audio";
}

function extractRecipientEmail(text: string, entity: string): string | null {
  const emails = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) => match[0]);
  if (emails.length === 0) return null;

  const normalizedEntity = entity.toLowerCase();
  const entityTokens = normalizedEntity.split(/\s+/).filter((token) => token.length > 2);
  const matchingEmail = emails.find((email) => entityTokens.some((token) => email.toLowerCase().includes(token)));
  return matchingEmail ?? emails[0];
}

function ResultDetails({ action }: { action: ProposedAction }) {
  if (!action.result) return null;
  const link = String(action.result.html_link ?? "");
  const summary = String(action.result.summary ?? "");
  const start = action.result.start as { dateTime?: string; date?: string; timeZone?: string } | undefined;
  const verification = action.result.verification as { updated_range?: string; draft_id?: string; event_id?: string } | undefined;
  const updates = action.result.updates as { updatedRange?: string } | undefined;

  return (
    <div className="result-details">
      {summary && <span>{summary}</span>}
      {start?.dateTime && <span>{new Date(start.dateTime).toLocaleString()}</span>}
      {updates?.updatedRange && <span>Sheet range: {updates.updatedRange}</span>}
      {verification?.updated_range && <span>Sheet range: {verification.updated_range}</span>}
      {link && (
        <a href={link} target="_blank" rel="noreferrer">
          Open in Google Calendar
        </a>
      )}
    </div>
  );
}

function RiskBadge({ risk }: { risk: Risk }) {
  return <span className={`risk risk-${risk.toLowerCase()}`}>{risk}</span>;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status status-${status.replace("_", "-")}`}>{status.replace("_", " ")}</span>;
}

function ToolIcon({ tool }: { tool: string }) {
  if (tool.includes("gmail")) return <Mail size={18} />;
  if (tool.includes("calendar")) return <CalendarClock size={18} />;
  if (tool.includes("sheets")) return <Database size={18} />;
  return <Activity size={18} />;
}

function App() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webGpu, setWebGpu] = useState<boolean | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelStatusDetail, setModelStatusDetail] = useState("Local models are not loaded yet.");
  const [modelLog, setModelLog] = useState<string[]>([]);
  const [screenText, setScreenText] = useState("");
  const [transcript, setTranscript] = useState("");
  const [intentPreview, setIntentPreview] = useState<Record<string, unknown> | null>(null);
  const [llmRaw, setLlmRaw] = useState("");
  const [screenActive, setScreenActive] = useState(false);
  const [approvalCountdown, setApprovalCountdown] = useState<number | null>(null);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const priorContextRef = useRef<{
    screenText: string;
    transcript: string;
    intent: { entity: string; action_required: string; deadline: string; confidence: number; extraction_mode: "phi3" | "local_safety_parser" } | null;
  } | null>(null);

  useEffect(() => {
    fetchJson<AuthStatus>("/api/auth/status")
      .then(setAuth)
      .catch((err) => setError(String(err)));
    checkWebGpu().then(setWebGpu);
  }, []);

  const readiness = useMemo(() => {
    if (!auth) return [];
    return [
      ["WebGPU available", webGpu === true],
      ["MCP binary", auth.mcp_binary_present],
      ["MCP config", auth.mcp_config_present],
      ["Google token", auth.google_token_present]
    ] as const;
  }, [auth, webGpu]);

  function addModelLog(message: string) {
    setModelLog((current) => [...current.slice(-5), message]);
  }

  const hasPendingApproval = Boolean(run?.actions.some((action) => action.status === "pending_approval"));
  const pendingEmailAction = run?.actions.find((action) => action.tool === "gmail.drafts.create" && action.status === "pending_approval");

  useEffect(() => {
    if (!run || !hasPendingApproval) {
      setApprovalCountdown(null);
      return undefined;
    }

    setApprovalCountdown(60);
    const interval = window.setInterval(() => {
      setApprovalCountdown((current) => {
        if (current === null) return null;
        return Math.max(0, current - 1);
      });
    }, 1000);
    const timeout = window.setTimeout(() => {
      submitDecision("timeout");
    }, 60000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [run?.run_id, hasPendingApproval]);

  async function warmModels() {
    setBusy(true);
    setError(null);
    setModelStatus("loading");
    setModelStatusDetail("Loading local inference stack...");
    try {
      await preloadLocalModels(addModelLog);
      setModelStatus("loaded");
      setModelStatusDetail("Local models loaded and ready.");
    } catch (err) {
      setModelStatus("failed");
      setModelStatusDetail("Model warm-up failed.");
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function startLiveCapture() {
    setBusy(true);
    setError(null);
    try {
      if (!videoRef.current) throw new Error("Video element is not ready.");
      if (!isStreamActive(screenStreamRef.current)) {
        addModelLog("Requesting screen capture permission");
        screenStreamRef.current = await startScreenCapture(videoRef.current);
        screenStreamRef.current.getVideoTracks().forEach((track) => {
          track.onended = () => setScreenActive(false);
        });
        screenStreamRef.current.getAudioTracks().forEach((track) => {
          track.onended = () => addModelLog("Shared screen audio ended");
        });
        setScreenActive(true);
      } else {
        addModelLog("Reusing active screen share");
      }
      if (!isStreamActive(micStreamRef.current)) {
        addModelLog("Requesting microphone permission");
        micStreamRef.current = await startMicrophone();
      } else {
        addModelLog("Reusing active microphone stream");
      }
      addModelLog("Capturing screen frame");
      const frame = captureFrame(videoRef.current);
      addModelLog("Recording and transcribing local audio chunk");
      const screenAudioTracks = screenStreamRef.current.getAudioTracks().filter((track) => track.readyState === "live");
      const audioStream =
        screenAudioTracks.length > 0 ? new MediaStream(screenAudioTracks) : micStreamRef.current;
      addModelLog(screenAudioTracks.length > 0 ? "Using shared tab/system audio for Whisper" : "Using microphone audio for Whisper");
      const audio = await recordAudioChunk(audioStream, 6000);
      const audioData = await decodeAudioBlob(audio);
      addModelLog("Waiting for local screen and audio outputs before backend signal");
      const localResult = await runLocalInference(frame, audioData, priorContextRef.current, addModelLog);
      const effectiveScreenText = localResult.screenText;
      const effectiveIntent = localResult.intent;
      setScreenText(effectiveScreenText);
      setTranscript(localResult.transcript);
      setLlmRaw(localResult.llmRaw);
      setIntentPreview(effectiveIntent);
      priorContextRef.current = {
        screenText: effectiveScreenText || priorContextRef.current?.screenText || "",
        transcript: localResult.transcript || priorContextRef.current?.transcript || "",
        intent: effectiveIntent
      };
      const nextRun = await fetchJson<AgentRun>("/api/signals", {
        method: "POST",
        body: JSON.stringify(buildSignal(effectiveIntent, inferSignalSource(effectiveScreenText, localResult.transcript), effectiveScreenText))
      });
      addModelLog("Structured JSON signal sent after local fusion");
      setRun(nextRun);
      setIsEditingDraft(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision(decision: ApprovalDecision) {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      const firstEmail = run.actions.find((action) => action.tool === "gmail.drafts.create");
      const emailPayload = firstEmail?.payload ?? {};
      const updated = await fetchJson<AgentRun>(`/api/runs/${run.run_id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          approve_medium_actions: decision !== "reject",
          decision,
          modified_email_subject:
            decision === "modify" ? draftSubject || String(emailPayload.subject ?? "ScreenOps follow-up") : null,
          modified_email_body:
            decision === "modify"
              ? draftBody || String(emailPayload.body ?? "")
              : null
        })
      });
      setRun(updated);
      setIsEditingDraft(false);
    } catch (err) {
      if (isRunNotFoundError(err)) {
        setRun(null);
        setApprovalCountdown(null);
        setError("This approval run expired because the backend restarted. Start Live ScreenOps again to create a fresh run.");
      } else {
        setError(String(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function startDraftEdit() {
    const firstEmail = run?.actions.find((action) => action.tool === "gmail.drafts.create");
    const emailPayload = firstEmail?.payload ?? {};
    setDraftSubject(String(emailPayload.subject ?? "ScreenOps follow-up"));
    setDraftBody(String(emailPayload.body ?? ""));
    setIsEditingDraft(true);
  }

  return (
    <main className="app">
      <section className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Privacy-first agentic workspace</p>
            <h1>ScreenOps</h1>
          </div>
          <button className="primary" onClick={startLiveCapture} disabled={busy}>
            <Play size={18} />
            {screenActive ? "Run Again on Current Share" : "Start Live ScreenOps"}
          </button>
          <button className="secondary" onClick={warmModels} disabled={busy || modelStatus === "loading" || modelStatus === "loaded"}>
            <Activity size={18} />
            {modelStatus === "loaded" ? "Models Loaded" : "Load Local Models"}
          </button>
          <span className={`model-state model-state-${modelStatus}`} aria-live="polite">
            {modelStatusDetail}
          </span>
        </header>

        <section className="hero">
          <div className="scenario">
            <div className="meeting-bar">
              <span className="dot live" />
              Live screen and microphone capture
              <span>{webGpu ? "WebGPU" : "Checking GPU"}</span>
            </div>
            <div className="live-stage">
              <video ref={videoRef} className="screen-video" muted playsInline />
              <div className="transcript">
                <p><strong>Screen reader:</strong> {screenText || "Waiting for SmolVLM output."}</p>
                <p><strong>Whisper:</strong> {transcript || "Waiting for local microphone transcription."}</p>
                <p><strong>Intent model:</strong> {intentPreview ? JSON.stringify(intentPreview) : "Waiting for structured JSON."}</p>
                <p><strong>Browser LLM raw:</strong> {llmRaw || "Waiting for model generation."}</p>
              </div>
            </div>
          </div>

          <div className="privacy-panel">
            <ShieldCheck size={24} />
            <div>
              <h2>Zero raw data egress</h2>
              <p>Screen frames, microphone chunks, and model inference stay in the browser. The backend receives only the final intent JSON.</p>
            </div>
          </div>
        </section>

        <section className="grid">
          <div className="panel">
            <div className="panel-title">
              <Activity size={18} />
              Runtime readiness
            </div>
              <div className="readiness">
                {readiness.map(([label, ok]) => (
                <div className="ready-row" key={label}>
                  {ok ? <Check size={16} /> : <XCircle size={16} />}
                  <span>{label}</span>
                </div>
              ))}
            </div>
            {auth && (
              <div className="mini">
                <p>Recipient: {auth.recipient_email}</p>
                <p>Sheet: {auth.sheet_id}</p>
              </div>
            )}
            <div className="mini">
              {modelLog.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <FileText size={18} />
              Intent signal
            </div>
            {run ? (
              <pre className="json">{JSON.stringify(run.signal, null, 2)}</pre>
            ) : (
              <p className="empty">Start live capture to emit the structured signal.</p>
            )}
          </div>
        </section>

        <section className="workspace">
          <div className="panel trace-panel">
            <div className="panel-title">
              <Activity size={18} />
              Agent trace
            </div>
            <div className="trace">
              {(run?.trace ?? []).map((event, index) => (
                <div className="trace-row" key={`${event.step}-${index}`}>
                  <span className="trace-index">{index + 1}</span>
                  <div>
                    <div className="trace-head">
                      <strong>{event.step}</strong>
                      <StatusPill status={event.status} />
                    </div>
                    <p>{event.detail}</p>
                  </div>
                </div>
              ))}
              {!run && <p className="empty">No trace yet.</p>}
            </div>
          </div>

          <div className="panel action-panel">
            <div className="panel-title">
              <ShieldCheck size={18} />
              Approval queue
            </div>
            <div className="actions">
              {(run?.actions ?? []).map((action) => (
                <article className="action-card" key={action.action_id}>
                  <div className="action-head">
                    <ToolIcon tool={action.tool} />
                    <div>
                      <strong>{action.tool}</strong>
                      <p>{action.description}</p>
                    </div>
                    <RiskBadge risk={action.risk} />
                  </div>
                  <div className="action-foot">
                    <StatusPill status={action.status} />
                    {action.result && <span className="result">verified result captured</span>}
                    {action.error && <span className="error-text">{action.error}</span>}
                  </div>
                  <ResultDetails action={action} />
                </article>
              ))}
              {!run && <p className="empty">Actions will appear after intent routing.</p>}
            </div>
            {run && hasPendingApproval && (
              <div className="approval-buttons">
                {approvalCountdown !== null && (
                  <span className="timeout-note">Auto-executes in {approvalCountdown}s</span>
                )}
                <button className="approve" onClick={() => submitDecision("approve")} disabled={busy}>
                  <Check size={18} />
                  Approve and Execute
                </button>
                {!isEditingDraft && (
                  <button className="secondary compact" onClick={startDraftEdit} disabled={busy}>
                    <FileText size={18} />
                    Modify Draft
                  </button>
                )}
                <button className="danger compact" onClick={() => submitDecision("reject")} disabled={busy}>
                  <XCircle size={18} />
                  Reject
                </button>
              </div>
            )}
            {run && pendingEmailAction && isEditingDraft && (
              <div className="draft-editor">
                <label>
                  Subject
                  <input value={draftSubject} onChange={(event) => setDraftSubject(event.target.value)} />
                </label>
                <label>
                  Body
                  <textarea value={draftBody} onChange={(event) => setDraftBody(event.target.value)} rows={7} />
                </label>
                <div className="editor-actions">
                  <button className="approve" onClick={() => submitDecision("modify")} disabled={busy}>
                    <Check size={18} />
                    Save and Execute Draft
                  </button>
                  <button className="secondary compact" onClick={() => setIsEditingDraft(false)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {error && <div className="error">{error}</div>}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
