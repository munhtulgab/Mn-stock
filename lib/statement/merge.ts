import type { StatementFill } from "@/lib/statementImport";

/**
 * Adding a statement to the ones already imported.
 *
 * An account gets a new statement every few months, and re-uploading the whole
 * run each time is not something anybody does twice. What is already stored
 * stays stored; a new file contributes its own period and nothing else.
 */

/** A period the fills cover, as `YYYY-MM-DD`. */
export interface Period {
  from: string;
  to: string;
}

/**
 * The stored history with the new statement's period cut out of it.
 *
 * The uploaded file is the authority on the days it covers, so a re-upload of
 * a corrected or extended statement replaces what was read from the old one
 * rather than adding to it — which is what keeps importing the same period
 * twice from doubling every fill in it.
 */
export function withoutPeriod<F extends StatementFill>(stored: F[], period: Period): F[] {
  return stored.filter((f) => f.date < period.from || f.date > period.to);
}

/** Stored and new as one history, oldest first. */
export function mergeFills<F extends StatementFill>(
  stored: F[],
  incoming: F[],
  period: Period,
): F[] {
  return [...withoutPeriod(stored, period), ...incoming].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

/**
 * What the history says was held the day before a statement opens.
 *
 * Compared against what that statement says it opened holding: the two
 * agreeing is what makes the run of statements complete, and where they
 * disagree the difference names exactly which shares are unaccounted for.
 */
export function positionsBefore(
  fills: StatementFill[],
  date: string,
): Map<string, number> {
  const held = new Map<string, number>();
  for (const fill of fills) {
    if (fill.date >= date) continue;
    const signed = fill.side === "BUY" ? fill.quantity : -fill.quantity;
    // Never below nothing. A history can sell shares it never bought — held
    // from before its first statement, and let in because they were sold to
    // the last one (see `soldOut`) — and afterwards they are gone, not owed.
    held.set(fill.symbol, Math.max(0, (held.get(fill.symbol) ?? 0) + signed));
  }
  return held;
}

export interface Shortfall {
  symbol: string;
  /** Shares the statement opens holding. */
  stated: number;
  /** Shares the already-imported history accounts for. */
  known: number;
}

/**
 * Shares a statement opens with that nothing already imported explains.
 *
 * Empty means the run is complete and the import can go ahead. Anything in it
 * is a hole: those shares were bought in a period nobody has uploaded, so what
 * they cost is not known, and a portfolio built on them would report a profit
 * that was never made.
 */
export function shortfalls(
  carriedIn: { symbol: string; quantity: number }[],
  known: Map<string, number>,
): Shortfall[] {
  return carriedIn
    .map(({ symbol, quantity }) => ({
      symbol,
      stated: quantity,
      known: known.get(symbol) ?? 0,
    }))
    .filter((s) => Math.abs(s.stated - s.known) > 0.001)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/**
 * The shortfalls a statement goes on to sell all the way out of.
 *
 * Shares a statement opens with that nothing explains have no known cost,
 * which is why a shortfall stops an import. But a holding the statement
 * itself takes down to nothing leaves no position behind whose cost depends
 * on them: once the account holds none of a company, whatever it buys next
 * is bought at a price the statement states. What is lost is the profit on
 * the shares sold, and nothing in the portfolio claims to know that.
 *
 * Mandal's 55,210 MFG are the case: held before its statement begins, sold
 * to the last unit on 2024-08-07, and never bought anywhere it records.
 *
 * Run from what the statement says it opened with, not from what the history
 * explains, because the unexplained shares are sold along with the rest.
 */
export function soldOut(missing: Shortfall[], incoming: StatementFill[]): Shortfall[] {
  return missing.filter(({ symbol, stated, known }) => {
    // More explained than the statement holds is not shares of unknown cost
    // but shares the history thinks are there and the broker says are not.
    if (stated < known) return false;
    let held = stated;
    for (const fill of incoming) {
      if (fill.symbol !== symbol) continue;
      held += fill.side === "BUY" ? fill.quantity : -fill.quantity;
      if (held <= 1e-9) return true;
    }
    return false;
  });
}
