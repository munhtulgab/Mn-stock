import { NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { ensurePricesCurrent } from "@/lib/data";
import {
  DETAIL_BUDGET_MS,
  fetchFallbackQuote,
  fetchLiveQuotes,
  fetchMarketOpen,
  sessionEnd,
} from "@/lib/marketinfo/quotes";
import { priorClose, sessionChangePct } from "@/lib/priceChange";
import { ulaanbaatarDay } from "@/lib/day";
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

  // The shared helper, which reads the zone properly rather than assuming
  // a fixed +8 offset as the local copy here used to.
  const today = ulaanbaatarDay(new Date());

  // Live book first — it is the only source that moves during a session.
  let live = null;
  let marketOpen: boolean | null = null;
  let closedAt: string | null = null;
  // Which feed answered, so the response does not credit a figure to a host
  // that was returning 503 at the time.
  let source = "marketinfo.mn";
  try {
    const settings = await getSettings(db);
    const [quotes, open] = await Promise.all([
      // The same budget the page render uses, so the two cannot disagree
      // about the price for want of a different amount of patience.
      fetchLiveQuotes({
        extraCaCerts: settings.extraCaCerts,
        budgetMs: DETAIL_BUDGET_MS,
      }),
      fetchMarketOpen(),
    ]);
    live = quotes.get(security.companyCode) ?? null;
    // The same top-up the page render does, for the same reason it does it.
    //
    // Without this the two disagreed: the page asked Datalab about the one
    // company it was showing and painted today's price, then this endpoint —
    // which only ever looked in the live map — answered with the last stored
    // close and the client wrote that over it. A reader watched 969 on the
    // tenth turn into 965.74 on the seventh a second after the page settled.
    if (!live) {
      live = await fetchFallbackQuote(security.companyCode);
      if (live) source = "tdbs.mn";
    }
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
      bidQty: live.bidQty,
      askQty: live.askQty,
      bidVwap: live.bidVwap,
      askVwap: live.askVwap,
      date: live.at?.slice(0, 10) ?? today,
      // In session, when this security last moved; once shut, when the
      // session itself ended — the same for every security.
      at:
        marketOpen === true
          ? (live.at?.slice(11, 16) ?? null)
          : (closedAt ?? live.at?.slice(11, 16) ?? null),
      // The full stamp as the exchange wrote it, for the age ticker.
      atIso: live.at,
      // Live only while the exchange says it is trading; the same figures
      // become that day's final numbers once the session shuts.
      isLive: marketOpen === true,
      marketOpen,
      source,
      checkedAt: new Date().toISOString(),
    });
  }

  // The live book had nothing, so the newest published close is the answer —
  // and it has to be the newest one there is. This is the same call the page
  // itself makes before it renders, deliberately: this endpoint and that
  // render used to decide separately whether the stored prices were current,
  // disagreed, and the disagreement was visible as a stale price correcting
  // itself a second after the page painted.
  await ensurePricesCurrent(db, security.symbol);
  const { last, prev } = await latestTwo(db, security.companyCode);

  return NextResponse.json({
    symbol: security.symbol,
    price: last?.close ?? null,
    changePct: sessionChangePct(last, prev),
    previousClose: priorClose(last, prev),
    volume: last?.volume ?? null,
    date: last?.date ?? null,
    at: null,
    isLive: false,
    source: "mse.mn",
    checkedAt: new Date().toISOString(),
  });
}
