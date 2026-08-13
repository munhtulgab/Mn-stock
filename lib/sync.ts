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
 * How much of a run's price budget the catch-up list may take.
 *
 * The catch-up is the more urgent half — those are the companies that
 * actually traded today — so it goes first and gets the larger share. What
 * it must not have is all of it, or a company it can never satisfy leaves
 * the rotation with nothing.
 */
const CATCH_UP_SHARE = 0.4;

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
): Promise<BehindCompany[]> {
  let live: Map<number, LiveQuote>;
  try {
    live = await fetchLiveQuotes({ budgetMs: 9_000 });
  } catch (err) {
    console.error("live quotes unavailable for the catch-up list", err);
    return [];
  }
  if (live.size === 0) return [];

  const latest = await db
    .collection<PricePoint>("prices")
    .aggregate<{ _id: number; date: string }>([
      { $group: { _id: "$companyCode", date: { $max: "$date" } } },
    ])
    .toArray();
  const storedLatest = new Map(latest.map((r) => [r._id, r.date]));

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
  const behind = await companiesBehindTheSession(db, active);
  if (behind.length > 0) {
    console.log(`runSyncBatch: ${behind.length} behind the latest session`);
  }

  const state = await getSyncState(db);
  const pricesProcessed: string[] = [];
  const financialsProcessed: string[] = [];
  let fullPricePassCompleted = false;
  let fullFinancialsPassCompleted = false;

  // Split the time budget so financials always gets a turn — otherwise a
  // slow-to-complete price pass (large per-company payloads) can starve it
  // indefinitely across repeated calls.
  const priceDeadline = start + maxMs * 0.6;
  const financialsDeadline = start + maxMs;


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
  const catchUpDeadline = start + maxMs * CATCH_UP_SHARE;

  for (const company of behind) {
    if (Date.now() >= catchUpDeadline) break;
    if (!needsCatchUp(company, caughtUpFor)) continue;
    try {
      await syncPricesForCompany(db, company.companyCode);
      pricesProcessed.push(company.symbol);
      caughtUpFor[company.companyCode] = company.quotedDate;
    } catch (err) {
      console.error(`price sync failed for ${company.symbol}`, err);
    }
  }
  const caughtUp = new Set(pricesProcessed);

  let priceCursor = state.priceCursor % Math.max(active.length, 1);
  const priceStart = priceCursor;
  let firstPriceIteration = true;
  while (
    active.length > 0 &&
    Date.now() < priceDeadline &&
    (firstPriceIteration || priceCursor !== priceStart)
  ) {
    firstPriceIteration = false;
    const company = active[priceCursor];
    if (!company) break;
    if (!caughtUp.has(company.symbol)) {
      try {
        await syncPricesForCompany(db, company.companyCode);
        pricesProcessed.push(company.symbol);
      } catch (err) {
        console.error(`price sync failed for ${company.symbol}`, err);
      }
    }
    priceCursor = (priceCursor + 1) % active.length;
    if (priceCursor === priceStart) {
      fullPricePassCompleted = true;
      break;
    }
  }

  let financialsCursor = state.financialsCursor % Math.max(active.length, 1);
  const finStart = financialsCursor;
  let firstFinIteration = true;
  while (
    active.length > 0 &&
    Date.now() < financialsDeadline &&
    (firstFinIteration || financialsCursor !== finStart)
  ) {
    firstFinIteration = false;
    const company = active[financialsCursor];
    if (!company) break;
    try {
      await syncFinancialsForCompany(db, company.companyCode);
      financialsProcessed.push(company.symbol);
    } catch (err) {
      console.error(`financials sync failed for ${company.symbol}`, err);
    }
    financialsCursor = (financialsCursor + 1) % active.length;
    if (financialsCursor === finStart) {
      fullFinancialsPassCompleted = true;
      break;
    }
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

export const __testing = { needsCatchUp, prune, CATCH_UP_SHARE };
