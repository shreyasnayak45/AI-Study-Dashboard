// SERVER-ONLY — never import from "use client" components.
// GEMINI_API_KEY must be set in .env.local for AI features to work.

import { GoogleGenerativeAI } from "@google/generative-ai";

export function isAIEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/** Returns a Gemini 2.5 Flash model instance. */
export function getGeminiFlash() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature:     0.2,   // lower = more consistent JSON, fewer retries
      maxOutputTokens: 1500,  // enough for full intelligence response; reduces TTFT
    },
  });
}
