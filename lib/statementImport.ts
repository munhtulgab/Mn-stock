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
   * Weighted average of what was settled, commission included.
   *
   * The broker's own portfolio screen states cost this way — its "Дүн" for
   * 1,500 APU is 1,569,236.60₮, which is 1,553,699.60₮ of shares and
   * 15,537₮ of commission — and the whole point of importing a statement is
   * that the app agrees with the statement. Priced at the shares alone, every
   * position here would show about a percent more profit than the account
   * really has, which is the commission it has already paid.
   */
  avgCost: number;
}

/**
 * A statement that cannot be read, said in words the uploader can act on.
 *
 * Told apart by name as well as by prototype. `instanceof` is the obvious
 * check and it is one module instance away from silently failing — a bundler
 * that loads this file twice would turn every "this file is not a PDF" into
 * an unexplained 500. The name survives that.
 */
export class StatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementError";
  }
}

export function isStatementError(err: unknown): err is StatementError {
  return err instanceof StatementError || (err as Error)?.name === "StatementError";
}

/**
 * Runs the fills in order and returns what is left holding.
 *
 * A sale takes its cost out at the average price of the moment, which is the
 * rule the app already applies and the reason a sale cannot change what the
 * remaining shares are held at. Positions closed out entirely are dropped:
 * the statement records that they were owned, not that they are.
 */
export function positionsFrom(
  fills: StatementFill[],
  /**
   * Symbols the statement records but the portfolio does not carry.
   *
   * ETT is the one here: 1,072 shares allocated by the state, held at the
   * depository and not traded on the board, so the broker's own valuation
   * leaves them out — its total is the other eight positions exactly. They are
   * owned, but there is no price at which to say what they are worth, and
   * inventing one would put a number on the home card that nothing supports.
   */
  exclude: string[] = [],
  {
    carriedIn = false,
  }: {
    /**
     * Whether a sale of more than the history has bought is shares the account
     * held before its first statement, rather than a broken history.
     *
     * Off by default, because without a reason to believe it, it is the
     * latter. The importer turns it on once it has checked the reason: a
     * statement that opens holding shares nothing explains is accepted only
     * when it goes on to sell every one of them — see `soldOut`.
     */
    carriedIn?: boolean;
  } = {},
): StatementPosition[] {
  const dropped = new Set(exclude);
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
      // What the account was actually debited, which is the shares plus the
      // commission on them — see `avgCost`.
      cost.set(fill.symbol, basis + fill.settled);
      continue;
    }

    if (fill.quantity > held + 1e-9) {
      if (!carriedIn) {
        throw new StatementError(
          `${fill.symbol} ${fill.date}: sold ${fill.quantity} holding ${held}`,
        );
      }
      // Some of these were held from before the history starts, at a cost no
      // statement states. The sale leaves none of anything, so it closes the
      // position and its cost at nothing — which is what lets the next
      // purchase start again from a price that is known.
      quantity.set(fill.symbol, 0);
      cost.set(fill.symbol, 0);
      continue;
    }
    // Sold at the average of the moment, so the rest is untouched by the sale.
    const average = held > 0 ? basis / held : 0;
    quantity.set(fill.symbol, held - fill.quantity);
    cost.set(fill.symbol, basis - average * fill.quantity);
  }

  return [...quantity.entries()]
    .filter(([symbol, held]) => Math.round(held * 1e4) > 0 && !dropped.has(symbol))
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
  /** What the remaining shares cost, commission included. */
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
  // Counted from the fills rather than from what is missing out of
  // `positions`: a symbol can be absent from those because it was sold out or
  // because it was excluded from the valuation, and calling the second one
  // closed would report shares as gone that the account still owns.
  const net = new Map<string, number>();
  for (const fill of fills) {
    const signed = fill.side === "BUY" ? fill.quantity : -fill.quantity;
    net.set(fill.symbol, (net.get(fill.symbol) ?? 0) + signed);
  }
  const held = new Set(positions.map((p) => p.symbol));

  return {
    fills: fills.length,
    bought: fills.filter((f) => f.side === "BUY").length,
    sold: fills.filter((f) => f.side === "SELL").length,
    costBasis: positions.reduce((sum, p) => sum + p.quantity * p.avgCost, 0),
    fees: fills.reduce((sum, f) => sum + f.fee, 0),
    closed: [...net.entries()]
      // Below nothing is shares held from before the history and sold in it,
      // which is sold out as surely as bought and sold again. Unless it was
      // bought back afterwards, which is what the positions are asked for.
      .filter(([symbol, n]) => Math.round(n * 1e4) <= 0 && !held.has(symbol))
      .map(([symbol]) => symbol)
      .sort(),
  };
}

/**
 * Positions held at several brokers, as the one portfolio they make up.
 *
 * Each broker's are worked out from that broker's fills and only then added
 * together, rather than run as one history: a sale through Mandal takes out
 * shares at what they cost at Mandal, not at an average blended with what was
 * paid through Golomt. The broker sold what it held.
 */
export function combinePositions(...brokers: StatementPosition[][]): StatementPosition[] {
  const combined = new Map<string, { position: StatementPosition; cost: number }>();
  for (const position of brokers.flat()) {
    const cost = position.quantity * position.avgCost;
    const seen = combined.get(position.symbol);
    if (!seen) {
      combined.set(position.symbol, { position: { ...position }, cost });
      continue;
    }
    seen.position.quantity += position.quantity;
    seen.cost += cost;
  }
  return [...combined.values()]
    .map(({ position, cost }) => ({ ...position, avgCost: cost / position.quantity }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
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
