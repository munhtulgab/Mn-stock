import type { Db } from "mongodb";

/**
 * What Mongolbank pays for a gram of gold, day by day.
 *
 * The central bank publishes a buying price for gold and silver on every
 * working day, and it is the reference the whole domestic market is quoted
 * against. It is here because of ALTT: a fund whose whole business is holding
 * gold cannot be read against its own price history alone — the question
 * asked of it is whether it is keeping up with the metal, and that needs the
 * metal on the same chart.
 *
 * Divided by a hundred before it leaves this module. A gram is around half a
 * million tögrög and a unit of the fund is around five thousand, so the two
 * drawn on one axis would be a flat line at the bottom under a line at the
 * top. A hundredth of a gram is an arbitrary unit and the right one: it puts
 * the two series in the same place so their shapes can be compared, which is
 * the only reason to draw them together.
 */

/** The page's own endpoint, which its table and chart both read. */
const ENDPOINT = "https://www.mongolbank.mn/mn/gold-and-silver-price/data";

/**
 * The parameters go in the query string even though the call is a POST —
 * the site's own client passes them as axios `params`, and sent as a body
 * the endpoint answers "Тохирох үр дүн олдсонгүй" with a 200.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const TIMEOUT_MS = 20_000;

/**
 * How far back to ask.
 *
 * The bank's series begins on 2 January 2009 at 35,282.84₮ a gram, and all
 * of it is worth having: ten years covered the chart's longest range but
 * not the analysis, which wants as long a run of daily returns as exists
 * before it says anything about drawdown or a two-hundred-day average.
 */
const SINCE = "2009-01-01";

/** How long a stored copy stands before it is worth asking again. */
const STALE_MS = 6 * 60 * 60 * 1000;

const SNAPSHOT_KEY = "mongolbank-gold";

/**
 * Listings whose price is the metal rather than a business.
 *
 * Keyed by symbol like the news subjects in `lib/mse/newsSources`, and for
 * the same reason: nothing in "Гоулд Траст Хамтын биржээр арилжаалагддаг
 * хөрөнгө оруулалтын сан" says gold, so there is nothing to infer it from.
 * One entry today; a second gold fund would be one line.
 */
const TRACKS_GOLD = new Set(["ALTT"]);

/** True where the analysis should be read off the metal, not the listing. */
export function tracksGold(symbol: string): boolean {
  return TRACKS_GOLD.has(symbol.toUpperCase());
}

export interface GoldPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Tögrög per hundredth of a gram: the bank's buying price over 100. */
  price: number;
}

interface GoldSnapshot {
  key: string;
  fetchedAt: Date;
  points: GoldPoint[];
}

interface RateRow {
  RATE_DATE?: string;
  GOLD_BUY?: string | number;
}

/**
 * The rows as the bank sends them: a date it writes `YYYY-MM-DD`, and a
 * price it writes `510,096.92` — a string with thousands separators in it,
 * which `Number` reads as NaN.
 */
export function parseGoldRows(payload: unknown): GoldPoint[] {
  const data = (payload as { success?: boolean; data?: unknown })?.data;
  if (!Array.isArray(data)) return [];

  const points: GoldPoint[] = [];
  for (const row of data as RateRow[]) {
    const date = String(row?.RATE_DATE ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const buy = Number(String(row?.GOLD_BUY ?? "").replace(/[\s,]/g, ""));
    if (!Number.isFinite(buy) || buy <= 0) continue;
    points.push({ date, price: buy / 100 });
  }
  // Oldest first, and one point per day: the bank restates a day now and
  // then, and the later row is the corrected one.
  const byDay = new Map(points.map((p) => [p.date, p]));
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Every day the bank has published, straight from the source. */
export async function fetchGoldPrices(since = SINCE): Promise<GoldPoint[]> {
  const query = new URLSearchParams({
    startDate: since,
    endDate: new Date().toISOString().slice(0, 10),
  });

  const res = await fetch(`${ENDPOINT}?${query}`, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`mongolbank ${res.status}`);
  return parseGoldRows(await res.json());
}

/**
 * The series, from the stored copy where it is fresh enough.
 *
 * The bank moves this once a working day, so a reader opening the chart
 * should not be waiting on a request to another institution's website — and
 * that website should not be hearing from us once per page view either. A
 * stale copy is served when the refresh fails: yesterday's gold price is a
 * better answer than an empty chart.
 */
export async function getGoldPrices(db: Db): Promise<GoldPoint[]> {
  const stored = await db
    .collection<GoldSnapshot>("goldSnapshots")
    .findOne({ key: SNAPSHOT_KEY });

  const fresh =
    stored && Date.now() - new Date(stored.fetchedAt).getTime() < STALE_MS;
  if (fresh && stored.points.length > 0) return stored.points;

  try {
    const points = await fetchGoldPrices();
    if (points.length === 0) return stored?.points ?? [];
    await db
      .collection<GoldSnapshot>("goldSnapshots")
      .updateOne(
        { key: SNAPSHOT_KEY },
        { $set: { key: SNAPSHOT_KEY, fetchedAt: new Date(), points } },
        { upsert: true },
      );
    return points;
  } catch (err) {
    console.error("gold price fetch failed", err);
    return stored?.points ?? [];
  }
}

/** A row this module can align against: dated, and in date order. */
export interface DatedRow {
  date: string;
}

/**
 * Attach the latest value at or before each row's date.
 *
 * Used in both directions. When the chart's spine is the security, the metal
 * is joined onto it; when the spine is the metal — which it is in the gold
 * view, because seventeen years of it is the point — the security's own
 * closes are joined onto that instead.
 *
 * At or before, rather than an exact match: the two calendars do not line up.
 * The bank quotes on days the exchange is shut, the exchange trades on days
 * the bank has not published, and a weekly or monthly bar carries one date
 * for five or twenty of them.
 *
 * Rows before the other series begins are left without a value rather than
 * given its oldest one. Gold started in 2009 and ALTT listed in 2026; a fund
 * price carried back seventeen years would be a line saying something that
 * never happened.
 */
export function alignByDate<T extends DatedRow, K extends string>(
  rows: T[],
  points: { date: string; price: number }[] | null,
  key: K,
): (T & Partial<Record<K, number>>)[] {
  if (!points || points.length === 0) return rows as (T & Partial<Record<K, number>>)[];

  let i = 0;
  let latest: number | undefined;
  return rows.map((row) => {
    while (i < points.length && points[i].date <= row.date) {
      latest = points[i].price;
      i++;
    }
    return latest === undefined
      ? (row as T & Partial<Record<K, number>>)
      : ({ ...row, [key]: latest } as T & Partial<Record<K, number>>);
  });
}
