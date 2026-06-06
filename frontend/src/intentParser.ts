export type ExtractionMode = "phi3" | "local_safety_parser";

export type Intent = {
  entity: string;
  action_required: string;
  deadline: string;
  confidence: number;
  extraction_mode: ExtractionMode;
};

export function parseIntent(llmRaw: string, screenText: string, transcript: string): Intent {
  const screenIntent = localSafetyParser(screenText);
  if (isStrongScreenIntent(screenIntent, screenText)) {
    return {
      ...screenIntent,
      confidence: Math.max(screenIntent.confidence, 0.76)
    };
  }

  const jsonCandidates = [...llmRaw.matchAll(/\{[^{}]*\}/g)].map((match) => match[0]).reverse();
  for (const json of jsonCandidates) {
    try {
      const parsed = JSON.parse(json);
      if (isSchemaPlaceholder(parsed)) continue;
      return normalizeIntent(parsed, "phi3");
    } catch {
      // Try the next JSON-looking block before falling back.
    }
  }
  return localSafetyParser(`${screenText}\n${transcript}`);
}

export function normalizeIntent(value: Record<string, unknown>, extractionMode: ExtractionMode): Intent {
  const confidence = Number(value.confidence ?? 0.72);
  return {
    entity: cleanString(value.entity, "Unknown"),
    action_required: cleanString(value.action_required, "follow up"),
    deadline: cleanString(value.deadline, "unspecified"),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.72,
    extraction_mode: extractionMode
  };
}

export function localSafetyParser(text: string): Intent {
  const cleanText = text.replace(/\s+/g, " ").trim();
  const actionCandidate = findBestActionCandidate(cleanText);
  const evidenceText = actionCandidate.sentence || cleanText;
  const deadline = extractDeadline(evidenceText);
  const entity = extractEntity(evidenceText, cleanText);
  const action = stripDeadlineFromAction(actionCandidate.action || "follow up", deadline);
  return {
    entity,
    action_required: action,
    deadline,
    confidence: 0.62,
    extraction_mode: "local_safety_parser"
  };
}

function extractDeadline(text: string): string {
  const match = text.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tonight|next week|by\s+[a-z]+|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i);
  if (!match) return "unspecified";
  return match[0].replace(/^by\s+/i, "");
}

function extractEntity(text: string, fallbackText = text): string {
  const explicit = text.match(/\b(?:to|for|with|from)\s+([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?)\b/);
  if (explicit) return explicit[1];
  const source = fallbackText.match(/\b([A-Z]{2,}|[A-Z][a-z]{2,})\s+(?:email|thread|chat|message)\b/);
  if (source) return source[1];
  const speaker = text.match(/\b([A-Z][a-z]{2,})\s*:/);
  if (speaker) return speaker[1];
  const anyName = fallbackText.match(/\b([A-Z][a-z]{2,})\b/);
  return anyName?.[1] ?? "Unknown";
}

function extractAction(text: string): string {
  return findBestActionCandidate(text).action || "follow up";
}

function findBestActionCandidate(text: string): { action: string; sentence: string } {
  const actionPattern = /\b(send|share|follow up|schedule|prepare|review|create|update|draft|reply|answer|coordinate|get|drop)\b[^.?!\n]*/i;
  const sentences = text.split(/(?<=[.?!])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
  let best = "";
  let bestSentence = "";
  let bestScore = -1;

  for (const sentence of sentences) {
    const action = sentence.match(actionPattern)?.[0]?.trim();
    if (!action) continue;
    const score =
      (/\b(could you|please|asked|needs?|need to|must|before|by|deadline)\b/i.test(sentence) ? 3 : 0) +
      (extractDeadline(sentence) !== "unspecified" ? 3 : 0) +
      (/\b(send|share|schedule|prepare|coordinate|get|drop)\b/i.test(action) ? 2 : 0) -
      (/\bupdate after|product review|review meeting|looking good\b/i.test(sentence) ? 2 : 0);
    if (score > bestScore) {
      best = action;
      bestSentence = sentence;
      bestScore = score;
    }
  }

  const fallback = text.match(actionPattern)?.[0]?.trim() || "";
  return { action: best || fallback, sentence: bestSentence };
}

function cleanString(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : fallback;
}

function stripDeadlineFromAction(action: string, deadline: string): string {
  if (deadline === "unspecified") return action;
  return action
    .replace(new RegExp(`\\s+by\\s+${escapeRegExp(deadline)}\\b`, "i"), "")
    .replace(new RegExp(`\\s+before\\s+${escapeRegExp(deadline)}\\b`, "i"), "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSchemaPlaceholder(value: Record<string, unknown>): boolean {
  const entity = String(value.entity ?? "").toLowerCase();
  const action = String(value.action_required ?? "").toLowerCase();
  const deadline = String(value.deadline ?? "").toLowerCase();
  return (
    entity === "person_or_team" ||
    action === "action" ||
    deadline === "deadline_or_unspecified" ||
    deadline === "deadline"
  );
}

function isStrongScreenIntent(intent: Intent, screenText: string): boolean {
  const text = screenText.trim();
  if (text.length < 30) return false;
  if (intent.action_required.toLowerCase() === "follow up") return false;
  return (
    intent.deadline !== "unspecified" ||
    /\b(could you|please|asked|needs?|need to|by|before|deadline)\b/i.test(text)
  );
}
