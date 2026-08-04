import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings, maskSettings, updateSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";

export async function GET(req: NextRequest) {
  const db = await getDb();
  if (!(await isSettingsRequestAuthorized(db, req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await getSettings(db);
  return NextResponse.json(maskSettings(settings));
}

export async function POST(req: NextRequest) {
  const db = await getDb();
  if (!(await isSettingsRequestAuthorized(db, req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));

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

  // Blank means "leave the stored token alone", same as the AI keys.
  const facebookToken =
    typeof body.facebookToken === "string" && body.facebookToken.trim()
      ? body.facebookToken.trim()
      : undefined;

  const newsSources = Array.isArray(body.newsSources)
    ? body.newsSources.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
    : undefined;

  // Blank string means "leave the stored secret alone", same as the AI keys.
  const sms: Record<string, unknown> = {};
  if (typeof body.smsEnabled === "boolean") sms.enabled = body.smsEnabled;
  if (typeof body.smsApiKey === "string" && body.smsApiKey.trim()) {
    sms.apiKey = body.smsApiKey.trim();
  }
  if (typeof body.smsFrom === "string") sms.from = body.smsFrom.trim();
  if (typeof body.smsBrand === "string") sms.brand = body.smsBrand.trim();
  if (Array.isArray(body.smsRecipients)) {
    sms.recipients = body.smsRecipients.filter(
      (s: unknown): s is string => typeof s === "string" && s.trim().length > 0,
    );
  }

  const VALID_SIGNALS = ["BUY", "SELL", "HOLD"];
  const notifications: Record<string, unknown> = {};
  if (typeof body.pushEnabled === "boolean") notifications.pushEnabled = body.pushEnabled;
  if (Array.isArray(body.notifySignals)) {
    notifications.signals = body.notifySignals.filter(
      (s: unknown): s is string => typeof s === "string" && VALID_SIGNALS.includes(s),
    );
  }

  const updated = await updateSettings(db, {
    newsSources,
    facebookToken,
    apiKeys,
    sms: Object.keys(sms).length > 0 ? sms : undefined,
    notifications:
      Object.keys(notifications).length > 0 ? notifications : undefined,
  });
  return NextResponse.json(maskSettings(updated));
}
