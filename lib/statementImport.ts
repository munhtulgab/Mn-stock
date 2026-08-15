import type { Holding, OrderSide } from "@/lib/types";

/**
 * A broker statement's holdings, rebuilt from its fills.
 *
 * The app's own portfolio is kept by {@link buyStock} and {@link sellStock},
 * which move one position at a time as the order goes through. A statement
 * arrives as years of fills at once, so the same arithmetic has to be run over
 * the lot before anything is written — and it has to be run the same way, or
 * an imported position and a bought one would disagree about what was paid.
 */
export interface StatementFill {
  /** `YYYY-MM-DD`, the dealing day. */
  date: string;
  symbol: string;
  /** The broker's own code for the company, used only where the app has none. */
  companyCode: number;
  side: OrderSide;
  quantity: number;
  /** Per share, before commission. */
  price: number;
  /** What the account was actually debited or credited, commission included. */
  settled: number;
  fee: number;
}

export interface StatementPosition {
  symbol: string;
  companyCode: number;
  quantity: number;
  /**
   * Weighted average, commission excluded.
   *
   * The app has no notion of a dealing fee: a position bought through the app
   * costs quantity times price and nothing more. Folding the broker's
   * commission in here would make an imported position quietly more expensive
   * than the same position bought in the app, and the gain it reports wrong by
   * the fee. The commission is reported separately by {@link summarise} and
   * belongs in a line of its own, not smuggled into the cost of the shares.
   */
  avgCost: number;
}

export class StatementError extends Error {}

/**
 * Runs the fills in order and returns what is left holding.
 *
 * A sale takes its cost out at the average price of the moment, which is the
 * rule the app already applies and the reason a sale cannot change what the
 * remaining shares are held at. Positions closed out entirely are dropped:
 * the statement records that they were owned, not that they are.
 */
export function positionsFrom(fills: StatementFill[]): StatementPosition[] {
  const quantity = new Map<string, number>();
  const cost = new Map<string, number>();
  const code = new Map<string, number>();

  for (const fill of [...fills].sort((a, b) => a.date.localeCompare(b.date))) {
    if (fill.quantity <= 0) {
      throw new StatementError(
        `${fill.symbol} ${fill.date}: a fill of ${fill.quantity} shares is not a fill`,
      );
    }
    code.set(fill.symbol, code.get(fill.symbol) ?? fill.companyCode);
    const held = quantity.get(fill.symbol) ?? 0;
    const basis = cost.get(fill.symbol) ?? 0;

    if (fill.side === "BUY") {
      quantity.set(fill.symbol, held + fill.quantity);
      cost.set(fill.symbol, basis + fill.quantity * fill.price);
      continue;
    }

    if (fill.quantity > held + 1e-9) {
      throw new StatementError(
        `${fill.symbol} ${fill.date}: sold ${fill.quantity} holding ${held}`,
      );
    }
    // Sold at the average of the moment, so the rest is untouched by the sale.
    const average = held > 0 ? basis / held : 0;
    quantity.set(fill.symbol, held - fill.quantity);
    cost.set(fill.symbol, basis - average * fill.quantity);
  }

  return [...quantity.entries()]
    .filter(([, held]) => Math.round(held * 1e4) > 0)
    .map(([symbol, held]) => ({
      symbol,
      companyCode: code.get(symbol)!,
      quantity: held,
      avgCost: (cost.get(symbol) ?? 0) / held,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export interface StatementSummary {
  fills: number;
  bought: number;
  sold: number;
  /** What the remaining shares cost, commission excluded. */
  costBasis: number;
  /** Commission over every fill, including ones since closed out. */
  fees: number;
  /** Symbols the statement traded and no longer holds. */
  closed: string[];
}

export function summarise(
  fills: StatementFill[],
  positions: StatementPosition[],
): StatementSummary {
  const holding = new Set(positions.map((p) => p.symbol));
  return {
    fills: fills.length,
    bought: fills.filter((f) => f.side === "BUY").length,
    sold: fills.filter((f) => f.side === "SELL").length,
    costBasis: positions.reduce((sum, p) => sum + p.quantity * p.avgCost, 0),
    fees: fills.reduce((sum, f) => sum + f.fee, 0),
    closed: [...new Set(fills.map((f) => f.symbol))]
      .filter((s) => !holding.has(s))
      .sort(),
  };
}

/** A position as the app stores one. */
export function toHolding(
  position: StatementPosition,
  userId: string,
  companyCode: number,
): Holding {
  return {
    userId,
    companyCode,
    symbol: position.symbol,
    quantity: position.quantity,
    avgCost: position.avgCost,
    updatedAt: new Date(),
  };
}
