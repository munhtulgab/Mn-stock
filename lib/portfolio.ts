import type { Db } from "mongodb";
import type {
  Holding,
  OrderSide,
  Portfolio,
  Security,
  PricePoint,
  Transaction,
  WatchlistItem,
} from "@/lib/types";
import { STARTING_CASH_BALANCE } from "@/lib/types";
import { fetchLiveQuotes } from "@/lib/marketinfo/quotes";
import { priorClose } from "@/lib/priceChange";

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

/**
 * The user's portfolio, opened with its starting balance the first time.
 * Done as one upsert rather than a read followed by an insert: two requests
 * arriving together would both find nothing, and the unique index on userId
 * would then fail the second one outright.
 */
async function getOrCreatePortfolio(db: Db, userId: string): Promise<Portfolio> {
  const portfolio = await db
    .collection<Portfolio>("portfolios")
    .findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          cashBalance: STARTING_CASH_BALANCE,
          updatedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  return portfolio as Portfolio;
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

/**
 * Running prices for the securities held, keyed by company code.
 *
 * Valuing a portfolio at yesterday's close while every list on screen shows
 * the running price would have the same holding worth two different amounts
 * depending on which page you were looking at.
 */
async function livePricesFor(
  companyCodes: number[],
): Promise<Map<number, number>> {
  if (companyCodes.length === 0) return new Map();
  try {
    const quotes = await fetchLiveQuotes();
    const prices = new Map<number, number>();
    for (const code of companyCodes) {
      const price = quotes.get(code)?.price;
      if (price != null) prices.set(code, price);
    }
    return prices;
  } catch {
    return new Map();
  }
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
  const [securities, pricesByCode, livePrices] = await Promise.all([
    db
      .collection<Security>("securities")
      .find({ companyCode: { $in: companyCodes } })
      .toArray(),
    getLatestTwoPricesForMany(db, companyCodes),
    livePricesFor(companyCodes),
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
    const currentPrice = livePrices.get(h.companyCode) ?? last?.close ?? null;
    const marketValue = (currentPrice ?? h.avgCost) * h.quantity;
    const costBasis = h.avgCost * h.quantity;
    const gainLoss = marketValue - costBasis;
    holdingsValue += marketValue;
    totalCostBasis += costBasis;
    // Against the previous session's close, so "today" means today whether
    // the price is a running one or the last published close.
    const base = livePrices.has(h.companyCode)
      ? (last?.close ?? null)
      : priorClose(last, prev);
    if (currentPrice !== null && base !== null) {
      todayGain += (currentPrice - base) * h.quantity;
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

/**
 * The price an order fills at. Uses the running price when the exchange is
 * quoting one, so a trade executes at the figure the screen was showing.
 */
/**
 * What an order of this side would actually fill at.
 *
 * A market buy takes the lowest price anyone is offering to sell at, and a
 * market sell hits the highest price anyone is bidding — that is what the
 * order book is. Falling back to the last price treats both sides as if
 * they traded at the mid, which is not what the exchange would have done.
 */
async function getFillPrice(
  db: Db,
  companyCode: number,
  side: OrderSide,
): Promise<number> {
  try {
    const quote = (await fetchLiveQuotes()).get(companyCode);
    const book = side === "BUY" ? quote?.ask : quote?.bid;
    if (book != null && book > 0) return book;
    if (quote?.price != null && quote.price > 0) return quote.price;
  } catch {
    // The stored close stands in below.
  }
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
  const price = await getFillPrice(db, security.companyCode, "BUY");
  const total = price * quantity;

  await getOrCreatePortfolio(db, userId);

  // Checked and deducted in one step. Reading the balance, comparing it and
  // writing back the difference lets two orders that arrive together both
  // pass the check and the second overwrite the first — and a double-tap on
  // a phone sends exactly that. The balance condition is part of the update,
  // so the second order finds nothing to match and is refused.
  const paid = await db.collection<Portfolio>("portfolios").updateOne(
    { userId, cashBalance: { $gte: total } },
    { $inc: { cashBalance: -total }, $set: { updatedAt: new Date() } },
  );
  if (paid.matchedCount === 0) {
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
  const price = await getFillPrice(db, security.companyCode, "SELL");
  const total = price * quantity;

  // Same reasoning as the purchase: the holding is checked and reduced in one
  // step, so two sells arriving together cannot both pass on the same shares.
  const sold = await db.collection<Holding>("holdings").findOneAndUpdate(
    { userId, companyCode: security.companyCode, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!sold) {
    throw new PortfolioError("Танд хангалттай хувьцаа алга");
  }
  if (sold.quantity === 0) {
    await db
      .collection<Holding>("holdings")
      .deleteOne({ userId, companyCode: security.companyCode, quantity: 0 });
  }

  await getOrCreatePortfolio(db, userId);
  await db
    .collection<Portfolio>("portfolios")
    .updateOne(
      { userId },
      { $inc: { cashBalance: total }, $set: { updatedAt: new Date() } },
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
  const [securities, pricesByCode, livePrices] = await Promise.all([
    db
      .collection<Security>("securities")
      .find({ companyCode: { $in: companyCodes } })
      .toArray(),
    getLatestTwoPricesForMany(db, companyCodes),
    livePricesFor(companyCodes),
  ]);
  const securityByCode = new Map(securities.map((s) => [s.companyCode, s]));

  return items.map((item) => {
    const { last, prev } = pricesByCode.get(item.companyCode) ?? {
      last: null,
      prev: null,
    };
    const live = livePrices.get(item.companyCode) ?? null;
    const currentPrice = live ?? last?.close ?? null;
    const base = live !== null ? (last?.close ?? null) : priorClose(last, prev);
    const changePct =
      currentPrice !== null && base !== null && base > 0
        ? ((currentPrice - base) / base) * 100
        : null;
    return {
      ...item,
      name: securityByCode.get(item.companyCode)?.name ?? item.symbol,
      currentPrice,
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
