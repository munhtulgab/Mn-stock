import type { Db } from "mongodb";
import { fetchSecuritiesList } from "@/lib/mse/securities";
import { fetchPriceHistory } from "@/lib/mse/prices";
import { fetchLatestFinancials } from "@/lib/mse/financials";
import { fetchLiveQuotes, type LiveQuote } from "@/lib/marketinfo/quotes";
import { syncTdb, tdbIsStale } from "@/lib/tdb/store";
import { ulaanbaatarDay } from "@/lib/day";
import type { PricePoint } from "@/lib/types";

export interface SyncState {
  key: "main";
  priceCursor: number;
  financialsCursor: number;
  /**
   * The session each company was last caught up for, keyed by company code.
   *
   * A company is "behind" when the live feed quotes it for a day the stored
   * history does not reach, and the fix is to re-read its history. Sometimes
   * that does not help: the exchange publishes a session to its open-data
   * portal only once it has closed, and for the thin end of the market it
   * can be later still or not at all. Those companies stay behind, and
   * without this they were re-read on every run for the same session
   * forever — four of them were taking the entire price budget, so the
   * rotation below never ran and its cursor sat on 83 of 162 indefinitely.
   *
   * Recording the session attempted rather than the attempt means a retry
   * happens exactly when there is something new to retry for.
   */
  caughtUpFor?: Record<string, string>;
  lastSecuritiesSyncAt?: Date;
  lastFullPriceSyncCompletedAt?: Date;
  lastFullFinancialsSyncCompletedAt?: Date;
}

async function syncSecuritiesList(db: Db): Promise<number> {
  const list = await fetchSecuritiesList();
  const ops = list.map((s) => ({
    updateOne: {
      filter: { companyCode: s.companyCode },
      update: {
        $set: { ...s, updatedAt: new Date() },
      },
      upsert: true,
    },
  }));
  if (ops.length > 0) {
    await db.collection("securities").bulkWrite(ops, { ordered: false });
  }
  await db
    .collection("syncState")
    .updateOne(
      { key: "main" },
      { $set: { lastSecuritiesSyncAt: new Date() } },
      { upsert: true },
    );
  return ops.length;
}

/**
 * The exchange serves a company's whole history in one blob, and almost all
 * of it is the same as last time. Only what is new or has actually changed is
 * written: re-upserting three thousand unchanged rows on every visit to a
 * company's page was most of the time that page took.
 */
export async function syncPricesForCompany(
  db: Db,
  companyCode: number,
): Promise<number> {
  const points = await fetchPriceHistory(companyCode);
  if (points.length === 0) return 0;

  const stored = await db
    .collection<PricePoint>("prices")
    .find({ companyCode }, { projection: { _id: 0, date: 1, close: 1, volume: 1 } })
    .toArray();
  const known = new Map(stored.map((p) => [p.date, p]));

  const changed = points.filter((p) => {
    const before = known.get(p.date);
    return !before || before.close !== p.close || before.volume !== p.volume;
  });
  if (changed.length === 0) return 0;

  const CHUNK = 500;
  for (let i = 0; i < changed.length; i += CHUNK) {
    const chunk = changed.slice(i, i + CHUNK);
    await db.collection("prices").bulkWrite(
      chunk.map((p) => ({
        updateOne: {
          filter: { companyCode: p.companyCode, date: p.date },
          update: { $set: p },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  return changed.length;
}

async function syncFinancialsForCompany(
  db: Db,
  companyCode: number,
): Promise<boolean> {
  const financials = await fetchLatestFinancials(companyCode);
  if (!financials) return false;
  await db.collection("financials").updateOne(
    { companyCode, period: financials.period },
    { $set: { ...financials, fetchedAt: new Date() } },
    { upsert: true },
  );
  return true;
}

/**
 * How a run's time is divided, as fractions of what is left when the price
 * work begins — not of the whole run. The securities directory and, once a
 * week, the Datalab pull come first and are not free: measured from the
 * start of the run, a slow preamble was taking the price phase's budget with
 * it, and one run managed seven companies because of it.
 *
 * The order is the order of urgency. The catch-up list is what the live feed
 * says printed today; it goes first but must not have all of it, or a company
 * it can never satisfy leaves everything behind it with nothing. Then the
 * companies that traded most recently, which is the same question asked of
 * the store instead of the feed, and the phase that actually keeps up with
 * the exchange — so it gets the largest share by far. Then the rotation over
 * everything else. Financials last and smallest: it is annual data, and it
 * used to hold two fifths of every run for figures that change four times a
 * year.
 */
const CATCH_UP_SHARE = 0.2;
const RECENT_SHARE = 0.6;
const PRICE_SHARE = 0.8;

/**
 * How many histories are read from the exchange at once.
 *
 * One at a time was costing the sync its whole reason for existing. A single
 * `tradeinfo` page takes between two and three seconds to come back, so a
 * twenty-seven second price budget bought seven companies — and the exchange
 * publishes a close for around fifty on a normal day. The run could not
 * finish a session even in principle, which is why the store sat a day or
 * more behind the market.
 *
 * Six at a time, measured against the exchange: the same six companies took
 * 23.8 seconds one after another and 3.2 seconds together. That turns seven
 * companies a run into roughly fifty, which is a session. Six rather than
 * twenty because this is a small exchange's own website and the point is to
 * keep up with it, not to hammer it.
 */
const FETCH_CONCURRENCY = 6;

/**
 * How many of the most recently traded companies are refreshed every run,
 * ahead of the rotation. A normal MSE session prints for about fifty
 * securities; this is that with room to spare.
 */
const RECENTLY_TRADED = 80;

/**
 * Runs `work` over `items`, a few in flight at once, stopping at `deadline`.
 *
 * Returns how many items were started, which is what the caller advances its
 * rotation cursor by: everything before that point has had its turn, whether
 * it succeeded, failed or was skipped.
 */
async function inParallel<T>(
  items: readonly T[],
  concurrency: number,
  deadline: number,
  work: (item: T) => Promise<void>,
): Promise<number> {
  let next = 0;
  const worker = async () => {
    for (;;) {
      if (Date.now() >= deadline) return;
      const index = next++;
      if (index >= items.length) return;
      await work(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return Math.min(next, items.length);
}

/** The newest session stored for each company, in one pass over the prices. */
async function lastTradedByCompany(db: Db): Promise<Map<number, string>> {
  const rows = await db
    .collection<PricePoint>("prices")
    .aggregate<{ _id: number; date: string }>([
      { $group: { _id: "$companyCode", date: { $max: "$date" } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id, r.date]));
}

/**
 * The companies most likely to have a new close waiting: the ones that traded
 * most recently.
 *
 * The rotation below walks the whole exchange in company-code order, which
 * spends most of a run on securities that have not printed in months while
 * the fifty that trade every day wait their turn behind them. Those fifty are
 * the ones a reader is looking at, and they are also the ones that go stale
 * fastest. Sorting by when each last traded puts them at the front — and it
 * needs no live feed to work out, which is the point: the sync runs ten
 * minutes after the close, by which time the feed has emptied for the day.
 */
function recentlyTraded(
  active: { companyCode: number; symbol: string }[],
  lastTraded: Map<number, string>,
  limit: number,
): { companyCode: number; symbol: string }[] {
  return active
    .filter((c) => lastTraded.has(c.companyCode))
    .sort((a, b) =>
      lastTraded.get(b.companyCode)!.localeCompare(lastTraded.get(a.companyCode)!),
    )
    .slice(0, limit);
}

/**
 * Whether re-reading this company's history could tell us anything new.
 *
 * It could not if it was already read for the session it is behind on: the
 * exchange had not published that day then and will not have published it
 * since, so the same request returns the same history. A different session —
 * the next day's trade — is a new reason to ask.
 */
function needsCatchUp(
  company: BehindCompany,
  caughtUpFor: Record<string, string>,
): boolean {
  return caughtUpFor[company.companyCode] !== company.quotedDate;
}

/** The catch-up record, less any company no longer on the active list. */
function prune(
  record: Record<string, string>,
  active: { companyCode: number }[],
): Record<string, string> {
  const listed = new Set(active.map((c) => String(c.companyCode)));
  return Object.fromEntries(
    Object.entries(record).filter(([code]) => listed.has(code)),
  );
}

async function getSyncState(db: Db): Promise<SyncState> {
  const state = await db
    .collection<SyncState>("syncState")
    .findOne({ key: "main" });
  // syncSecuritiesList upserts this same doc with only a subset of fields
  // set, so coalesce per-field (and guard against a stray NaN ever having
  // been persisted) rather than falling back to defaults only when the
  // whole document is missing.
  return {
    key: "main",
    priceCursor: Number.isFinite(state?.priceCursor) ? state!.priceCursor : 0,
    financialsCursor: Number.isFinite(state?.financialsCursor)
      ? state!.financialsCursor
      : 0,
    caughtUpFor:
      state?.caughtUpFor && typeof state.caughtUpFor === "object"
        ? state.caughtUpFor
        : {},
    lastSecuritiesSyncAt: state?.lastSecuritiesSyncAt,
    lastFullPriceSyncCompletedAt: state?.lastFullPriceSyncCompletedAt,
    lastFullFinancialsSyncCompletedAt: state?.lastFullFinancialsSyncCompletedAt,
  };
}

/**
 * Companies whose stored history stops before the price the live feed is
 * already quoting for them. Both sides are read in one go — a per-company
 * query for four hundred companies would cost more than the sync it is meant
 * to save.
 */
interface BehindCompany {
  companyCode: number;
  symbol: string;
  /** The session the live feed quotes it for, which the store has not got. */
  quotedDate: string;
}

async function companiesBehindTheSession(
  db: Db,
  active: { companyCode: number; symbol: string }[],
  storedLatest: Map<number, string>,
): Promise<BehindCompany[]> {
  let live: Map<number, LiveQuote>;
  try {
    live = await fetchLiveQuotes({ budgetMs: 9_000 });
  } catch (err) {
    console.error("live quotes unavailable for the catch-up list", err);
    return [];
  }
  if (live.size === 0) return [];

  const behind: BehindCompany[] = [];
  for (const company of active) {
    const quotedDate = live.get(company.companyCode)?.at?.slice(0, 10);
    if (!quotedDate) continue;
    const stored = storedLatest.get(company.companyCode);
    if (!stored || stored < quotedDate) {
      behind.push({ ...company, quotedDate });
    }
  }
  return behind;
}

export interface SyncBatchResult {
  securitiesRefreshed: boolean;
  pricesProcessed: string[];
  financialsProcessed: string[];
  priceCursorAfter: number;
  financialsCursorAfter: number;
  fullPricePassCompleted: boolean;
  fullFinancialsPassCompleted: boolean;
  tookMs: number;
}

/**
 * Time-boxed sync batch, safe to run inside a serverless function with a
 * duration limit. Always refreshes the securities directory (cheap), then
 * walks through active securities from where it left off last time,
 * fetching price history and financials until the time budget runs out.
 */
export async function runSyncBatch(
  db: Db,
  opts: { maxMs?: number } = {},
): Promise<SyncBatchResult> {
  const start = Date.now();
  const maxMs = opts.maxMs ?? 45_000;

  let securitiesRefreshed = false;
  try {
    await syncSecuritiesList(db);
    securitiesRefreshed = true;
  } catch (err) {
    console.error("securities sync failed", err);
  }

  // Datalab's closed financial years, at most once a week. It is annual
  // data — the industry each company is in, the liquidity ratios MSE does
  // not publish, the dividend histories — so it does not belong in the
  // per-company cursor below, and a failure here must not cost the run its
  // prices.
  try {
    if (await tdbIsStale(db)) {
      const result = await syncTdb(db, ulaanbaatarDay(new Date()));
      console.log(
        `runSyncBatch: TDB ${result.rows} company-years across ${result.years} years, ` +
          `${result.dividends} dividend histories, ${result.profiles} profiles`,
      );
    }
  } catch (err) {
    console.error("TDB Datalab sync failed", err);
  }

  const active = await db
    .collection("securities")
    .find({ status: "active" })
    .project<{ companyCode: number; symbol: string }>({
      companyCode: 1,
      symbol: 1,
    })
    .sort({ companyCode: 1 })
    .toArray();
  console.log(`runSyncBatch: ${active.length} active securities found`);

  // Which companies are actually behind. The exchange publishes a close for
  // the fifty-odd securities that traded on a given day, not for all four
  // hundred, so walking the whole list in company-code order spends most of
  // a run re-reading histories that have not moved — and takes weeks to come
  // back round to a company that trades every day. The live feed names the
  // ones that have a new price; those go first.
  const lastTraded = await lastTradedByCompany(db);
  const behind = await companiesBehindTheSession(db, active, lastTraded);
  if (behind.length > 0) {
    console.log(`runSyncBatch: ${behind.length} behind the latest session`);
  }

  const state = await getSyncState(db);
  const pricesProcessed: string[] = [];
  const financialsProcessed: string[] = [];
  let fullPricePassCompleted = false;
  let fullFinancialsPassCompleted = false;


  // The catch-up list first, then the rotation picks up where it left off
  // and keeps the dormant end of the exchange from going stale forever.
  //
  // The catch-up gets a share of the price budget rather than all of it. It
  // used to run to the full deadline, and where it could not empty itself
  // there was nothing left: four companies the exchange had not published a
  // session for took the whole twelve seconds every run, the rotation below
  // never executed, and its cursor stayed on 83 of 162 across every run
  // measured. A list that cannot be finished must not be able to starve the
  // one that can.
  const caughtUpFor = { ...(state.caughtUpFor ?? {}) };
  // Measured from here, so the directory and the Datalab pull above are spent
  // out of the run rather than out of the prices.
  const pricesFrom = Date.now();
  const left = Math.max(0, start + maxMs - pricesFrom);
  const catchUpDeadline = pricesFrom + left * CATCH_UP_SHARE;
  const recentDeadline = pricesFrom + left * RECENT_SHARE;
  const priceDeadline = pricesFrom + left * PRICE_SHARE;
  const financialsDeadline = start + maxMs;

  const readPrices = async (company: { companyCode: number; symbol: string }) => {
    try {
      await syncPricesForCompany(db, company.companyCode);
      pricesProcessed.push(company.symbol);
    } catch (err) {
      console.error(`price sync failed for ${company.symbol}`, err);
    }
  };

  // First, the companies the live feed says have printed a price the store
  // has not got. Only available while the market is open — see below.
  await inParallel(
    behind.filter((company) => needsCatchUp(company, caughtUpFor)),
    FETCH_CONCURRENCY,
    catchUpDeadline,
    async (company) => {
      await readPrices(company);
      caughtUpFor[company.companyCode] = company.quotedDate;
    },
  );

  // Then the companies that traded most recently, which is the same question
  // answered without the feed. This is the phase that keeps the store level
  // with the exchange: the sync runs ten minutes after the close, by which
  // time the live feed has emptied for the day and the catch-up above finds
  // nothing at all, so before this existed a session's closes reached the
  // store only when the rotation happened to come round to each company —
  // weeks, for four hundred securities read one at a time.
  const done = new Set(pricesProcessed);
  await inParallel(
    recentlyTraded(active, lastTraded, RECENTLY_TRADED).filter(
      (company) => !done.has(company.symbol),
    ),
    FETCH_CONCURRENCY,
    recentDeadline,
    readPrices,
  );

  // And last the rotation, so the dormant end of the exchange is not left
  // unread forever. It keeps its own cursor and its own order — company code
  // — because its job is coverage rather than currency.
  const caughtUp = new Set(pricesProcessed);
  let priceCursor = state.priceCursor % Math.max(active.length, 1);
  const inTurn = Array.from(
    { length: active.length },
    (_, i) => active[(priceCursor + i) % active.length],
  );
  const attempted = await inParallel(
    inTurn,
    FETCH_CONCURRENCY,
    priceDeadline,
    async (company) => {
      if (caughtUp.has(company.symbol)) return;
      await readPrices(company);
    },
  );
  if (active.length > 0) {
    priceCursor = (priceCursor + attempted) % active.length;
    fullPricePassCompleted = attempted >= active.length;
  }

  let financialsCursor = state.financialsCursor % Math.max(active.length, 1);
  const finInTurn = Array.from(
    { length: active.length },
    (_, i) => active[(financialsCursor + i) % active.length],
  );
  const finAttempted = await inParallel(
    finInTurn,
    FETCH_CONCURRENCY,
    financialsDeadline,
    async (company) => {
      try {
        await syncFinancialsForCompany(db, company.companyCode);
        financialsProcessed.push(company.symbol);
      } catch (err) {
        console.error(`financials sync failed for ${company.symbol}`, err);
      }
    },
  );
  if (active.length > 0) {
    financialsCursor = (financialsCursor + finAttempted) % active.length;
    fullFinancialsPassCompleted = finAttempted >= active.length;
  }

  const update: Partial<SyncState> = {
    priceCursor,
    financialsCursor,
    // Pruned to the companies still listed, so a delisting does not leave a
    // record behind for a code that will never be quoted again.
    caughtUpFor: prune(caughtUpFor, active),
  };
  if (fullPricePassCompleted) update.lastFullPriceSyncCompletedAt = new Date();
  if (fullFinancialsPassCompleted)
    update.lastFullFinancialsSyncCompletedAt = new Date();

  await db
    .collection("syncState")
    .updateOne({ key: "main" }, { $set: update }, { upsert: true });

  return {
    securitiesRefreshed,
    pricesProcessed,
    financialsProcessed,
    priceCursorAfter: priceCursor,
    financialsCursorAfter: financialsCursor,
    fullPricePassCompleted,
    fullFinancialsPassCompleted,
    tookMs: Date.now() - start,
  };
}

export const __testing = {
  needsCatchUp,
  prune,
  CATCH_UP_SHARE,
  RECENT_SHARE,
  PRICE_SHARE,
  FETCH_CONCURRENCY,
  inParallel,
  recentlyTraded,
};
