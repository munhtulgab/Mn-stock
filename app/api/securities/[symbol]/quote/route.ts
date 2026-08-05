import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { syncPricesForCompany } from "@/lib/sync";
import { fetchLiveQuotes, fetchMarketOpen, sessionEnd } from "@/lib/marketinfo/quotes";
import { priorClose, sessionChangePct } from "@/lib/priceChange";
import type { PricePoint, Security } from "@/lib/types";

/**
 * Current price for one security.
 *
 * marketinfo.mn carries the live order book, so during a session that is the
 * real answer: last trade, best bid and offer, running volume, stamped with
 * the exchange's own entry time. The exchange's open-data portal publishes a
 * day only once it has closed, so it serves as the fallback — and outside
 * trading hours the two agree anyway.
 *
 * Either way the response says which session the figure belongs to and
 * whether it is live, so the page can label it rather than implying.
 */

/** Mongolia is UTC+8 year round. */
const ULAANBAATAR_OFFSET_MS = 8 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** Last stored-price refresh per company, so viewers don't each re-scrape. */
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

  const today = ulaanbaatarToday();

  // Live book first — it is the only source that moves during a session.
  let live = null;
  let marketOpen: boolean | null = null;
  let closedAt: string | null = null;
  try {
    const settings = await getSettings(db);
    const [quotes, open] = await Promise.all([
      fetchLiveQuotes({ extraCaCerts: settings.extraCaCerts }),
      fetchMarketOpen(),
    ]);
    live = quotes.get(security.companyCode) ?? null;
    marketOpen = open;
    closedAt = sessionEnd(quotes);
  } catch (err) {
    console.error(`live quote lookup failed for ${symbol}`, err);
  }

  if (live?.price != null) {
    return NextResponse.json({
      symbol: security.symbol,
      price: live.price,
      lastTrade: live.lastTrade,
      changePct: live.changePct,
      previousClose: live.previousClose,
      open: live.open,
      high: live.high,
      low: live.low,
      vwap: live.vwap,
      volume: live.volume,
      turnover: live.turnover,
      trades: live.trades,
      bid: live.bid,
      ask: live.ask,
      date: live.at?.slice(0, 10) ?? today,
      // In session, when this security last moved; once shut, when the
      // session itself ended — the same for every security.
      at:
        marketOpen === true
          ? (live.at?.slice(11, 16) ?? null)
          : (closedAt ?? live.at?.slice(11, 16) ?? null),
      // Live only while the exchange says it is trading; the same figures
      // become that day's final numbers once the session shuts.
      isLive: marketOpen === true,
      marketOpen,
      source: "marketinfo.mn",
      checkedAt: new Date().toISOString(),
    });
  }

  let { last, prev } = await latestTwo(db, security.companyCode);
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

  return NextResponse.json({
    symbol: security.symbol,
    price: last?.close ?? null,
    changePct: sessionChangePct(last, prev),
    previousClose: priorClose(last, prev),
    volume: last?.volume ?? null,
    date: last?.date ?? null,
    at: null,
    isLive: false,
    source: "МХБ",
    checkedAt: new Date().toISOString(),
  });
}
