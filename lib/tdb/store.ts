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
/** Annual figures; a week between refreshes is already generous. */
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

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

interface TdbDividendDoc {
  companyCode: number;
  history: TdbDividend[];
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

interface SyncMeta {
  key: string;
  syncedAt: Date;
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

  for (let year = TDB_FIRST_YEAR; year <= thisYear; year++) {
    const fetched = await fetchTdbYear(year).catch(() => [] as TdbYear[]);
    if (fetched.length === 0) continue;
    years++;

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

  await db
    .collection<SyncMeta>("marketSnapshots")
    .updateOne(
      { key: META_KEY },
      { $set: { key: META_KEY, syncedAt: new Date() } },
      { upsert: true },
    );

  return { years, rows, dividends, profiles };
}

/** True when Datalab has not been read for a week. */
export async function tdbIsStale(db: Db): Promise<boolean> {
  const meta = await db
    .collection<SyncMeta>("marketSnapshots")
    .findOne({ key: META_KEY });
  return !meta || Date.now() - meta.syncedAt.getTime() > REFRESH_MS;
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

export async function getTdbDividends(
  db: Db,
  companyCode: number,
): Promise<TdbDividend[]> {
  const doc = await db
    .collection<TdbDividendDoc>(DIVIDENDS)
    .findOne({ companyCode });
  return doc?.history ?? [];
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

/**
 * Every company's year figures, for the lists and the sector comparisons.
 *
 * The distribution is left out: it is twenty buckets per company and only
 * ever read one company at a time.
 */
export async function getTdbProfiles(db: Db): Promise<Map<number, TdbProfile>> {
  const docs = await db
    .collection<TdbProfileDoc>(PROFILES)
    .find({ profile: { $ne: null } }, { projection: { _id: 0, distribution: 0 } })
    .toArray();

  const out = new Map<number, TdbProfile>();
  for (const doc of docs) if (doc.profile) out.set(doc.companyCode, doc.profile);
  return out;
}
