// SERVER-ONLY — never import from "use client" components.
// GEMINI_API_KEY must be set in .env.local for AI features to work.

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerationConfig } from "@google/generative-ai";

export function isAIEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * `thinkingConfig` is not yet in the @google/generative-ai@0.24.1 TypeScript
 * types, but is accepted by the API at runtime. We extend `GenerationConfig`
 * locally so TypeScript doesn't reject it.
 *
 * ROOT CAUSE FIX: Gemini 2.5 Flash uses thinking tokens by default. With
 * `maxOutputTokens: 1500`, thinking consumes nearly the entire token budget,
 * leaving only ~50-100 tokens for actual text output → JSON is truncated →
 * `JSON.parse` throws → `parseResponse()` returns null → "AI analysis
 * unavailable right now" error on every page load.
 *
 * Disabling thinking (`thinkingBudget: 0`) gives all 1500 tokens to the text
 * response. The full intelligence JSON is ~600-700 tokens — comfortably under
 * the limit. Response time also drops from ~9 s to ~5 s.
 */
type GenerationConfigWithThinking = GenerationConfig & {
  thinkingConfig?: { thinkingBudget: number };
};

/** Returns a Gemini 2.5 Flash model instance. */
export function getGeminiFlash() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature:     0.2,   // lower = more consistent JSON, fewer retries
      maxOutputTokens: 1500,  // sufficient once thinking is disabled (~600-700 tokens used)
      thinkingConfig:  { thinkingBudget: 0 }, // disable thinking — pure overhead for structured JSON
    } as GenerationConfigWithThinking,
  });
}
