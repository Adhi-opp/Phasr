// src/features/vision/gemini.ts
// ============================================================================
// GEMINI CLIENT FOR THE FLOOR-PLAN EXTRACTOR
// ============================================================================
// One REST call per drawing (generateContent), no SDK. The reply is held to
// FLOOR_PLAN_RESPONSE_SCHEMA by the API (structured output); the route
// validates it again with Zod before any of it is used.
//
// Configuration, server-side only:
//   GEMINI_API_KEY  from Google AI Studio. Unset, the route answers 503.
//   GEMINI_MODEL    optional; defaults to DEFAULT_GEMINI_MODEL. The 1.5
//                   models are retired; pick a current Flash model.
//
// Temperature is left at the model's default: Google advises against lowering
// it for Gemini 3 models, and the response schema already fixes the format.
//
// Data: on Google's free tier, submitted content may be used to improve
// Google's products. Fine for test plans; move to a paid key, and name
// Google in /privacy, before customers upload their own homes.
// ============================================================================

import "server-only";
import { FLOOR_PLAN_RESPONSE_SCHEMA } from "./floorPlan";
import { FLOOR_PLAN_SYSTEM_PROMPT } from "./floorPlanPrompt";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** Under the route's 60-second limit, leaving time to validate and calculate. */
const TIMEOUT_MS = 50_000;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export type GeminiConfig = { apiKey: string; model: string };

export function geminiConfig(): GeminiConfig | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return { apiKey, model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL };
}

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

/** Sends one drawing and returns the model's JSON reply, parsed but not yet validated. */
export async function extractWithGemini(
  file: { bytes: Uint8Array; mimeType: string },
  config: GeminiConfig
): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // A header, not ?key=, so the key never lands in a URL or a log line.
      "x-goog-api-key": config.apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: FLOOR_PLAN_SYSTEM_PROMPT }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: file.mimeType, data: Buffer.from(file.bytes).toString("base64") } },
            { text: "Transcribe the rooms on this plan." },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: FLOOR_PLAN_RESPONSE_SCHEMA,
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!res.ok) {
    // Google's error body says what went wrong (bad key, unknown model,
    // quota) and never echoes the key.
    const detail = (await res.text()).slice(0, 300);
    throw new GeminiError(`Gemini answered HTTP ${res.status}: ${detail}`, res.status);
  }

  const body = (await res.json()) as GenerateContentResponse;
  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const reason = body.promptFeedback?.blockReason ?? body.candidates?.[0]?.finishReason ?? "no content";
    throw new GeminiError(`Gemini returned no JSON (${reason})`, 502);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini's reply was not valid JSON", 502);
  }
}
