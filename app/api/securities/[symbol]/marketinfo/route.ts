import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import {
  fetchMarketInfoCompany,
  type MarketInfoCompany,
} from "@/lib/marketinfo/client";
import type { Security } from "@/lib/types";

export const maxDuration = 60;

/** Registration data, dividends and ownership move slowly. */
const CACHE_MS = 12 * 60 * 60 * 1000;

interface MarketInfoSnapshot {
  key: string;
  data: MarketInfoCompany;
  computedAt: Date;
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

  const snapshots = db.collection<MarketInfoSnapshot>("marketInfoSnapshots");
  const key = `mi:${security.companyCode}`;
  const cached = await snapshots.findOne({ key });
  if (cached && Date.now() - cached.computedAt.getTime() < CACHE_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const settings = await getSettings(db);
    const data = await fetchMarketInfoCompany(security.companyCode, {
      extraCaCerts: settings.extraCaCerts,
    });
    if (!data) {
      // Stale beats empty. Otherwise this is a plain "nothing here" and not
      // an error: a 404 made every company page log a failed request in the
      // console for an optional panel that is meant to stay quiet.
      if (cached) return NextResponse.json(cached.data);
      return NextResponse.json({ available: false });
    }
    await snapshots.updateOne(
      { key },
      { $set: { key, data, computedAt: new Date() } },
      { upsert: true },
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error(`marketinfo fetch failed for ${symbol}`, err);
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json(
      { error: "FETCH_FAILED", message: (err as Error).message },
      { status: 502 },
    );
  }
}
