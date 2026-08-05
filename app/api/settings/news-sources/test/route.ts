import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import { fetchNewsSources } from "@/lib/mse/newsSources";

export const maxDuration = 60;

/**
 * Fetches every configured source and reports what came back, so a source
 * that quietly yields nothing (login wall, bot challenge, JS-only page) is
 * visible in settings instead of only showing up as a weaker AI verdict.
 */
export async function POST(req: NextRequest) {
  const db = await getDb();
  if (!(await isSettingsRequestAuthorized(db, req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const settings = await getSettings(db);
  // Test what's on screen when the form passes it, so unsaved edits can be
  // checked before committing them.
  const urls = Array.isArray(body.newsSources)
    ? body.newsSources.filter((s: unknown): s is string => typeof s === "string")
    : settings.newsSources;

  const results = await fetchNewsSources(urls, {
    apifyToken: settings.apifyToken,
    facebookToken: settings.facebookToken,
    facebookCookie: settings.facebookCookie,
    db,
    extraCaCerts: settings.extraCaCerts,
  });

  return NextResponse.json({
    results: results.map(({ url, status, chars, reason, headlines, via }) => ({
      url,
      status,
      chars,
      reason: reason ?? null,
      headlines: headlines.length,
      via: via ?? null,
    })),
  });
}
