import type { Db } from "mongodb";
import {
  fetchTdbDividends,
  fetchTdbYear,
  usable,
  TDB_FIRST_YEAR,
  type TdbDividend,
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
const META_KEY = "tdbSync";
/** Annual figures; a week between refreshes is already generous. */
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

interface TdbDividendDoc {
  companyCode: number;
  history: TdbDividend[];
  fetchedAt: Date;
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
  for (const companyCode of companies) {
    const summary = await fetchTdbDividends(companyCode, thisYear).catch(() => null);
    if (!summary) continue;
    await db.collection<TdbDividendDoc>(DIVIDENDS).updateOne(
      { companyCode },
      { $set: { companyCode, history: summary.history, fetchedAt: new Date() } },
      { upsert: true },
    );
    dividends++;
  }

  await db
    .collection<SyncMeta>("marketSnapshots")
    .updateOne(
      { key: META_KEY },
      { $set: { key: META_KEY, syncedAt: new Date() } },
      { upsert: true },
    );

  return { years, rows, dividends };
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
