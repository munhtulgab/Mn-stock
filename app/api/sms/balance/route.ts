import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import { getSmsBalance } from "@/lib/callpro";

/**
 * Checks the stored API key on its own. Sending also depends on the sender
 * number being registered, so a passing balance check plus a failing send
 * points at the sender number rather than the key.
 */
export async function GET(req: NextRequest) {
  if (!(await isSettingsRequestAuthorized(req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const { sms } = await getSettings(db);
  if (!sms.apiKey) {
    return NextResponse.json(
      { error: "API түлхүүрээ эхлээд хадгална уу" },
      { status: 400 },
    );
  }

  const result = await getSmsBalance(sms.apiKey);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, balance: result.balance });
}
