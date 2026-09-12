import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import {
  companyMatchTerms,
  companySearchTerms,
  distinctiveNameWords,
  fetchNewsSources,
  matchHeadlines,
} from "@/lib/mse/newsSources";
import type { Security } from "@/lib/types";

export const maxDuration = 60;

/**
 * Fetches every configured source and reports what came back, so a source
 * that quietly yields nothing (login wall, bot challenge, JS-only page) is
 * visible in settings instead of only showing up as a weaker AI verdict.
 *
 * Given a symbol it also says how many of each source's headlines name that
 * company. A source can be working perfectly and still put nothing on a
 * company's page, and the two look identical until they are counted apart.
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

  // Resolved before fetching so a searchable source can be asked directly.
  const symbol =
    typeof body.symbol === "string" && body.symbol.trim()
      ? body.symbol.trim().toUpperCase()
      : null;

  let security: Security | null = null;
  let terms: ReturnType<typeof companyMatchTerms> = [];
  let searchTerms: string[] = [];
  if (symbol) {
    security = await db.collection<Security>("securities").findOne({ symbol });
    if (security) {
      const names = await db
        .collection<Security>("securities")
        .find({}, { projection: { _id: 0, name: 1 } })
        .toArray();
      const distinctive = distinctiveNameWords(names.map((n) => n.name));
      terms = companyMatchTerms(security.symbol, security.name, distinctive);
      searchTerms = companySearchTerms(security.symbol, security.name, distinctive);
    }
  }

  const results = await fetchNewsSources(urls, {
    searchTerms,
    apifyToken: settings.apifyToken,
    facebookToken: settings.facebookToken,
    facebookCookie: settings.facebookCookie,
    db,
    extraCaCerts: settings.extraCaCerts,
  });

  return NextResponse.json({
    company: security ? { symbol: security.symbol, name: security.name } : null,
    symbolNotFound: !!symbol && !security,
    terms: terms.map((t) => (t instanceof RegExp ? `/${t.source}/i` : t)),
    results: results.map((result) => {
      const matched = security ? matchHeadlines([result], terms) : [];
      return {
        url: result.url,
        status: result.status,
        chars: result.chars,
        reason: result.reason ?? null,
        headlines: result.headlines.length,
        via: result.via ?? null,
        matched: security ? matched.length : null,
        matchedTitles: matched.slice(0, 3).map((m) => m.title.slice(0, 100)),
      };
    }),
  });
}
