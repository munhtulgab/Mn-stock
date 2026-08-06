import type { Db } from "mongodb";
import { fetchIndexSeries, INDEX_KEYS } from "@/lib/mse/indices";
import { mondayOf, previousMonth, shiftDays, ulaanbaatarDay } from "@/lib/day";
import type { PricePoint, Security } from "@/lib/types";

/**
 * What the market did over the last session, over a week and over a month.
 *
 * The periods are the calendar's, not a rolling count of days: the week is
 * the one the exchange publishes its own review of, and "өнгөрсөн сар" is
 * last month rather than the last thirty days.
 *
 * The exchange publishes a daily and a weekly trading report as articles and
 * nothing monthly at all, so all three are worked out here from the closes
 * the app already stores — which also means they are the same figures the
 * rest of the app shows, rather than a second opinion about the same days.
 *
 * A period's change for a security is measured from the last close before it
 * opened, so a week that began on a Monday is measured from Friday's close
 * and not from Monday's own. Where no earlier close exists — a listing that
 * first traded inside the period — the first close in it is used instead.
 */

export interface ReviewMover {
  symbol: string;
  name: string;
  from: number;
  to: number;
  changePct: number;
}

export interface ReviewIndex {
  label: string;
  from: number;
  to: number;
  changePct: number;
}

export interface MarketReview {
  /** Session dates the review covers. */
  from: string;
  to: string;
  /** Trading days the exchange actually held in the window. */
  sessions: number;
  /** Securities that changed hands at least once. */
  traded: number;
  /** Total turnover in tugriks. */
  turnover: number;
  gainers: ReviewMover[];
  losers: ReviewMover[];
  indices: ReviewIndex[];
}

export interface MarketReviews {
  /** The last session on its own, measured against the one before it. */
  day: MarketReview | null;
  week: MarketReview | null;
  month: MarketReview | null;
}

/** How many movers each side of a review names. */
const TOP = 3;

const SNAPSHOT_KEY = "marketReviews";
const CACHE_MS = 30 * 60 * 1000;
/** Bump when the stored shape changes so old rows are rebuilt, not served. */
const SCHEMA_VERSION = 4;

interface ReviewSnapshot {
  key: string;
  schemaVersion?: number;
  reviews: MarketReviews;
  /** The week these were built for; a different one is a different review. */
  weekOf?: string;
  computedAt: Date;
}

type Close = { date: string; close: number; turnover: number };

function buildReview(
  byCompany: Map<number, Close[]>,
  names: Map<number, Security>,
  from: string,
  to: string,
  indices: ReviewIndex[],
): MarketReview | null {
  const sessions = new Set<string>();
  const movers: ReviewMover[] = [];
  let turnover = 0;
  let traded = 0;

  for (const [companyCode, series] of byCompany) {
    const inside = series.filter((p) => p.date >= from && p.date <= to);
    if (inside.length === 0) continue;

    traded++;
    for (const point of inside) {
      sessions.add(point.date);
      turnover += point.turnover || 0;
    }

    // The close the period is measured from: the last one before it opened.
    const before = series.filter((p) => p.date < from).at(-1);
    const base = before?.close ?? inside[0].close;
    const last = inside.at(-1)!.close;
    if (!(base > 0) || !(last > 0) || base === last) continue;

    // A move that rounds to +0.00% is not one of the period's biggest movers,
    // however few securities traded.
    const changePct = ((last - base) / base) * 100;
    if (Math.abs(changePct) < 0.005) continue;

    const security = names.get(companyCode);
    movers.push({
      symbol: security?.symbol ?? String(companyCode),
      name: security?.name ?? "",
      from: base,
      to: last,
      changePct,
    });
  }

  if (sessions.size === 0) return null;

  const sorted = [...movers].sort((a, b) => b.changePct - a.changePct);
  return {
    from: [...sessions].sort()[0],
    to: [...sessions].sort().at(-1)!,
    sessions: sessions.size,
    traded,
    turnover,
    gainers: sorted.filter((m) => m.changePct > 0).slice(0, TOP),
    losers: sorted
      .filter((m) => m.changePct < 0)
      .slice(-TOP)
      .reverse(),
    indices,
  };
}

type IndexSeries = Awaited<ReturnType<typeof fetchIndexSeries>>;

/** Where each index stood either side of the window. */
function indexMoves(series: IndexSeries, from: string, to: string): ReviewIndex[] {
  return INDEX_KEYS.flatMap(({ key, label }) => {
    const points = series[key];
    if (!points || points.length === 0) return [];
    const inside = points.filter((p) => p.date >= from && p.date <= to);
    if (inside.length === 0) return [];
    const before = points.filter((p) => p.date < from).at(-1);
    const base = before?.value ?? inside[0].value;
    // The window's own last point, not the newest one there is: a month that
    // closed in July did not end at today's level.
    const last = inside.at(-1)!.value;
    if (!(base > 0) || !(last > 0)) return [];
    return [
      { label, from: base, to: last, changePct: ((last - base) / base) * 100 },
    ];
  });
}

/**
 * Reads the stored reviews, rebuilding them when they have gone stale.
 *
 * `weekOf` is any date inside the week the weekly review should cover —
 * in practice the date on the exchange's own weekly report, so the card and
 * the article beside it are about the same five days. Without it the last
 * week that has fully passed is used.
 */
export async function getMarketReviews(
  db: Db,
  weekOf?: string,
): Promise<MarketReviews> {
  const snapshots = db.collection<ReviewSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });
  const week = weekStart(weekOf);
  if (
    cached?.schemaVersion === SCHEMA_VERSION &&
    cached.weekOf === week &&
    Date.now() - cached.computedAt.getTime() < CACHE_MS
  ) {
    return cached.reviews;
  }

  try {
    const reviews = await computeMarketReviews(db, weekOf);
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      {
        $set: {
          key: SNAPSHOT_KEY,
          reviews,
          weekOf: week,
          computedAt: new Date(),
          schemaVersion: SCHEMA_VERSION,
        },
      },
      { upsert: true },
    );
    return reviews;
  } catch (err) {
    console.error("market review failed", err);
    return cached?.reviews ?? { day: null, week: null, month: null };
  }
}

/**
 * The Monday of the week a review covers: the one holding `weekOf` when the
 * exchange has published a review, and otherwise the last week that has
 * fully passed — this week is still happening and is not a review yet.
 */
function weekStart(weekOf?: string): string {
  const today = ulaanbaatarDay(new Date());
  return weekOf ? mondayOf(weekOf) : shiftDays(mondayOf(today), -7);
}

export async function computeMarketReviews(
  db: Db,
  weekOf?: string,
): Promise<MarketReviews> {
  const [newest] = await db
    .collection<PricePoint>("prices")
    .find({}, { projection: { _id: 0, date: 1 } })
    .sort({ date: -1 })
    .limit(1)
    .toArray();
  if (!newest) return { day: null, week: null, month: null };

  const to = newest.date;
  // Calendar periods rather than rolling windows: "өнгөрсөн сар" is July,
  // and the week is the one the exchange reviews, not the last seven days.
  const weekFrom = weekStart(weekOf);
  const weekTo = shiftDays(weekFrom, 6);
  const month = previousMonth(ulaanbaatarDay(new Date()));
  // Far enough back that the earliest window has a close before it to be
  // measured from, even across a long holiday.
  const window = shiftDays(month.from, -40);

  const [rows, securities] = await Promise.all([
    db
      .collection<PricePoint>("prices")
      .find(
        { date: { $gte: window, $lte: to } },
        { projection: { _id: 0, companyCode: 1, date: 1, close: 1, turnover: 1 } },
      )
      .sort({ date: 1 })
      .toArray(),
    db
      .collection<Security>("securities")
      .find({}, { projection: { _id: 0, companyCode: 1, symbol: 1, name: 1 } })
      .toArray(),
  ]);

  const byCompany = new Map<number, Close[]>();
  for (const row of rows) {
    const series = byCompany.get(row.companyCode) ?? [];
    series.push({ date: row.date, close: row.close, turnover: row.turnover });
    byCompany.set(row.companyCode, series);
  }
  const names = new Map(securities.map((s) => [s.companyCode, s]));

  // One read of the index histories for all three windows: asking again is
  // another chance for an index to drop out, and the cards then disagree
  // about which indices exist.
  const series = await fetchIndexSeries().catch((err) => {
    console.error("index series unavailable for the review", err);
    return {} as IndexSeries;
  });

  return {
    // The last session on its own: measured from the close before it, which
    // is what makes it the day's change rather than the day's level.
    day: buildReview(byCompany, names, to, to, indexMoves(series, to, to)),
    week: buildReview(
      byCompany,
      names,
      weekFrom,
      weekTo,
      indexMoves(series, weekFrom, weekTo),
    ),
    month: buildReview(
      byCompany,
      names,
      month.from,
      month.to,
      indexMoves(series, month.from, month.to),
    ),
  };
}
