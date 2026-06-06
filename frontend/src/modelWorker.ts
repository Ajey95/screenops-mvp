import { AutoModelForImageTextToText, AutoProcessor, RawImage, env, pipeline } from "@huggingface/transformers";
import { createWorker } from "tesseract.js";
import { parseIntent, type Intent } from "./intentParser";

type WorkerRequest =
  | { id: string; type: "load" }
  | {
      id: string;
      type: "infer";
      imageDataUrl: string;
      audioData: Float32Array;
      priorContext: PriorLocalContext | null;
    };

type PriorLocalContext = {
  screenText: string;
  transcript: string;
  intent: Intent | null;
};

type LoadedModels = {
  screenReader: {
    processor: any;
    model: any;
  };
  transcriber: any;
  intentExtractor: any;
};

const MODEL_CONFIG = {
  screenReader: "HuggingFaceTB/SmolVLM-256M-Instruct",
  transcriber: "onnx-community/whisper-tiny.en",
  intentExtractor: "HuggingFaceTB/SmolLM2-360M-Instruct"
} as const;

let models: LoadedModels | null = null;
let ocrWorker: Awaited<ReturnType<typeof createWorker>> | null = null;

function post(id: string, type: string, payload: Record<string, unknown> = {}) {
  self.postMessage({ id, type, ...payload });
}

async function loadModels(id: string): Promise<LoadedModels> {
  if (models) return models;

  env.allowLocalModels = true;
  const device = "gpu" in navigator ? "webgpu" : "wasm";
  post(id, "progress", { message: `Runtime selected: ${device.toUpperCase()}` });

  post(id, "progress", { message: `Loading SmolVLM: ${MODEL_CONFIG.screenReader}` });
  const [screenProcessor, screenModel] = await Promise.all([
    (AutoProcessor as any).from_pretrained(MODEL_CONFIG.screenReader),
    (AutoModelForImageTextToText as any).from_pretrained(MODEL_CONFIG.screenReader, {
      device,
      dtype: "q4"
    })
  ]);
  const screenReader = { processor: screenProcessor, model: screenModel };

  post(id, "progress", { message: `Loading Whisper tiny: ${MODEL_CONFIG.transcriber}` });
  const transcriber = await (pipeline as any)("automatic-speech-recognition", MODEL_CONFIG.transcriber, {
    device,
    dtype: "q4"
  });

  const intentExtractor = await loadIntentExtractor(id, device);

  models = { screenReader, transcriber, intentExtractor };
  post(id, "progress", { message: "All local models are loaded" });
  return models;
}

async function loadIntentExtractor(id: string, device: string) {
  post(id, "progress", { message: `Loading intent model: ${MODEL_CONFIG.intentExtractor}` });
  return (pipeline as any)("text-generation", MODEL_CONFIG.intentExtractor, {
    device,
    dtype: "q4"
  });
}

async function runInference(
  id: string,
  imageDataUrl: string,
  audioData: Float32Array,
  priorContext: PriorLocalContext | null
) {
  const loaded = await loadModels(id);

  post(id, "progress", { message: "SmolVLM is reading the captured screen frame" });
  let screenText = "";
  try {
    screenText = await readScreenWithSmolVlm(loaded.screenReader, imageDataUrl);
  } catch (error) {
    post(id, "progress", { message: `Screen reader failed: ${error instanceof Error ? error.message : String(error)}` });
  }
  if (isLowQualityScreenText(screenText)) {
    post(id, "progress", { message: "SmolVLM OCR was low confidence; running local OCR fallback" });
    try {
      const ocrText = await readScreenWithLocalOcr(imageDataUrl);
      if (ocrText.trim().length > screenText.trim().length) {
        screenText = ocrText;
      }
    } catch (error) {
      post(id, "progress", { message: `Local OCR failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }

  post(id, "progress", { message: "Whisper tiny is transcribing the local microphone chunk" });
  let transcript = "";
  try {
    const transcriptResult = await loaded.transcriber(audioData, {
      chunk_length_s: 20,
      stride_length_s: 3
    });
    transcript = typeof transcriptResult?.text === "string" ? transcriptResult.text : normalizeGeneratedText(transcriptResult);
  } catch (error) {
    post(id, "progress", { message: `Transcriber failed: ${error instanceof Error ? error.message : String(error)}` });
  }

  post(id, "progress", { message: "Screen and audio stages complete; fusing local context" });
  post(id, "progress", { message: "Intent model is extracting one primary structured intent JSON" });
  let llmRaw = "";
  try {
    llmRaw = await generateIntentRaw(loaded.intentExtractor, screenText, transcript, priorContext);
  } catch (error) {
    post(id, "progress", { message: `Intent model failed: ${error instanceof Error ? error.message : String(error)}` });
  }
  const priorText = priorContext ? `${priorContext.screenText}\n${priorContext.transcript}` : "";
  const intent = parseIntent(llmRaw, `${priorText}\n${screenText}`, transcript);

  post(id, "result", { screenText, transcript, llmRaw, intent });
}

async function generateIntentRaw(
  intentExtractor: LoadedModels["intentExtractor"],
  screenText: string,
  transcript: string,
  priorContext: PriorLocalContext | null
): Promise<string> {
  const generationOptions = {
    max_new_tokens: 120,
    do_sample: false,
    temperature: 0,
    return_full_text: false,
    repetition_penalty: 1.15,
    no_repeat_ngram_size: 4
  };

  const chatOutput = await intentExtractor(buildIntentMessages(screenText, transcript, priorContext), generationOptions);
  let raw = normalizeGeneratedText(chatOutput);
  if (!isDegenerateIntentOutput(raw) && isAlignedWithScreenIntent(raw, screenText)) return raw;

  const plainOutput = await intentExtractor(buildPlainIntentPrompt(screenText, transcript, priorContext), generationOptions);
  raw = normalizeGeneratedText(plainOutput);
  if (!isDegenerateIntentOutput(raw) && isAlignedWithScreenIntent(raw, screenText)) return raw;

  const candidate = localBrowserCandidate(screenText, transcript);
  const repairOutput = await intentExtractor(buildScreenGroundedRepairPrompt(candidate, screenText, transcript), generationOptions);
  raw = normalizeGeneratedText(repairOutput);
  if (!isDegenerateIntentOutput(raw)) return raw;

  return `Browser LLM generated unstable text: ${raw}`;
}

async function readScreenWithSmolVlm(screenReader: LoadedModels["screenReader"], imageDataUrl: string): Promise<string> {
  const image = await (RawImage as any).read(imageDataUrl);
  const messages = [
    {
      role: "user",
      content: [
        { type: "image" },
        {
          type: "text",
          text: "Read the visible workspace. Return important names, deadlines, requests, and commitments. Do not invent details."
        }
      ]
    }
  ];
  const prompt = screenReader.processor.apply_chat_template(messages, {
    add_generation_prompt: true
  });
  const inputs = await screenReader.processor(prompt, [image], {
    do_image_splitting: false
  });
  const output = await screenReader.model.generate({
    ...inputs,
    max_new_tokens: 120,
    do_sample: false
  });
  return normalizeGeneratedText(screenReader.processor.batch_decode(output, { skip_special_tokens: true }));
}

function buildIntentMessages(screenText: string, transcript: string, priorContext: PriorLocalContext | null) {
  return [
    {
      role: "system",
      content:
        "You are a private browser-side extraction model. Return exactly one compact JSON object and no markdown. If visible screen text has a named recipient, email, request, or deadline, treat screen text as primary evidence. Use audio only to confirm or clarify the visible screen task."
    },
    {
      role: "user",
      content: buildIntentInstruction(screenText, transcript, priorContext)
    }
  ];
}

function buildPlainIntentPrompt(screenText: string, transcript: string, priorContext: PriorLocalContext | null): string {
  return [
    "Return exactly one compact JSON object.",
    "No prose. No markdown. No chat tokens.",
    "Visible screen text is primary evidence when it contains a named recipient, email, request, or deadline.",
    "Use audio only to confirm or clarify the visible screen task.",
    buildIntentInstruction(screenText, transcript, priorContext),
    'JSON format: {"entity":"person_or_team","action_required":"action","deadline":"deadline_or_unspecified","confidence":0.0}',
    "JSON:"
  ].join("\n");
}

function buildIntentInstruction(screenText: string, transcript: string, priorContext: PriorLocalContext | null): string {
  const priorSummary = priorContext
    ? [
        `Previous screen context: ${priorContext.screenText || "none"}`,
        `Previous audio transcript: ${priorContext.transcript || "none"}`,
        `Previous intent: ${priorContext.intent ? JSON.stringify(priorContext.intent) : "none"}`
      ].join("\n")
    : "Previous context: none";

  return [
    "Extract one actionable commitment from the current screen, current audio, and previous context.",
    "If screen and audio conflict, choose the visible screen commitment when it has the clearer name, email, or deadline.",
    "Return only these fields: entity, action_required, deadline, confidence.",
    "If there is no commitment, set action_required to \"none\" and confidence below 0.5.",
    priorSummary,
    `Screen context: ${screenText || "none"}`,
    `Audio transcript: ${transcript || "none"}`
  ].join("\n");
}

function localBrowserCandidate(screenText: string, transcript: string): string {
  const parsed = parseIntent("", screenText, transcript);
  const { extraction_mode: _mode, ...candidate } = parsed;
  return JSON.stringify(candidate);
}

function buildScreenGroundedRepairPrompt(candidate: string, screenText: string, transcript: string): string {
  return [
    "Rewrite this screen-grounded candidate as exactly one compact JSON object.",
    "The candidate is derived from visible screen evidence and should override noisy or conflicting audio.",
    "Use only keys entity, action_required, deadline, confidence.",
    "No markdown. No chat tokens.",
    `Candidate: ${candidate}`,
    `Visible screen evidence: ${screenText || "none"}`,
    `Audio evidence: ${transcript || "none"}`,
    "JSON:"
  ].join("\n");
}

function normalizeGeneratedText(result: any): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    if (result.every((item) => item && typeof item === "object" && "role" in item)) {
      const assistantMessage = [...result].reverse().find((item) => item.role === "assistant");
      return String(assistantMessage?.content ?? "");
    }
    return result.map((item) => normalizeGeneratedText(item.generated_text ?? item.text ?? item)).join("\n");
  }
  if (result?.role === "assistant" && typeof result.content === "string") {
    return result.content;
  }
  if (result?.generated_text) return normalizeGeneratedText(result.generated_text);
  if (result?.text) return String(result.text);
  return JSON.stringify(result);
}

function isDegenerateIntentOutput(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  if (/\{[^{}]*\}/.test(normalized)) return false;
  if (/(?:<\|user\|>|<\|assistant\|>|<\|system\|>|<\|end\|>){2,}/i.test(normalized)) return true;
  const tokenCount = (normalized.match(/<\|[^|]+\|>/g) ?? []).length;
  if (tokenCount >= 3) return true;
  return normalized.length < 12;
}

function isAlignedWithScreenIntent(raw: string, screenText: string): boolean {
  const screenIntent = localBrowserCandidate(screenText, "");
  try {
    const expected = JSON.parse(screenIntent);
    if (!isStrongScreenIntentLike(expected)) return true;
    const normalizedRaw = raw.toLowerCase();
    const entity = String(expected.entity ?? "").toLowerCase();
    const action = String(expected.action_required ?? "").toLowerCase();
    const deadline = String(expected.deadline ?? "").toLowerCase();
    return (
      (!entity || normalizedRaw.includes(entity)) &&
      (!deadline || deadline === "unspecified" || normalizedRaw.includes(deadline)) &&
      action
        .split(/\s+/)
        .filter((word: string) => word.length > 4)
        .some((word: string) => normalizedRaw.includes(word))
    );
  } catch {
    return true;
  }
}

function isStrongScreenIntentLike(value: Record<string, unknown>): boolean {
  const action = String(value.action_required ?? "").toLowerCase();
  const deadline = String(value.deadline ?? "").toLowerCase();
  return action !== "follow up" && action !== "none" && deadline !== "unspecified";
}

async function readScreenWithLocalOcr(imageDataUrl: string): Promise<string> {
  if (!ocrWorker) {
    ocrWorker = await createWorker("eng");
  }
  const result = await ocrWorker.recognize(imageDataUrl);
  return result.data.text.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function isLowQualityScreenText(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length < 25) return true;
  if (/User:Read the visible workspace/i.test(normalized)) return true;
  if (/(?:\b1\.|\b2\.){4,}/.test(normalized)) return true;
  const alphaCount = (normalized.match(/[a-z]/gi) ?? []).length;
  return alphaCount / Math.max(normalized.length, 1) < 0.35;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "load") {
      await loadModels(request.id);
      post(request.id, "ready", { modelConfig: MODEL_CONFIG });
      return;
    }
    await runInference(request.id, request.imageDataUrl, request.audioData, request.priorContext);
  } catch (error) {
    post(request.id, "error", { message: error instanceof Error ? error.message : String(error) });
  }
};
