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
async function companiesBehindTheSession(
  db: Db,
  active: { companyCode: number; symbol: string }[],
): Promise<{ companyCode: number; symbol: string }[]> {
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

  return active.filter((company) => {
    const quoted = live.get(company.companyCode)?.at?.slice(0, 10);
    if (!quoted) return false;
    const stored = storedLatest.get(company.companyCode);
    return !stored || stored < quoted;
  });
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
        `runSyncBatch: TDB ${result.rows} company-years across ${result.years} years, ${result.dividends} dividend histories`,
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
  for (const company of behind) {
    if (Date.now() >= priceDeadline) break;
    try {
      await syncPricesForCompany(db, company.companyCode);
      pricesProcessed.push(company.symbol);
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
