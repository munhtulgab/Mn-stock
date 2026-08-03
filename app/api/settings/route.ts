import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings, maskSettings, updateSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";

export async function GET(req: NextRequest) {
  if (!(await isSettingsRequestAuthorized(req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const settings = await getSettings(db);
  return NextResponse.json(maskSettings(settings));
}

export async function POST(req: NextRequest) {
  if (!(await isSettingsRequestAuthorized(req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const db = await getDb();

  const apiKeys: Record<string, string> = {};
  if (typeof body.anthropicApiKey === "string" && body.anthropicApiKey.trim()) {
    apiKeys.anthropic = body.anthropicApiKey.trim();
  }
  if (typeof body.geminiApiKey === "string" && body.geminiApiKey.trim()) {
    apiKeys.gemini = body.geminiApiKey.trim();
  }
  if (typeof body.groqApiKey === "string" && body.groqApiKey.trim()) {
    apiKeys.groq = body.groqApiKey.trim();
  }
  if (typeof body.openrouterApiKey === "string" && body.openrouterApiKey.trim()) {
    apiKeys.openrouter = body.openrouterApiKey.trim();
  }

  const newsSources = Array.isArray(body.newsSources)
    ? body.newsSources.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
    : undefined;

  const updated = await updateSettings(db, { newsSources, apiKeys });
  return NextResponse.json(maskSettings(updated));
}
