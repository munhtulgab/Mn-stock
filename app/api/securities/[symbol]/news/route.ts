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

/**
 * How long the configured sites get before the answer goes out without
 * them. Comfortably inside maxDuration, so a slow source costs its own
 * headlines rather than the whole response.
 */
const EXTERNAL_BUDGET_MS = 30_000;

/** Resolves to an empty list if the work has not finished in time. */
function withBudget<T>(work: Promise<T[]>, ms: number): Promise<T[]> {
  return Promise.race([
    work,
    new Promise<T[]>((resolve) => setTimeout(() => resolve([]), ms)),
  ]);
}

async function build(
  db: Db,
  security: Security,
): Promise<Pick<NewsSnapshot, "mse" | "external"> & { complete: boolean }> {
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
  // sites are a bonus, so one failing must not empty the other — nor one
  // being slow. Sources are fetched together, so without a budget a single
  // scrape that takes a minute pushes the whole request past its limit and
  // the reader gets nothing at all, exchange notices included.
  const [mseResult, externalResult] = await Promise.allSettled([
    fetchCompanyNews(security.companyCode, 12),
    settings.newsSources.length > 0
      ? withBudget(
          fetchNewsSources(settings.newsSources, {
            apifyToken: settings.apifyToken,
            facebookToken: settings.facebookToken,
            facebookCookie: settings.facebookCookie,
            db,
            extraCaCerts: settings.extraCaCerts,
          }),
          EXTERNAL_BUDGET_MS,
        )
      : Promise.resolve([]),
  ]);

  if (mseResult.status === "rejected") {
    console.error("company news fetch failed", mseResult.reason);
  }
  if (externalResult.status === "rejected") {
    console.error("external news fetch failed", externalResult.reason);
  }

  const external = externalResult.status === "fulfilled" ? externalResult.value : [];

  return {
    mse: mseResult.status === "fulfilled" ? mseResult.value : [],
    external: matchHeadlines(external, terms)
      .slice(0, 12)
      // The body was there to match on, not to keep: storing whole articles
      // would bloat the snapshot and send them to the phone for nothing.
      .map(({ title, url, source, date }) => ({ title, url, source, date })),
    // An empty result from a source that ran out of time is not an answer,
    // and caching it would repeat "no news" for the next hour.
    complete: settings.newsSources.length === 0 || external.length > 0,
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
    const { complete, ...fresh } = await build(db, security);
    if (complete) {
      await snapshots.updateOne(
        { key },
        { $set: { key, ...fresh, computedAt: new Date(), schemaVersion: SCHEMA_VERSION } },
        { upsert: true },
      );
    }
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
