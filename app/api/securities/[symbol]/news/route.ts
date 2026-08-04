import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { fetchCompanyNews, type CompanyNewsItem } from "@/lib/mse/news";
import {
  companyMatchTerms,
  fetchNewsSources,
  matchHeadlines,
} from "@/lib/mse/newsSources";
import { getSettings } from "@/lib/settings";
import type { Security } from "@/lib/types";

export const maxDuration = 60;

/** MSE publishes company notices a few times a month at most. */
const CACHE_MS = 60 * 60 * 1000;

interface NewsSnapshot {
  key: string;
  mse: CompanyNewsItem[];
  external: { title: string; url: string; source: string }[];
  computedAt: Date;
}

async function build(
  db: Db,
  security: Security,
): Promise<Pick<NewsSnapshot, "mse" | "external">> {
  const settings = await getSettings(db);
  const terms = companyMatchTerms(security.symbol, security.name);

  // The MSE notices are the authoritative company feed; the configured news
  // sites are a bonus, so one failing must not empty the other.
  const [mseResult, externalResult] = await Promise.allSettled([
    fetchCompanyNews(security.companyCode, 12),
    settings.newsSources.length > 0
      ? fetchNewsSources(settings.newsSources, {
          facebookToken: settings.facebookToken,
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
  if (cached && Date.now() - cached.computedAt.getTime() < CACHE_MS) {
    return NextResponse.json({ mse: cached.mse, external: cached.external });
  }

  try {
    const fresh = await build(db, security);
    await snapshots.updateOne(
      { key },
      { $set: { key, ...fresh, computedAt: new Date() } },
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
