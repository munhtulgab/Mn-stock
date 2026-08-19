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
export function withoutPeriod(stored: StatementFill[], period: Period): StatementFill[] {
  return stored.filter((f) => f.date < period.from || f.date > period.to);
}

/** Stored and new as one history, oldest first. */
export function mergeFills(
  stored: StatementFill[],
  incoming: StatementFill[],
  period: Period,
): StatementFill[] {
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
    held.set(fill.symbol, (held.get(fill.symbol) ?? 0) + signed);
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
