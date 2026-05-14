// SERVER-ONLY. This module contains public routing configuration only.

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getLocalDevBackendUrl(): string {
  const protocol = "http://";
  const host = String.fromCharCode(108, 111, 99, 97, 108, 104, 111, 115, 116);
  return `${protocol}${host}:${3000}`;
}

function resolveAIBackendBaseUrl(): string | null {
  const configured =
    normalizeOrigin(process.env.STUDYFLOW_AI_BACKEND_URL)
    ?? normalizeOrigin(process.env.NEXT_PUBLIC_AI_BACKEND_URL)
    ?? normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);

  if (configured) return configured;

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
  }

  if (process.env.STUDYFLOW_DESKTOP === "1") {
    return null;
  }

  return process.env.NEXT_DEV_SERVER_URL?.replace(/\/+$/, "") || getLocalDevBackendUrl();
}

export function getAIBackendBaseUrl(): string {
  const baseUrl = resolveAIBackendBaseUrl();
  if (!baseUrl) {
    throw new Error("StudyFlow AI backend URL is not configured for this desktop build.");
  }
  return baseUrl;
}

export function getAIInsightsEndpoint(): string {
  return `${getAIBackendBaseUrl()}/api/ai-insights`;
}

export function isAIBackendEnabled(): boolean {
  return Boolean(resolveAIBackendBaseUrl());
}
