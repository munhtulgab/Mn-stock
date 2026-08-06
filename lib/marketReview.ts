import type { Db } from "mongodb";
import { fetchIndexSeries, INDEX_KEYS } from "@/lib/mse/indices";
import type { PricePoint, Security } from "@/lib/types";

/**
 * What the market did over a week and over a month.
 *
 * The exchange publishes a weekly trading review as an article and nothing
 * monthly at all, so both are worked out here from the closes the app
 * already stores — which also means they are the same figures the rest of
 * the app shows, rather than a second opinion about the same days.
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
  week: MarketReview | null;
  month: MarketReview | null;
}

const WEEK_DAYS = 7;
const MONTH_DAYS = 30;
/** How many movers each side of a review names. */
const TOP = 3;

const SNAPSHOT_KEY = "marketReviews";
const CACHE_MS = 30 * 60 * 1000;
/** Bump when the stored shape changes so old rows are rebuilt, not served. */
const SCHEMA_VERSION = 2;

interface ReviewSnapshot {
  key: string;
  schemaVersion?: number;
  reviews: MarketReviews;
  computedAt: Date;
}

function daysBefore(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
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

    const security = names.get(companyCode);
    movers.push({
      symbol: security?.symbol ?? String(companyCode),
      name: security?.name ?? "",
      from: base,
      to: last,
      changePct: ((last - base) / base) * 100,
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

/** Where each index stood at the start of the window, and where it stands now. */
function indexMoves(series: IndexSeries, from: string): ReviewIndex[] {
  return INDEX_KEYS.flatMap(({ key, label }) => {
    const points = series[key];
    if (!points || points.length === 0) return [];
    const before = points.filter((p) => p.date < from).at(-1);
    const inside = points.filter((p) => p.date >= from);
    const base = before?.value ?? inside[0]?.value;
    const last = points.at(-1)!.value;
    if (!base || !(base > 0)) return [];
    return [
      { label, from: base, to: last, changePct: ((last - base) / base) * 100 },
    ];
  });
}

/** Reads the stored reviews, rebuilding them when they have gone stale. */
export async function getMarketReviews(db: Db): Promise<MarketReviews> {
  const snapshots = db.collection<ReviewSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });
  if (
    cached?.schemaVersion === SCHEMA_VERSION &&
    Date.now() - cached.computedAt.getTime() < CACHE_MS
  ) {
    return cached.reviews;
  }

  try {
    const reviews = await computeMarketReviews(db);
    await snapshots.updateOne(
      { key: SNAPSHOT_KEY },
      {
        $set: {
          key: SNAPSHOT_KEY,
          reviews,
          computedAt: new Date(),
          schemaVersion: SCHEMA_VERSION,
        },
      },
      { upsert: true },
    );
    return reviews;
  } catch (err) {
    console.error("market review failed", err);
    return cached?.reviews ?? { week: null, month: null };
  }
}

export async function computeMarketReviews(db: Db): Promise<MarketReviews> {
  // A little more than the longest window, so the month has a close before it
  // to measure from even across a long holiday.
  const [newest] = await db
    .collection<PricePoint>("prices")
    .find({}, { projection: { _id: 0, date: 1 } })
    .sort({ date: -1 })
    .limit(1)
    .toArray();
  if (!newest) return { week: null, month: null };

  const to = newest.date;
  const window = daysBefore(to, MONTH_DAYS + 20);

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

  const weekFrom = daysBefore(to, WEEK_DAYS - 1);
  const monthFrom = daysBefore(to, MONTH_DAYS - 1);
  // One read of the index histories for both windows: asking twice is two
  // chances for an index to drop out, and the two cards then disagree about
  // which indices exist.
  const series = await fetchIndexSeries().catch((err) => {
    console.error("index series unavailable for the review", err);
    return {} as IndexSeries;
  });

  return {
    week: buildReview(byCompany, names, weekFrom, to, indexMoves(series, weekFrom)),
    month: buildReview(byCompany, names, monthFrom, to, indexMoves(series, monthFrom)),
  };
}
