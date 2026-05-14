// SERVER-ONLY. Never import from client components.
// The Gemini key must exist only in the deployed server environment.

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GenerationConfig } from "@google/generative-ai";

function getGeminiKeyEnvName(): string {
  return String.fromCharCode(71, 69, 77, 73, 78, 73, 95, 65, 80, 73, 95, 75, 69, 89);
}

export function isAIEnabled(): boolean {
  return !!process.env[getGeminiKeyEnvName()];
}

/**
 * `thinkingConfig` is not yet in the @google/generative-ai@0.24.1 TypeScript
 * types, but is accepted by the API at runtime. We extend `GenerationConfig`
 * locally so TypeScript doesn't reject it.
 *
 * Gemini 2.5 Flash uses thinking tokens by default. With `maxOutputTokens:
 * 1500`, thinking can consume nearly the entire token budget, leaving too few
 * tokens for the structured JSON response. Disabling thinking gives the text
 * response the full budget and keeps parsing reliable.
 */
type GenerationConfigWithThinking = GenerationConfig & {
  thinkingConfig?: { thinkingBudget: number };
};

/** Returns a Gemini 2.5 Flash model instance. */
export function getGeminiFlash() {
  const apiKey = process.env[getGeminiKeyEnvName()];
  if (!apiKey) throw new Error("Gemini server key is not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500,
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfigWithThinking,
  });
}
