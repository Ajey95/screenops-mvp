import type { Intent as ExtractedIntent } from "./intentParser";

export type { ExtractedIntent };

export type LocalInferenceResult = {
  screenText: string;
  transcript: string;
  llmRaw: string;
  intent: ExtractedIntent;
};

export type PriorLocalContext = {
  screenText: string;
  transcript: string;
  intent: ExtractedIntent | null;
};

type Progress = (message: string) => void;

type PendingRequest = {
  resolve: (value: any) => void;
  reject: (reason?: unknown) => void;
  onProgress: Progress;
};

let modelWorker: Worker | null = null;
const pending = new Map<string, PendingRequest>();

export async function checkWebGpu(): Promise<boolean> {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function preloadLocalModels(onProgress: Progress): Promise<void> {
  return callWorker("load", {}, onProgress).then(() => undefined);
}

export function runLocalInference(
  imageDataUrl: string,
  audioData: Float32Array,
  priorContext: PriorLocalContext | null,
  onProgress: Progress
): Promise<LocalInferenceResult> {
  return callWorker("infer", { imageDataUrl, audioData, priorContext }, onProgress);
}

export async function startScreenCapture(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 2 },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function isStreamActive(stream: MediaStream | null): stream is MediaStream {
  return Boolean(stream?.getTracks().some((track) => track.readyState === "live"));
}

export async function startMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

export function captureFrame(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create canvas context");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function recordAudioChunk(stream: MediaStream, milliseconds = 6000): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const recorder = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = (event) => reject(event.error ?? new Error("MediaRecorder failed"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    recorder.start();
    window.setTimeout(() => recorder.stop(), milliseconds);
  });
}

export async function decodeAudioBlob(audioBlob: Blob, sampleRate = 16000): Promise<Float32Array> {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("AudioContext is not available in this browser.");
  }

  const audioContext = new AudioContextClass({ sampleRate });
  try {
    const decoded = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
    const channelCount = decoded.numberOfChannels;
    const length = decoded.length;
    const mono = new Float32Array(length);

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < length; index += 1) {
        mono[index] += data[index] / channelCount;
      }
    }

    return mono;
  } finally {
    await audioContext.close();
  }
}

function getWorker(): Worker {
  if (!modelWorker) {
    modelWorker = new Worker(new URL("./modelWorker.ts", import.meta.url), { type: "module" });
    modelWorker.onmessage = (event: MessageEvent) => {
      const { id, type, message, ...payload } = event.data;
      const request = pending.get(id);
      if (!request) return;
      if (type === "progress") {
        request.onProgress(String(message));
        return;
      }
      pending.delete(id);
      if (type === "error") {
        request.reject(new Error(String(message)));
        return;
      }
      request.resolve(type === "result" ? payload : undefined);
    };
  }
  return modelWorker;
}

function callWorker(type: "load" | "infer", payload: Record<string, unknown>, onProgress: Progress): Promise<any> {
  const id = crypto.randomUUID();
  const worker = getWorker();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type, ...payload });
  });
}
