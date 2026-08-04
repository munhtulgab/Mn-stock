import type { Db } from "mongodb";
import type {
  Holding,
  Portfolio,
  Security,
  PricePoint,
  Transaction,
  WatchlistItem,
} from "@/lib/types";
import { STARTING_CASH_BALANCE } from "@/lib/types";

export class PortfolioError extends Error {}

export interface HoldingView {
  companyCode: number;
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number | null;
  marketValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPct: number | null;
}

export interface PortfolioSummary {
  cashBalance: number;
  holdings: HoldingView[];
  holdingsValue: number;
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPct: number | null;
  todayGain: number;
  todayGainPct: number | null;
}

async function getOrCreatePortfolio(db: Db, userId: string): Promise<Portfolio> {
  const existing = await db.collection<Portfolio>("portfolios").findOne({ userId });
  if (existing) return existing;
  const created: Portfolio = {
    userId,
    cashBalance: STARTING_CASH_BALANCE,
    updatedAt: new Date(),
  };
  await db.collection<Portfolio>("portfolios").insertOne(created as never);
  return created;
}

async function getLatestTwoPrices(
  db: Db,
  companyCode: number,
): Promise<{ last: PricePoint | null; prev: PricePoint | null }> {
  const rows = await db
    .collection<PricePoint>("prices")
    .find({ companyCode })
    .sort({ date: -1 })
    .limit(2)
    .toArray();
  return { last: rows[0] ?? null, prev: rows[1] ?? null };
}

/**
 * Latest two closes for many companies in one round trip. Holdings and
 * watchlists both need this, and querying per row turned a portfolio of N
 * positions into N sequential Atlas queries.
 */
async function getLatestTwoPricesForMany(
  db: Db,
  companyCodes: number[],
): Promise<Map<number, { last: PricePoint | null; prev: PricePoint | null }>> {
  const result = new Map<
    number,
    { last: PricePoint | null; prev: PricePoint | null }
  >();
  if (companyCodes.length === 0) return result;

  const groups = await db
    .collection<PricePoint>("prices")
    .aggregate<{ _id: number; prices: PricePoint[] }>([
      { $match: { companyCode: { $in: companyCodes } } },
      {
        $group: {
          _id: "$companyCode",
          prices: {
            $topN: {
              n: 2,
              sortBy: { date: -1 },
              output: {
                companyCode: "$companyCode",
                date: "$date",
                close: "$close",
                volume: "$volume",
                previousClose: "$previousClose",
              },
            },
          },
        },
      },
    ])
    .toArray();

  for (const g of groups) {
    result.set(g._id, { last: g.prices[0] ?? null, prev: g.prices[1] ?? null });
  }
  for (const code of companyCodes) {
    if (!result.has(code)) result.set(code, { last: null, prev: null });
  }
  return result;
}

export async function getPortfolioSummary(
  db: Db,
  userId: string,
): Promise<PortfolioSummary> {
  const [portfolio, holdingDocs] = await Promise.all([
    getOrCreatePortfolio(db, userId),
    db
      .collection<Holding>("holdings")
      .find({ userId, quantity: { $gt: 0 } })
      .toArray(),
  ]);

  const companyCodes = holdingDocs.map((h) => h.companyCode);
  const [securities, pricesByCode] = await Promise.all([
    db
      .collection<Security>("securities")
      .find({ companyCode: { $in: companyCodes } })
      .toArray(),
    getLatestTwoPricesForMany(db, companyCodes),
  ]);
  const securityByCode = new Map(securities.map((s) => [s.companyCode, s]));

  let holdingsValue = 0;
  let totalCostBasis = 0;
  let todayGain = 0;

  const holdings: HoldingView[] = holdingDocs.map((h) => {
    const { last, prev } = pricesByCode.get(h.companyCode) ?? {
      last: null,
      prev: null,
    };
    const currentPrice = last?.close ?? null;
    const marketValue = (currentPrice ?? h.avgCost) * h.quantity;
    const costBasis = h.avgCost * h.quantity;
    const gainLoss = marketValue - costBasis;
    holdingsValue += marketValue;
    totalCostBasis += costBasis;
    if (currentPrice !== null && prev) {
      todayGain += (currentPrice - prev.close) * h.quantity;
    }
    return {
      companyCode: h.companyCode,
      symbol: h.symbol,
      name: securityByCode.get(h.companyCode)?.name ?? h.symbol,
      quantity: h.quantity,
      avgCost: h.avgCost,
      currentPrice,
      marketValue,
      costBasis,
      gainLoss,
      gainLossPct: costBasis > 0 ? (gainLoss / costBasis) * 100 : null,
    };
  });

  const totalValue = portfolio.cashBalance + holdingsValue;
  const totalGainLoss = holdingsValue - totalCostBasis;

  return {
    cashBalance: portfolio.cashBalance,
    holdings: holdings.sort((a, b) => b.marketValue - a.marketValue),
    holdingsValue,
    totalValue,
    totalCostBasis,
    totalGainLoss,
    totalGainLossPct: totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : null,
    todayGain,
    todayGainPct: totalValue > todayGain ? (todayGain / (totalValue - todayGain)) * 100 : null,
  };
}

async function resolveSecurity(db: Db, symbol: string): Promise<Security> {
  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) throw new PortfolioError("Тухайн компани олдсонгүй");
  return security;
}

async function getCurrentPrice(db: Db, companyCode: number): Promise<number> {
  const { last } = await getLatestTwoPrices(db, companyCode);
  if (!last) throw new PortfolioError("Ханшийн мэдээлэл олдсонгүй");
  return last.close;
}

export async function buyStock(
  db: Db,
  userId: string,
  symbol: string,
  quantity: number,
): Promise<PortfolioSummary> {
  // Whole shares only. The form's min={1} is advisory — a hand-rolled request
  // could otherwise buy 0.5 of a share and leave a fractional holding that no
  // amount of selling clears evenly.
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new PortfolioError("Тоо ширхэг бүхэл, эерэг тоо байх ёстой");
  }
  const security = await resolveSecurity(db, symbol);
  const price = await getCurrentPrice(db, security.companyCode);
  const total = price * quantity;

  const portfolio = await getOrCreatePortfolio(db, userId);
  if (portfolio.cashBalance < total) {
    throw new PortfolioError("Үлдэгдэл хүрэлцэхгүй байна");
  }

  const existing = await db
    .collection<Holding>("holdings")
    .findOne({ userId, companyCode: security.companyCode });

  const newQuantity = (existing?.quantity ?? 0) + quantity;
  const newAvgCost = existing
    ? (existing.avgCost * existing.quantity + total) / newQuantity
    : price;

  await db.collection<Holding>("holdings").updateOne(
    { userId, companyCode: security.companyCode },
    {
      $set: {
        userId,
        companyCode: security.companyCode,
        symbol: security.symbol,
        quantity: newQuantity,
        avgCost: newAvgCost,
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  );

  await db.collection<Portfolio>("portfolios").updateOne(
    { userId },
    { $set: { cashBalance: portfolio.cashBalance - total, updatedAt: new Date() } },
    { upsert: true },
  );

  const transaction: Transaction = {
    userId,
    companyCode: security.companyCode,
    symbol: security.symbol,
    side: "BUY",
    quantity,
    price,
    total,
    createdAt: new Date(),
  };
  await db.collection<Transaction>("transactions").insertOne(transaction as never);

  return getPortfolioSummary(db, userId);
}

export async function sellStock(
  db: Db,
  userId: string,
  symbol: string,
  quantity: number,
): Promise<PortfolioSummary> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new PortfolioError("Тоо ширхэг бүхэл, эерэг тоо байх ёстой");
  }
  const security = await resolveSecurity(db, symbol);
  const existing = await db
    .collection<Holding>("holdings")
    .findOne({ userId, companyCode: security.companyCode });

  if (!existing || existing.quantity < quantity) {
    throw new PortfolioError("Танд хангалттай хувьцаа алга");
  }

  const price = await getCurrentPrice(db, security.companyCode);
  const total = price * quantity;
  const remaining = existing.quantity - quantity;

  if (remaining > 0) {
    await db.collection<Holding>("holdings").updateOne(
      { userId, companyCode: security.companyCode },
      { $set: { quantity: remaining, updatedAt: new Date() } },
    );
  } else {
    await db
      .collection<Holding>("holdings")
      .deleteOne({ userId, companyCode: security.companyCode });
  }

  const portfolio = await getOrCreatePortfolio(db, userId);
  await db.collection<Portfolio>("portfolios").updateOne(
    { userId },
    { $set: { cashBalance: portfolio.cashBalance + total, updatedAt: new Date() } },
    { upsert: true },
  );

  const transaction: Transaction = {
    userId,
    companyCode: security.companyCode,
    symbol: security.symbol,
    side: "SELL",
    quantity,
    price,
    total,
    createdAt: new Date(),
  };
  await db.collection<Transaction>("transactions").insertOne(transaction as never);

  return getPortfolioSummary(db, userId);
}

export async function getTransactions(db: Db, userId: string): Promise<Transaction[]> {
  return db
    .collection<Transaction>("transactions")
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
}

export async function getWatchlist(
  db: Db,
  userId: string,
): Promise<(WatchlistItem & { name: string; currentPrice: number | null; changePct: number | null })[]> {
  const items = await db
    .collection<WatchlistItem>("watchlist")
    .find({ userId })
    .sort({ addedAt: -1 })
    .toArray();

  const companyCodes = items.map((i) => i.companyCode);
  const [securities, pricesByCode] = await Promise.all([
    db
      .collection<Security>("securities")
      .find({ companyCode: { $in: companyCodes } })
      .toArray(),
    getLatestTwoPricesForMany(db, companyCodes),
  ]);
  const securityByCode = new Map(securities.map((s) => [s.companyCode, s]));

  return items.map((item) => {
    const { last, prev } = pricesByCode.get(item.companyCode) ?? {
      last: null,
      prev: null,
    };
    const changePct =
      last && prev && prev.close > 0
        ? ((last.close - prev.close) / prev.close) * 100
        : null;
    return {
      ...item,
      name: securityByCode.get(item.companyCode)?.name ?? item.symbol,
      currentPrice: last?.close ?? null,
      changePct,
    };
  });
}

export async function addToWatchlist(db: Db, userId: string, symbol: string): Promise<void> {
  const security = await resolveSecurity(db, symbol);
  const item: WatchlistItem = {
    userId,
    companyCode: security.companyCode,
    symbol: security.symbol,
    addedAt: new Date(),
  };
  await db.collection<WatchlistItem>("watchlist").updateOne(
    { userId, companyCode: security.companyCode },
    { $setOnInsert: item },
    { upsert: true },
  );
}

export async function removeFromWatchlist(
  db: Db,
  userId: string,
  symbol: string,
): Promise<void> {
  const security = await resolveSecurity(db, symbol);
  await db
    .collection<WatchlistItem>("watchlist")
    .deleteOne({ userId, companyCode: security.companyCode });
}
