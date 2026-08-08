import type { Db } from "mongodb";
import { fetchIndexSeries, INDEX_KEYS } from "@/lib/mse/indices";
import { mondayOf, previousMonth, shiftDays, ulaanbaatarDay } from "@/lib/day";
import type { PricePoint, Security } from "@/lib/types";
import { fetchLiveQuotes, type LiveQuote } from "@/lib/marketinfo/quotes";

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

/**
 * A period written as the exchange writes one: "2026.08.03-2026.08.07".
 *
 * Dots rather than dashes between the parts, because a dash is already
 * doing the work of separating the two dates and "2026-08-03-2026-08-07"
 * is unreadable.
 */
function dotted(date: string): string {
  return date.replaceAll("-", ".");
}

/**
 * The app's own weekly summary, named as a story rather than as a panel.
 *
 * "7 хоногийн зах зээлийн тойм" is a heading — it says what kind of thing
 * this is and nothing about which week. Once the summary sits in the feed
 * beside the exchange's own reports it needs to say which five days it
 * covers, the way every dated report around it does.
 */
export function weeklyReviewTitle(review: MarketReview): string {
  return `Долоо хоногийн тойм (${dotted(review.from)}-${dotted(review.to)})`;
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
const SCHEMA_VERSION = 7;

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
 * `weekOf` is any date inside the week the weekly review should cover, for a
 * caller that wants a particular one. Without it the week is the calendar
 * week before this one — see `weekStart`.
 */
export async function getMarketReviews(
  db: Db,
  weekOf?: string,
): Promise<MarketReviews> {
  const snapshots = db.collection<ReviewSnapshot>("marketSnapshots");
  const cached = await snapshots.findOne({ key: SNAPSHOT_KEY });
  // The window is derived from the sessions held, so it can move when the
  // day does; keying on the day rebuilds it then rather than serving
  // yesterday's idea of which week this is.
  const week = weekOf ? mondayOf(weekOf) : ulaanbaatarDay(new Date());
  if (
    cached?.schemaVersion === SCHEMA_VERSION &&
    cached.weekOf === week &&
    Date.now() - cached.computedAt.getTime() < CACHE_MS
  ) {
    return cached.reviews;
  }

  try {
    // Asked for here rather than inside, so a feed that is down costs the
    // review nothing but the newest session.
    const live = await fetchLiveQuotes().catch(() => new Map<number, LiveQuote>());
    const reviews = await computeMarketReviews(db, weekOf, live);
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
 * The Monday of the week a review covers.
 *
 * The calendar week before the one today falls in, which is what "өнгөрсөн
 * долоо хоног" says: on Saturday the 8th that is the 27th to the 31st, not
 * the week just finished. Two earlier versions of this got it wrong in
 * opposite directions — one anchored to the date on the exchange's own
 * weekly article, which is published during the week after and so lagged by
 * one; the other took the week the latest session fell in, which is the week
 * the label explicitly does not mean.
 *
 * It is the plain calendar rule now, and it needs nothing but the clock. The
 * exchange's own review of the same week sits beside it in the slider, and
 * that article covers these same five days.
 *
 * `weekOf` still overrides, for a caller that wants a particular week.
 */
function weekStart(weekOf?: string): string {
  if (weekOf) return mondayOf(weekOf);
  return shiftDays(mondayOf(ulaanbaatarDay(new Date())), -7);
}

export async function computeMarketReviews(
  db: Db,
  weekOf?: string,
  /**
   * The exchange's running quotes, folded in as the newest session.
   *
   * The exchange publishes a day's closes only after it shuts, and the app's
   * own price store fills in behind that on a time-boxed cursor, so on the
   * afternoon of a trading day the stored history can still stop on
   * yesterday — which is how a review headed "8 сарын 6" sat under the
   * exchange's own report for the 7th. The live feed carries exactly the
   * companies that traded, which is exactly the set a review is about, and
   * after the close its figures are that session's finals.
   */
  live?: Map<number, LiveQuote>,
): Promise<MarketReviews> {
  const [newest] = await db
    .collection<PricePoint>("prices")
    .find({}, { projection: { _id: 0, date: 1 } })
    .sort({ date: -1 })
    .limit(1)
    .toArray();
  if (!newest) return { day: null, week: null, month: null };

  // The live session, where it is newer than anything stored.
  const liveRows: { companyCode: number; date: string; close: number; turnover: number }[] = [];
  let liveDate: string | null = null;
  for (const [companyCode, quote] of live ?? []) {
    const day = quote.at?.slice(0, 10);
    if (!day || quote.price === null || day <= newest.date) continue;
    liveRows.push({
      companyCode,
      date: day,
      close: quote.price,
      turnover: quote.turnover ?? 0,
    });
    if (!liveDate || day > liveDate) liveDate = day;
  }

  const to = liveDate ?? newest.date;

  // Calendar periods rather than rolling windows: "өнгөрсөн сар" is July and
  // "өнгөрсөн долоо хоног" is the week before this one.
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
  // Appended after the stored rows, which are read in date order, so each
  // company's series still ends on its newest close.
  for (const row of [...rows, ...liveRows]) {
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
