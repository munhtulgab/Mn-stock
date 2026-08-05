import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { fetchCompanyNews, type CompanyNewsItem } from "@/lib/mse/news";
import {
  companyMatchTerms,
  distinctiveNameWords,
  fetchNewsSources,
  matchHeadlines,
} from "@/lib/mse/newsSources";
import { getSettings } from "@/lib/settings";
import type { Security } from "@/lib/types";

export const maxDuration = 60;

/** MSE publishes company notices a few times a month at most. */
const CACHE_MS = 60 * 60 * 1000;

/**
 * Bump when the stored shape changes or the matching does, so entries
 * written by an older build are rebuilt rather than served. Headlines gained
 * a date field (v2), and then began matching on an item's body rather than
 * its title alone (v3) — a cached row from before that is missing every
 * story that names the company anywhere but the headline.
 */
const SCHEMA_VERSION = 3;

interface NewsSnapshot {
  key: string;
  schemaVersion?: number;
  mse: CompanyNewsItem[];
  external: { title: string; url: string; source: string; date?: string }[];
  computedAt: Date;
}

async function build(
  db: Db,
  security: Security,
): Promise<Pick<NewsSnapshot, "mse" | "external">> {
  const settings = await getSettings(db);

  // Whether the company's first name-word identifies it on its own can only
  // be judged against the whole market, so the other listings are needed.
  const names = await db
    .collection<Security>("securities")
    .find({}, { projection: { _id: 0, name: 1 } })
    .toArray();
  const terms = companyMatchTerms(
    security.symbol,
    security.name,
    distinctiveNameWords(names.map((n) => n.name)),
  );

  // The MSE notices are the authoritative company feed; the configured news
  // sites are a bonus, so one failing must not empty the other.
  const [mseResult, externalResult] = await Promise.allSettled([
    fetchCompanyNews(security.companyCode, 12),
    settings.newsSources.length > 0
      ? fetchNewsSources(settings.newsSources, {
          apifyToken: settings.apifyToken,
          facebookToken: settings.facebookToken,
          facebookCookie: settings.facebookCookie,
          db,
          extraCaCerts: settings.extraCaCerts,
        })
      : Promise.resolve([]),
  ]);

  if (mseResult.status === "rejected") {
    console.error("company news fetch failed", mseResult.reason);
  }
  if (externalResult.status === "rejected") {
    console.error("external news fetch failed", externalResult.reason);
  }

  return {
    mse: mseResult.status === "fulfilled" ? mseResult.value : [],
    external:
      externalResult.status === "fulfilled"
        ? matchHeadlines(externalResult.value, terms).slice(0, 12)
        : [],
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const db = await getDb();

  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const snapshots = db.collection<NewsSnapshot>("newsSnapshots");
  const key = `news:${security.companyCode}`;
  const cached = await snapshots.findOne({ key });
  if (
    cached &&
    cached.schemaVersion === SCHEMA_VERSION &&
    Date.now() - cached.computedAt.getTime() < CACHE_MS
  ) {
    return NextResponse.json({ mse: cached.mse, external: cached.external });
  }

  try {
    const fresh = await build(db, security);
    await snapshots.updateOne(
      { key },
      { $set: { key, ...fresh, computedAt: new Date(), schemaVersion: SCHEMA_VERSION } },
      { upsert: true },
    );
    return NextResponse.json(fresh);
  } catch (err) {
    console.error("news build failed", err);
    // Stale beats empty when open.mse.mn is briefly unreachable.
    if (cached) {
      return NextResponse.json({ mse: cached.mse, external: cached.external });
    }
    return NextResponse.json({ mse: [], external: [] });
  }
}
