import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import {
  companyMatchTerms,
  distinctiveNameWords,
  fetchNewsSources,
  matchHeadlines,
} from "@/lib/mse/newsSources";
import type { Security } from "@/lib/types";

export const maxDuration = 60;

interface NewsSnapshot {
  schemaVersion?: number;
  computedAt: Date;
  external: { title: string; source: string }[];
}

/**
 * Why a story that exists is not on a company's page.
 *
 * The answer is always one of four things and they are indistinguishable
 * from the outside: the site is not in the source list, the site returned
 * nothing, its headlines do not name the company, or a cached snapshot
 * predates the fix. This reports all four at once, per source.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const db = await getDb();
  if (!(await getCurrentUser(db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [settings, names, cached] = await Promise.all([
    getSettings(db),
    db
      .collection<Security>("securities")
      .find({}, { projection: { _id: 0, name: 1 } })
      .toArray(),
    db
      .collection<NewsSnapshot>("newsSnapshots")
      .findOne({ key: `news:${security.companyCode}` }),
  ]);

  const terms = companyMatchTerms(
    security.symbol,
    security.name,
    distinctiveNameWords(names.map((n) => n.name)),
  );

  const results = await fetchNewsSources(settings.newsSources, {
    apifyToken: settings.apifyToken,
    facebookToken: settings.facebookToken,
    facebookCookie: settings.facebookCookie,
    db,
    extraCaCerts: settings.extraCaCerts,
  });

  const sources = results.map((result) => {
    const matched = matchHeadlines([result], terms);
    return {
      url: result.url,
      status: result.status,
      via: result.via ?? null,
      reason: result.reason ?? null,
      headlines: result.headlines.length,
      matched: matched.length,
      matchedTitles: matched.slice(0, 5).map((m) => m.title.slice(0, 120)),
      // What the source did return, so "it has the story" can be checked
      // against what actually arrived.
      sampleTitles: result.headlines.slice(0, 5).map((h) => h.title.slice(0, 120)),
    };
  });

  return NextResponse.json({
    symbol: security.symbol,
    name: security.name,
    terms: terms.map((t) => (t instanceof RegExp ? `/${t.source}/i` : t)),
    configuredSources: settings.newsSources,
    sources,
    totalMatched: sources.reduce((n, s) => n + s.matched, 0),
    cache: cached
      ? {
          schemaVersion: cached.schemaVersion ?? null,
          computedAt: cached.computedAt,
          ageMinutes: Math.round((Date.now() - cached.computedAt.getTime()) / 60_000),
          externalCount: cached.external?.length ?? 0,
          externalSources: [...new Set((cached.external ?? []).map((e) => e.source))],
        }
      : null,
  });
}
