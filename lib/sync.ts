import type { Db } from "mongodb";
import { fetchSecuritiesList } from "@/lib/mse/securities";
import { fetchPriceHistory } from "@/lib/mse/prices";
import { fetchLatestFinancials } from "@/lib/mse/financials";

export interface SyncState {
  key: "main";
  priceCursor: number;
  financialsCursor: number;
  lastSecuritiesSyncAt?: Date;
  lastFullPriceSyncCompletedAt?: Date;
  lastFullFinancialsSyncCompletedAt?: Date;
}

export async function syncSecuritiesList(db: Db): Promise<number> {
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

export async function syncPricesForCompany(
  db: Db,
  companyCode: number,
): Promise<number> {
  const points = await fetchPriceHistory(companyCode);
  if (points.length === 0) return 0;
  const CHUNK = 500;
  for (let i = 0; i < points.length; i += CHUNK) {
    const chunk = points.slice(i, i + CHUNK);
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
  return points.length;
}

export async function syncFinancialsForCompany(
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
    try {
      await syncPricesForCompany(db, company.companyCode);
      pricesProcessed.push(company.symbol);
    } catch (err) {
      console.error(`price sync failed for ${company.symbol}`, err);
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
