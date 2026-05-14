import { NextRequest, NextResponse } from "next/server";
import { buildInsightContextForUser } from "@/lib/ai-insight-context";
import { generateAndStoreInsightForUser } from "@/lib/ai-insights";
import { createBearerClient } from "@/lib/supabase/bearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return json({ success: false, error: "Not authenticated" }, 401);
  }

  const sb = createBearerClient(accessToken);
  const { data: authData, error: authError } = await sb.auth.getUser(accessToken);
  const user = authData?.user;

  if (authError || !user) {
    return json({ success: false, error: "Not authenticated" }, 401);
  }

  try {
    const ctx = await buildInsightContextForUser(sb, user.id);
    const insight = await generateAndStoreInsightForUser(ctx, user.id, sb);

    if (!insight) {
      return json({
        success: false,
        error: "AI analysis unavailable right now. Please try again in a moment.",
      }, 503);
    }

    return json({ success: true, insight });
  } catch (error) {
    console.error("[api/ai-insights] Generation failed:", error);
    return json({
      success: false,
      error: "AI analysis unavailable right now. Please try again in a moment.",
    }, 500);
  }
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
