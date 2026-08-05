import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { syncPricesForCompany } from "@/lib/sync";
import type { PricePoint, Security } from "@/lib/types";

/**
 * Latest published price for one security.
 *
 * MSE has no intraday feed: open.mse.mn publishes a day's trading after the
 * close, so during a session the newest figure available is the previous
 * day's. This endpoint therefore reports what is published *and when it is
 * from*, letting the page label a price rather than implying it is live.
 *
 * A live re-scrape is attempted only when the stored figure predates today,
 * and at most once per REFRESH_INTERVAL_MS, so polling stays cheap.
 */

/** Mongolia is UTC+8 year round. */
const ULAANBAATAR_OFFSET_MS = 8 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** Last attempt per company, so concurrent viewers don't each re-scrape. */
const lastRefresh = new Map<number, number>();

function ulaanbaatarToday(): string {
  return new Date(Date.now() + ULAANBAATAR_OFFSET_MS).toISOString().slice(0, 10);
}

async function latestTwo(db: Db, companyCode: number) {
  const rows = await db
    .collection<PricePoint>("prices")
    .find({ companyCode })
    .sort({ date: -1 })
    .limit(2)
    .toArray();
  return { last: rows[0] ?? null, prev: rows[1] ?? null };
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

  let { last, prev } = await latestTwo(db, security.companyCode);

  const today = ulaanbaatarToday();
  const since = Date.now() - (lastRefresh.get(security.companyCode) ?? 0);
  if ((!last || last.date < today) && since > REFRESH_INTERVAL_MS) {
    lastRefresh.set(security.companyCode, Date.now());
    try {
      await syncPricesForCompany(db, security.companyCode);
      ({ last, prev } = await latestTwo(db, security.companyCode));
    } catch (err) {
      // A failed refresh just means the stored figure stands.
      console.error(`quote refresh failed for ${symbol}`, err);
    }
  }

  const changePct =
    last && prev && prev.close > 0
      ? ((last.close - prev.close) / prev.close) * 100
      : null;

  return NextResponse.json({
    symbol: security.symbol,
    price: last?.close ?? null,
    changePct,
    volume: last?.volume ?? null,
    /** Trading day the figure belongs to. */
    date: last?.date ?? null,
    /** False while the exchange has yet to publish today's session. */
    isToday: last?.date === today,
    checkedAt: new Date().toISOString(),
  });
}
