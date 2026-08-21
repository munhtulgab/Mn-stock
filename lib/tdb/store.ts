import type { Db } from "mongodb";
import {
  fetchTdbDividends,
  fetchTdbProfile,
  fetchTdbReturnDistribution,
  fetchTdbYear,
  usable,
  TDB_FIRST_YEAR,
  type TdbDividend,
  type TdbProfile,
  type TdbReturnDistribution,
  type TdbYear,
} from "./datalab";

/**
 * Datalab's figures, kept locally so a page render never waits on a third
 * party.
 *
 * These are closed financial years. They change once a year per company, so
 * they are refreshed on the same slow schedule as everything else and read
 * from Mongo on every request.
 */

const COLLECTION = "tdbAnnual";
const DIVIDENDS = "tdbDividends";
const PROFILES = "tdbProfiles";
const META_KEY = "tdbSync";
/** The dividend half of the sweep, which can also run on its own. */
const DIVIDEND_META_KEY = "tdbDividendSync";
/** Annual figures; a week between refreshes is already generous. */
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** How long a failed attempt holds off the next one. */
const RETRY_MS = 30 * 60 * 1000;
/** A stamp for a sweep that has never finished. */
const NEVER = new Date(0);
/**
 * Years asked about at once by the dividend-only refresh.
 *
 * Nine of them, and the whole set answers in about two seconds this way
 * against five sequentially. Six is what the per-company sweep below already
 * asks of the same API, so this is not a new demand on it.
 */
const YEAR_CONCURRENCY = 6;
/**
 * Bumped when a sweep starts covering something it did not cover before, so
 * the next run happens now rather than whenever the week is up. Version 2
 * reaches back to 2018 and keeps the year list's dividend column.
 */
export const SYNC_VERSION = 2;

/**
 * Companies asked about at once.
 *
 * Three calls each — dividends, profile, distribution — across the eighty-odd
 * companies Datalab covers. One at a time that is a few hundred sequential
 * round trips inside a sync whose caller gives it twenty seconds; six at a
 * time it is a handful of rounds. Small enough not to read as a flood at
 * their end, which matters for an API being used without being asked.
 */
const COMPANY_CONCURRENCY = 6;

/**
 * What one company has paid, from both of Datalab's accounts of it.
 *
 * `history` is the per-company dividend endpoint, which answers with four
 * years and nothing before them. `annual` is the dividend column of the
 * market-wide year list, which reaches back to 2018 — the same series the
 * Datalab site's own dividends view is drawn from. Where the two overlap they
 * agree to the last decimal place, checked across АПУ, ТТЛ, Сүү, QPAY, ММХ,
 * Сүлжээ and Тахьколтех, so the older half is the only thing the second field
 * adds.
 *
 * Kept as two fields rather than merged on write so that a company dropped
 * from one sweep does not silently lose the years the other sweep found.
 */
interface TdbDividendDoc {
  companyCode: number;
  history: TdbDividend[];
  annual?: TdbDividend[];
  fetchedAt: Date;
}

/**
 * A company's year at a glance, and the shape of its daily moves.
 *
 * One document rather than two: they come from the same sweep, are read
 * together by the page that shows them, and neither is worth a collection of
 * its own.
 */
interface TdbProfileDoc {
  companyCode: number;
  profile: TdbProfile | null;
  distribution: TdbReturnDistribution | null;
  fetchedAt: Date;
}

/** Runs `work` over `items`, at most `limit` of them in flight at a time. */
export async function pooled<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
      await work(next);
    }
  });
  await Promise.all(workers);
}

export interface SyncMeta {
  key: string;
  /** When a run last finished. */
  syncedAt: Date;
  /** The version of this code that finished it. */
  version?: number;
  /** When a run last started, which is not the same as finishing one. */
  attemptedAt?: Date;
}

/**
 * Whether a stamped sweep should run now.
 *
 * Three things have to be true together, and the reason this is written out
 * rather than inlined is that getting any of them wrong is invisible until it
 * is expensive. A sweep is due when it has never finished, when the code that
 * finished it has since learnt to fetch more, or when a week has passed — and
 * it is held back regardless if something started one in the last half hour,
 * so a source that is refusing to answer is retried by the occasional reader
 * rather than by every render in between.
 *
 * The finish and the start are separate fields for the same reason: an attempt
 * that failed must never be able to pass for a sweep that succeeded, which is
 * what a single timestamp would have made it.
 */
export function dueForRefresh(stamp: SyncMeta | null, now: number): boolean {
  if (stamp?.attemptedAt && now - stamp.attemptedAt.getTime() < RETRY_MS) {
    return false;
  }
  if (!stamp) return true;
  if (stamp.version !== SYNC_VERSION) return true;
  return now - stamp.syncedAt.getTime() >= REFRESH_MS;
}

/** Marks a sweep as done, so the next caller knows not to repeat it. */
async function stampSync(db: Db, key: string): Promise<void> {
  await db
    .collection<SyncMeta>("marketSnapshots")
    .updateOne(
      { key },
      { $set: { key, syncedAt: new Date(), version: SYNC_VERSION } },
      { upsert: true },
    );
}

/**
 * The dividend column of the year list, out of rows already fetched.
 *
 * Taken before the plausibility filter the ratios go through, and
 * deliberately. A dividend per share is a figure the company declared, not one
 * Datalab worked out from a part-filed statement, and it survives a row whose
 * ratios do not: 22 of the 29 companies with a dividend for the running year
 * sit in rows `usable` rejects for an impossible margin, and every one of
 * those dividends matches the per-company endpoint exactly. Losing them with
 * the row would mean the newest payout — the one a reader is actually asking
 * about — disappearing until the year closed.
 */
function harvestDividends(rows: TdbYear[], into: Map<number, TdbDividend[]>): void {
  for (const row of rows) {
    if (row.dividendPerShare === null || row.dividendPerShare <= 0) continue;
    into.set(row.companyCode, [
      ...(into.get(row.companyCode) ?? []),
      {
        year: row.year,
        amountPerShare: row.dividendPerShare,
        // Stated only by the per-company endpoint; the year list carries the
        // per-share figure and the two ratios around it.
        totalPaid: null,
        yieldPct: row.dividendYield,
        payoutRatio: row.dividendPayoutRatio,
      },
    ]);
  }
}

/** Stores one harvest, leaving the per-company half of each document alone. */
async function writeAnnualDividends(
  db: Db,
  annual: Map<number, TdbDividend[]>,
): Promise<number> {
  if (annual.size === 0) return 0;
  await db.collection<TdbDividendDoc>(DIVIDENDS).bulkWrite(
    [...annual].map(([companyCode, history]) => ({
      updateOne: {
        filter: { companyCode },
        update: {
          $set: { companyCode, annual: history.sort((a, b) => b.year - a.year) },
          $setOnInsert: { history: [], fetchedAt: new Date() },
        },
        upsert: true,
      },
    })),
  );
  return annual.size;
}

/**
 * Every year of the market's dividend history, on its own.
 *
 * The full sweep above fetches this as a by-product of the ratios, but it runs
 * behind the daily sync and at most once a week — so the day this app started
 * keeping 2018 and 2019, every reader saw four years of an eight-year history
 * until the next sync happened to come round. A page should not wait a day for
 * a change to what it stores.
 *
 * This is the cheap half of that sweep taken by itself: nine calls, no
 * per-company reads, the whole market in one go. It is safe to call on a page
 * render because it almost always does nothing — one indexed read of the meta
 * document — and because the work it guards is bounded whatever happens to it.
 */
export async function ensureTdbDividends(db: Db, today: string): Promise<number> {
  const meta = db.collection<SyncMeta>("marketSnapshots");
  const stamp = await meta.findOne({ key: DIVIDEND_META_KEY });
  if (!dueForRefresh(stamp, Date.now())) return 0;

  await meta.updateOne(
    { key: DIVIDEND_META_KEY },
    {
      $set: { key: DIVIDEND_META_KEY, attemptedAt: new Date() },
      $setOnInsert: { syncedAt: NEVER },
    },
    { upsert: true },
  );

  const thisYear = Number(today.slice(0, 4));
  const years = Array.from(
    { length: thisYear - TDB_FIRST_YEAR + 1 },
    (_, i) => TDB_FIRST_YEAR + i,
  );

  const annual = new Map<number, TdbDividend[]>();
  let answered = 0;
  await pooled(years, YEAR_CONCURRENCY, async (year) => {
    const rows = await fetchTdbYear(year).catch(() => [] as TdbYear[]);
    if (rows.length === 0) return;
    answered++;
    harvestDividends(rows, annual);
  });

  // Nothing at all came back: leave what is stored alone rather than replacing
  // a real history with an empty one, and let the attempt stamp above hold off
  // the retry.
  if (answered === 0) return 0;

  const written = await writeAnnualDividends(db, annual);
  await stampSync(db, DIVIDEND_META_KEY);
  return written;
}

/**
 * Pulls every year Datalab covers and keeps the rows that survive their own
 * arithmetic, then one dividend history per company it knows about.
 */
export async function syncTdb(db: Db, today: string): Promise<{
  years: number;
  rows: number;
  dividends: number;
  profiles: number;
}> {
  const thisYear = Number(today.slice(0, 4));
  let rows = 0;
  let years = 0;
  const companies = new Set<number>();
  const annual = new Map<number, TdbDividend[]>();

  for (let year = TDB_FIRST_YEAR; year <= thisYear; year++) {
    const fetched = await fetchTdbYear(year).catch(() => [] as TdbYear[]);
    if (fetched.length === 0) continue;
    years++;

    // Before the plausibility filter below, for the reasons given where this
    // is defined.
    harvestDividends(fetched, annual);

    // Kept per row rather than per year. Datalab's newest year is part
    // filled, so it holds good rows for the companies that have filed and
    // impossible ones for those that have not; taking the year whole would
    // mean either discarding the good or publishing the impossible.
    const keep = fetched.filter(usable);
    if (keep.length === 0) continue;

    await db.collection<TdbYear>(COLLECTION).bulkWrite(
      keep.map((row) => ({
        updateOne: {
          filter: { companyCode: row.companyCode, year: row.year },
          update: { $set: row },
          upsert: true,
        },
      })),
    );
    rows += keep.length;
    for (const row of keep) companies.add(row.companyCode);
  }

  let dividends = 0;
  let profiles = 0;

  // The long half of the history, written before the per-company sweep so a
  // company that sweep cannot reach still has its years stored.
  if ((await writeAnnualDividends(db, annual)) > 0) {
    // Which is the whole of what the dividend-only refresh does, so it has
    // nothing left to do for a week.
    await stampSync(db, DIVIDEND_META_KEY);
  }

  await pooled([...companies], COMPANY_CONCURRENCY, async (companyCode) => {
    // Three independent reads of the same company. One failing says nothing
    // about the other two — a company with no dividend history still has a
    // year's range — so each is caught on its own rather than the set being
    // abandoned on the first error.
    const [summary, profile, distribution] = await Promise.all([
      fetchTdbDividends(companyCode, thisYear).catch(() => null),
      fetchTdbProfile(companyCode).catch(() => null),
      fetchTdbReturnDistribution(companyCode).catch(() => null),
    ]);

    if (summary) {
      await db.collection<TdbDividendDoc>(DIVIDENDS).updateOne(
        { companyCode },
        { $set: { companyCode, history: summary.history, fetchedAt: new Date() } },
        { upsert: true },
      );
      dividends++;
    }

    // Written even where one half is missing, so the other half is still
    // read; a document with both null is not worth storing.
    if (profile || distribution) {
      await db.collection<TdbProfileDoc>(PROFILES).updateOne(
        { companyCode },
        { $set: { companyCode, profile, distribution, fetchedAt: new Date() } },
        { upsert: true },
      );
      profiles++;
    }
  });

  await stampSync(db, META_KEY);

  return { years, rows, dividends, profiles };
}

/** True when Datalab has not been read for a week, or was read for less. */
export async function tdbIsStale(db: Db): Promise<boolean> {
  const meta = await db
    .collection<SyncMeta>("marketSnapshots")
    .findOne({ key: META_KEY });
  if (!meta) return true;
  if ((meta.version ?? 1) !== SYNC_VERSION) return true;
  return Date.now() - meta.syncedAt.getTime() > REFRESH_MS;
}

/**
 * The latest stored year for every company, and the year before it.
 *
 * Two years rather than one because a year-on-year change needs both, and
 * because reading them together is one query where reading them apart is
 * two. Companies are keyed by MSE's company code, which is what Datalab's
 * own `stockcode` turns out to be.
 */
export async function getTdbLatest(
  db: Db,
): Promise<Map<number, { latest: TdbYear; previous: TdbYear | null }>> {
  const rows = await db
    .collection<TdbYear>(COLLECTION)
    .find({}, { projection: { _id: 0 } })
    .sort({ companyCode: 1, year: -1 })
    .toArray();

  const out = new Map<number, { latest: TdbYear; previous: TdbYear | null }>();
  for (const row of rows) {
    const entry = out.get(row.companyCode);
    if (!entry) out.set(row.companyCode, { latest: row, previous: null });
    else if (entry.previous === null && row.year < entry.latest.year) {
      entry.previous = row;
    }
  }
  return out;
}

/**
 * Every year Datalab knows this company paid in, newest first.
 *
 * Both of its accounts, the wider one behind the narrower: the year list
 * reaches back to 2018 and the per-company endpoint only four years, so the
 * older years come from the first and the recent ones — which carry the total
 * paid out as well — from the second. They agree where they overlap.
 */
export async function getTdbDividends(
  db: Db,
  companyCode: number,
): Promise<TdbDividend[]> {
  const doc = await db
    .collection<TdbDividendDoc>(DIVIDENDS)
    .findOne({ companyCode });
  if (!doc) return [];

  const byYear = new Map<number, TdbDividend>();
  for (const row of doc.annual ?? []) byYear.set(row.year, row);
  for (const row of doc.history ?? []) byYear.set(row.year, row);
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

/** One company's year figures and return distribution, as last stored. */
export async function getTdbProfile(
  db: Db,
  companyCode: number,
): Promise<{
  profile: TdbProfile | null;
  distribution: TdbReturnDistribution | null;
}> {
  const doc = await db
    .collection<TdbProfileDoc>(PROFILES)
    .findOne({ companyCode }, { projection: { _id: 0 } });
  return {
    profile: doc?.profile ?? null,
    distribution: doc?.distribution ?? null,
  };
}
