import type { DashboardRow } from "@/lib/data";

/**
 * Only the fields the order is decided on. A structural type rather than the
 * whole row, so a test can state a case in one line — and imported as a type
 * alone, which is erased, because the module it comes from opens a database
 * and this ordering runs in the browser.
 */
export type MarketRow = Pick<DashboardRow, "symbol" | "lastDate" | "score">;

/**
 * The market list's order: the latest session first, best score within it.
 *
 * It used to be the score alone, which reads well until you notice what is
 * at the top of it. Four hundred listings share this page and most of them
 * have not traded in months; a dormant company keeps whatever score its last
 * prices earned, so it sat above everything that traded this morning. The
 * score answers "how does this look", and the date answers "is this a thing
 * you can buy today" — and the second question comes first.
 *
 * Newest day first, and inside a day the best score first. A listing that
 * has never traded has no day and goes last; one with no verdict goes last
 * among the day it traded on. Ties fall to the symbol, so the list does not
 * shuffle between renders of the same data.
 */
export function byLatestThenScore(a: MarketRow, b: MarketRow): number {
  if (a.lastDate !== b.lastDate) {
    if (!a.lastDate) return 1;
    if (!b.lastDate) return -1;
    return b.lastDate.localeCompare(a.lastDate);
  }
  if (a.score !== b.score) {
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  }
  return a.symbol.localeCompare(b.symbol);
}
