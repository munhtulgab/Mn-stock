import type { Db } from "mongodb";
import { computeRecommendation } from "@/lib/recommendation";
import { syncPricesForCompany } from "@/lib/sync";
import { fetchLiveQuotes, type LiveQuote } from "@/lib/marketinfo/quotes";
import { fetchExchangeMovers, type ExchangeMovers } from "@/lib/mse/movers";
import { daysBetween, sessionChangePct } from "@/lib/priceChange";
import { ulaanbaatarDay } from "@/lib/day";
import { needsPriceRefresh } from "@/lib/priceFreshness";
import { liveCandle } from "@/lib/liveCandle";
import { buildCombinedSignals } from "@/lib/analysis/report";
import type { CombinedSignal } from "@/lib/analysis/signal";
import type { Financials, PricePoint, Recommendation, Security } from "@/lib/types";

const INDICATOR_WINDOW_DAYS = 400;
const SPARKLINE_POINTS = 20;
const SPARKLINE_WINDOW_DAYS = 30;

export interface DashboardRow {
  symbol: string;
  name: string;
  classification: Security["classification"];
  companyCode: number;
  lastPrice: number | null;
  lastDate: string | null;
  changePct: number | null;
  volume: number | null;
  signal: Recommendation["signal"];
  score: number;
  /** Recent closing prices, oldest first, for the dashboard-row mini chart. */
  sparkline: number[];
}

export interface StockDetail {
  security: Security;
  financials: Financials | null;
  priceHistory: PricePoint[];
  /** Every stored close, oldest first, for the chart's longer ranges. */
  fullHistory: { date: string; close: number }[];
  recommendation: Recommendation;
  marketMedianPe: number | null;
}

async function getLatestFinancialsByCompany(
  db: Db,
): Promise<Map<number, Financials>> {
  const rows = await db
    .collection<Financials>("financials")
    .aggregate<Financials>([
      { $sort: { companyCode: 1, year: -1, quarter: -1 } },
      {
        $group: {
          _id: "$companyCode",
          doc: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$doc" } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r.companyCode, r]));
}

function getMarketMedianPe(financialsByCompany: Map<number, Financials>): number | null {
  const values = Array.from(financialsByCompany.values())
    .map((f) => f.pe)
    .filter((v): v is number => v !== null && v > 0 && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[mid - 1] + values[mid]) / 2
    : values[mid];
}

/**
 * Date and close for a company's whole stored history. Projected down to
 * two fields because the chart needs nothing else and a heavily traded
 * name carries thousands of rows.
 */
async function getFullPriceSeries(
  db: Db,
  companyCode: number,
): Promise<{ date: string; close: number }[]> {
  return db
    .collection<PricePoint>("prices")
    .find({ companyCode }, { projection: { _id: 0, date: 1, close: 1 } })
    .sort({ date: 1 })
    .toArray() as unknown as Promise<{ date: string; close: number }[]>;
}

async function getRecentPrices(
  db: Db,
  companyCode: number,
  limit = INDICATOR_WINDOW_DAYS,
): Promise<PricePoint[]> {
  const rows = await db
    .collection<PricePoint>("prices")
    .find({ companyCode })
    .sort({ date: -1 })
    .limit(limit)
    .toArray();
  return rows.reverse();
}

/**
 * Latest `limit` price points for every company in a single aggregation.
 *
 * Fetching these per-company means one Atlas round trip per listed security
 * (200+), which dominated page load time. `$topN` keeps the per-group slice on
 * the server so we transfer only what the indicators actually need.
 */
async function getRecentPricesForAll(
  db: Db,
  limit = INDICATOR_WINDOW_DAYS,
): Promise<Map<number, PricePoint[]>> {
  const groups = await db
    .collection<PricePoint>("prices")
    .aggregate<{ _id: number; prices: PricePoint[] }>(
      [
        {
          $group: {
            _id: "$companyCode",
            prices: {
              $topN: {
                n: limit,
                sortBy: { date: -1 },
                output: {
                  companyCode: "$companyCode",
                  date: "$date",
                  open: "$open",
                  close: "$close",
                  high: "$high",
                  low: "$low",
                  vwap: "$vwap",
                  volume: "$volume",
                  turnover: "$turnover",
                  trades: "$trades",
                  previousClose: "$previousClose",
                },
              },
            },
          },
        },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  // $topN yields newest-first; indicators expect chronological order.
  return new Map(groups.map((g) => [g._id, g.prices.reverse()]));
}

/**
 * Closing prices for the mini trend line, bounded to the last
 * SPARKLINE_WINDOW_DAYS calendar days (not just the last N trades). Without
 * the calendar bound, a thinly-traded security's "last 20 prices" can be
 * its entire multi-year trading history rather than a recent trend.
 */
function recentSparkline(prices: PricePoint[]): number[] {
  if (prices.length === 0) return [];
  const cutoff = new Date(prices[prices.length - 1].date);
  cutoff.setUTCDate(cutoff.getUTCDate() - SPARKLINE_WINDOW_DAYS);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const windowed = prices
    .filter((p) => p.date >= cutoffKey)
    .slice(-SPARKLINE_POINTS);
  // A row always has at least two raw price points once it has a change% at
  // all (that's what produces it), but for a thinly-traded security those
  // two trades can be further apart than the calendar window — which left
  // exactly the gainers/losers rows (the ones that just traded) with no line
  // to draw. Fall back to the plain last-N points rather than showing
  // nothing when the windowed slice is too sparse to plot.
  const source = windowed.length >= 2 ? windowed : prices.slice(-SPARKLINE_POINTS);
  return source.map((p) => p.close);
}

function buildRow(
  security: Security,
  prices: PricePoint[],
  financials: Financials | null,
  marketMedianPe: number | null,
  /**
   * The company's combined verdict, from the same analysis its own page
   * shows. Absent only where that analysis could not be built, in which case
   * the older rule engine stands in rather than leaving the row blank.
   */
  combined: CombinedSignal | undefined,
): DashboardRow {
  const last = prices.at(-1) ?? null;
  const prev = prices.length > 1 ? prices[prices.length - 2] : null;
  const changePct = sessionChangePct(last, prev);
  const fallback = combined
    ? null
    : computeRecommendation(prices, financials, marketMedianPe);

  return {
    symbol: security.symbol,
    name: security.name,
    classification: security.classification,
    companyCode: security.companyCode,
    lastPrice: last?.close ?? null,
    lastDate: last?.date ?? null,
    changePct,
    volume: last?.volume ?? null,
    signal: combined?.signal ?? fallback!.signal,
    score: combined?.score ?? fallback!.score,
    sparkline: recentSparkline(prices),
  };
}

/**
 * Adds the running price to a company's series as today's point.
 *
 * Indicators computed from stored closes alone describe the market as it
 * stood at the last published session, so a stock that fell 15% this
 * morning still carried yesterday's АВАХ. The signal has to see the price
 * the screen is showing.
 */
function withLivePoint(
  prices: PricePoint[],
  live: LiveQuote | undefined,
  companyCode: number,
): PricePoint[] {
  const lastStored = prices.at(-1);
  const date = live?.at?.slice(0, 10);
  // What this point replaces, if it replaces one: the close before today.
  const priorClose =
    lastStored?.date === date ? prices.at(-2)?.close : lastStored?.close;

  // The bar itself comes from the shared builder, so the point appended here
  // and the candle the chart draws are the same bar. They were written twice
  // once, and the chart ended a session short of the price in the header.
  const bar = liveCandle(live, priorClose);
  if (!bar) return prices;

  const point: PricePoint = {
    ...bar,
    companyCode,
    vwap: bar.close,
    turnover: 0,
    trades: 0,
    previousClose: live!.previousClose ?? priorClose ?? 0,
  };

  if (lastStored?.date === bar.date) return [...prices.slice(0, -1), point];
  if (!lastStored || lastStored.date < bar.date) return [...prices, point];
  return prices;
}

async function computeDashboardRows(
  db: Db,
  options: { live?: Map<number, LiveQuote> } = {},
): Promise<DashboardRow[]> {
  const [securities, financialsByCompany, pricesByCompany, combined] =
    await Promise.all([
      db
        .collection<Security>("securities")
        .find({ status: "active" })
        .sort({ symbol: 1 })
        .toArray(),
      getLatestFinancialsByCompany(db),
      getRecentPricesForAll(db),
      // The verdict every row carries, from the analysis a company's own page
      // shows. Never fatal: a failure here drops the whole market back to the
      // rule engine rather than serving no list at all.
      buildCombinedSignals(db, ulaanbaatarDay(new Date()), options.live).catch(
        (err) => {
          console.error("combined signals failed, falling back to the rule engine", err);
          return new Map<number, CombinedSignal>();
        },
      ),
    ]);

  const marketMedianPe = getMarketMedianPe(financialsByCompany);

  return securities.map((security) =>
    buildRow(
      security,
      withLivePoint(
        pricesByCompany.get(security.companyCode) ?? [],
        options.live?.get(security.companyCode),
        security.companyCode,
      ),
      financialsByCompany.get(security.companyCode) ?? null,
      marketMedianPe,
      combined.get(security.companyCode),
    ),
  );
}

const SNAPSHOT_KEY = "dashboardRows";
const SNAPSHOT_TTL_MS = 30 * 60 * 1000;
/**
 * Bump this whenever buildRow's logic changes in a way that should reach
 * users immediately rather than waiting out SNAPSHOT_TTL_MS or a background
 * sync — e.g. the sparkline calendar-window fallback below. A stored
 * snapshot from an older version is treated as stale regardless of age.
 */
const DASHBOARD_SCHEMA_VERSION = 4;

interface MarketSnapshot {
  key: string;
  rows: DashboardRow[];
  computedAt: Date;
  schemaVersion?: number;
}

/**
 * Dashboard rows served from a stored snapshot. MSE publishes prices once a
 * day, so recomputing indicators for every listed company on each page view is
 * wasted work; the snapshot turns it into a single small read.
 */
export async function getDashboardRows(db: Db): Promise<DashboardRow[]> {
  const snapshots = db.collection<MarketSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });
  const cacheIsFresh =
    !!cached && Date.now() - cached.computedAt.getTime() < SNAPSHOT_TTL_MS;
  const cacheIsCurrentVersion = cached?.schemaVersion === DASHBOARD_SCHEMA_VERSION;

  if (cached && cacheIsFresh && cacheIsCurrentVersion) {
    return cached.rows;
  }

  try {
    const live = await fetchLiveQuotes({ budgetMs: 9_000 }).catch(() => new Map());
    const rows = await computeDashboardRows(db, { live });
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      {
        $set: {
          key: SNAPSHOT_KEY,
          rows,
          computedAt: new Date(),
          schemaVersion: DASHBOARD_SCHEMA_VERSION,
        },
      },
      { upsert: true },
    );
    return rows;
  } catch (err) {
    // A stale snapshot beats an error page if the recompute fails, even one
    // from an older row shape — components tolerate missing new fields.
    if (cached) {
      console.error("dashboard recompute failed, serving stale snapshot", err);
      return cached.rows;
    }
    throw err;
  }
}

/**
 * Overlays the running price on rows served from the snapshot.
 *
 * The snapshot is built from stored closes, so during a session every list
 * — the market list, gainers, losers — shows the previous day's figures
 * while the detail page shows the live one. Only the price, its change and
 * the last sparkline point move; the signal and score stay as computed, so
 * a intraday tick cannot flap a recommendation.
 *
 * Deliberately not folded into getDashboardRows: the sync job reads those
 * rows too, and has no business making a third-party call.
 */
export interface LiveRows {
  rows: DashboardRow[];
  /** The day the figures describe, as far as anything here can establish. */
  session: string | null;
  /** The exchange's own gainers and losers, empty if it could not be asked. */
  board: ExchangeMovers;
}

export async function applyLiveQuotes(
  rows: DashboardRow[],
  options: { extraCaCerts?: string } = {},
): Promise<LiveRows> {
  const [quotes, movers] = await Promise.all([
    fetchLiveQuotes(options).catch(() => new Map<number, LiveQuote>()),
    fetchExchangeMovers().catch(() => ({ gainers: [], losers: [] })),
  ]);

  // The exchange's own board of what moved today, keyed by ticker. It is the
  // most current thing there is — it is the exchange — so it overrides both
  // the stored close and the third-party quote.
  const board = new Map(
    [...movers.gainers, ...movers.losers].map((m) => [m.symbol, m]),
  );

  if (quotes.size === 0 && board.size === 0) {
    return { rows, session: latestSessionDate(rows), board: movers };
  }

  // What day these figures describe.
  //
  // The live feed timestamps its quotes, so it answers this outright when it
  // is up. When it is not, the exchange's board answers it by implication: it
  // is always the running session, so if any of its prices differs from the
  // close stored for that company, a session has traded since the one stored
  // — and that session is today. If every price matches what is stored, the
  // board is that same stored session and keeps its date. A market closed
  // for the weekend or a holiday therefore keeps the last trading day rather
  // than being stamped with the date somebody happened to open the app.
  let session: string | null = null;
  for (const quote of quotes.values()) {
    const day = quote.at?.slice(0, 10);
    if (day && (!session || day > session)) session = day;
  }
  if (!session) {
    const storedSession = latestSessionDate(rows);
    const movedSinceStored = rows.some((row) => {
      const moved = board.get(row.symbol);
      return moved && row.lastPrice !== null && moved.price !== row.lastPrice;
    });
    session = movedSinceStored ? ulaanbaatarDay(new Date()) : storedSession;
  }

  const updated = rows.map((row) => {
    const moved = board.get(row.symbol);
    if (moved) {
      return {
        ...row,
        lastPrice: moved.price,
        changePct: moved.changePct,
        lastDate: session ?? row.lastDate,
        sparkline:
          row.sparkline.length > 0
            ? [...row.sparkline.slice(0, -1), moved.price]
            : row.sparkline,
      };
    }

    const live = quotes.get(row.companyCode);
    if (!live || live.price === null) return row;
    const liveDate = live.at?.slice(0, 10) ?? row.lastDate;

    // marketinfo does not always state a change. When it doesn't, and the
    // row it is overlaying is a session older, the row's own close is the
    // previous one — which is exactly what the change is measured from.
    // Without this those securities carry no change at all and drop out of
    // the movers, which is how a day with fifty trades showed four.
    const priorClose =
      row.lastDate && liveDate && row.lastDate < liveDate ? row.lastPrice : null;
    const changePct =
      live.changePct ??
      (priorClose && priorClose > 0
        ? ((live.price - priorClose) / priorClose) * 100
        : row.changePct);

    return {
      ...row,
      lastPrice: live.price,
      changePct,
      lastDate: liveDate,
      volume: live.volume ?? row.volume,
      // Keep the line ending where the number says it does.
      sparkline:
        row.sparkline.length > 0
          ? [...row.sparkline.slice(0, -1), live.price]
          : row.sparkline,
    };
  });

  return { rows: updated, session, board: movers };
}

/**
 * The most recent session any row carries — the market's "today".
 *
 * Rows are dated by when the security last traded, and on MSE that is a very
 * uneven thing: of 423 listings only about 50 change hands on a given day,
 * while some have not traded since 2006. The newest date across all rows is
 * therefore the last session the market held.
 */
export function latestSessionDate(rows: DashboardRow[]): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (row.lastDate && (!latest || row.lastDate > latest)) latest = row.lastDate;
  }
  return latest;
}

/**
 * The session the movers should describe, and the rows that traded in it.
 *
 * Not simply the newest date any row carries. A running quote arrives for
 * one company the moment it trades, and that alone would make its date "the
 * session" — leaving the lists with that single row while yesterday's fifty
 * are excluded for being a day old. So the newest date that carries a real
 * session's worth of trades wins, and only if no date does that at all is
 * the newest one used. Either way the section prints the date it is talking
 * about, so a reader is never told Tuesday is Wednesday.
 */
export function tradedSession(
  rows: DashboardRow[],
  minimum: number,
): { session: string | null; rows: DashboardRow[] } {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.lastDate || row.changePct === null) continue;
    counts.set(row.lastDate, (counts.get(row.lastDate) ?? 0) + 1);
  }

  const dates = [...counts.keys()].sort().reverse();
  const session = dates.find((d) => counts.get(d)! >= minimum) ?? dates[0] ?? null;
  if (!session) return { session: null, rows: [] };

  return {
    session,
    rows: rows.filter((r) => r.lastDate === session && r.changePct !== null),
  };
}

/**
 * Rows priced within `days` of the latest session. Indicators computed from a
 * series that stops years ago describe a market that no longer exists, so a
 * ranking by score has to bound how stale its inputs may be.
 */
export function pricedRecently(rows: DashboardRow[], days: number): DashboardRow[] {
  const session = latestSessionDate(rows);
  if (!session) return [];
  return rows.filter(
    (r) => r.lastDate !== null && daysBetween(r.lastDate, session) <= days,
  );
}

/** Rebuild the snapshot immediately (called after a sync ingests new prices). */
export async function refreshDashboardSnapshot(db: Db): Promise<number> {
  const live = await fetchLiveQuotes({ budgetMs: 9_000 }).catch(() => new Map());
  const rows = await computeDashboardRows(db, { live });
  await db.collection<MarketSnapshot>("marketSnapshots").updateOne(
    { key: SNAPSHOT_KEY },
    {
      $set: {
        key: SNAPSHOT_KEY,
        rows,
        computedAt: new Date(),
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
      },
    },
    { upsert: true },
  );
  return rows.length;
}

export async function getStockDetail(
  db: Db,
  symbol: string,
  /** Quotes the caller already has, so one render asks the feed once. */
  liveQuotes?: Map<number, LiveQuote>,
): Promise<StockDetail | null> {
  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) return null;

  const [prices, fullHistory, financialsByCompany] = await Promise.all([
    getRecentPrices(db, security.companyCode),
    getFullPriceSeries(db, security.companyCode),
    getLatestFinancialsByCompany(db),
  ]);

  const marketMedianPe = getMarketMedianPe(financialsByCompany);
  const financials = financialsByCompany.get(security.companyCode) ?? null;
  const live =
    liveQuotes ?? (await fetchLiveQuotes().catch(() => new Map<number, LiveQuote>()));
  const recommendation = computeRecommendation(
    withLivePoint(prices, live.get(security.companyCode), security.companyCode),
    financials,
    marketMedianPe,
  );

  return {
    security,
    financials,
    priceHistory: prices,
    fullHistory,
    recommendation,
    marketMedianPe,
  };
}

/**
 * The last session the market held, as far as anything here can tell.
 *
 * Two witnesses. The live feed knows a session has opened before any of it
 * has been stored, and the stored rows know about sessions the feed has
 * since forgotten; the later of the two is the day the app should be
 * showing. Null only when neither has anything to say.
 */
export async function latestMarketSession(
  db: Db,
  live?: Map<number, LiveQuote>,
): Promise<string | null> {
  let latest: string | null = null;
  for (const quote of live?.values() ?? []) {
    const day = quote.at?.slice(0, 10);
    if (day && (!latest || day > latest)) latest = day;
  }

  const snapshot = await db
    .collection<MarketSnapshot>("marketSnapshots")
    .findOne({ key: SNAPSHOT_KEY }, { projection: { rows: 1 } });
  const stored = snapshot ? latestSessionDate(snapshot.rows) : null;
  if (stored && (!latest || stored > latest)) latest = stored;

  return latest;
}

/**
 * Makes sure this company's stored prices cover today, fetching them from
 * the exchange if they do not.
 *
 * **This is the only definition of "up to date" in the app, and every path
 * that shows a price calls it.** That is the whole point of the function.
 * There used to be two: this one asked whether the stored prices covered
 * "the market session", where the session was the newest date across a
 * dashboard snapshot that is itself built from stored prices and cached for
 * half an hour — so on a day when the live feed was quiet it would conclude
 * that Wednesday's close was current on Friday and skip the fetch. The quote
 * endpoint the page's own header polls a moment later asked a different
 * question: is the newest stored close older than today's date? It got the
 * right answer, fetched, and returned the real price.
 *
 * The visible result was a page that painted Wednesday's price and silently
 * corrected itself a second later, which is exactly what a reader should
 * never see and what this had already been fixed for once. Two paths to one
 * number will always drift apart eventually, so there is now one.
 *
 * Anchored to the calendar rather than to anything derived from the data it
 * is checking: circularity is what made the old test unfalsifiable. If the
 * newest stored close is not today's, the exchange is asked. A company that
 * did not trade today will not gain a close from that, so an attempt is
 * stamped and it is left alone for a few minutes rather than re-fetched on
 * every render.
 *
 * It blocks the page, deliberately. The figure a company's page leads with
 * is its price; a page that prints a stale one and corrects itself is worse
 * than a page that takes a moment.
 */
export async function ensurePricesCurrent(
  db: Db,
  symbol: string,
): Promise<void> {
  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) return;

  const today = ulaanbaatarDay(new Date());
  const newest = await db
    .collection<PricePoint>("prices")
    .find({ companyCode: security.companyCode }, { projection: { _id: 0, date: 1 } })
    .sort({ date: -1 })
    .limit(1)
    .next();

  const shouldRefresh = needsPriceRefresh({
    newestStored: newest?.date ?? null,
    today,
    lastAttemptAt: security.pricesSyncedAt,
    now: Date.now(),
  });
  if (!shouldRefresh) return;

  try {
    await syncPricesForCompany(db, security.companyCode);
  } catch (err) {
    console.error(`price refresh failed for ${symbol}`, err);
  }

  // Stamped even when the fetch failed, so a source that is down is not
  // retried on every render of the page.
  await db
    .collection<Security>("securities")
    .updateOne(
      { companyCode: security.companyCode },
      { $set: { pricesSyncedAt: new Date(), pricesSyncedSession: today } },
    );
}

/**
 * getStockDetail with its prices brought up to the current session first.
 */
export async function getStockDetailFresh(
  db: Db,
  symbol: string,
): Promise<StockDetail | null> {
  const live = await fetchLiveQuotes().catch(() => new Map<number, LiveQuote>());
  await ensurePricesCurrent(db, symbol);
  return getStockDetail(db, symbol, live);
}
