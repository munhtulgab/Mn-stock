/**
 * One position, and the orders a list of them can be read in.
 *
 * Split out of `lib/portfolio` because the holdings list is a client
 * component and that module reaches the database: importing it from the
 * browser bundle pulled the Mongo driver — and `node:tls` behind it — into a
 * chunk that cannot have one, and the build said so. Nothing here touches a
 * database, so both sides can have it.
 */

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

/**
 * The orders the holdings list can be read in.
 *
 * Two, because there are two questions. "What is most of my money in?" is
 * answered by market value, and is what a portfolio is normally opened for.
 * "What is actually working?" is answered by the gain in tugriks, and a list
 * sorted by size will not show it — a small holding up 40% sits at the bottom
 * under four large ones that have gone nowhere.
 *
 * By the gain rather than the percentage: a 40% rise on a position worth
 * 90,000₮ has made less than a 3% rise on one worth four million, and it is
 * the money that decides what the portfolio did.
 */
export const HOLDING_ORDERS = ["value", "gain"] as const;

export type HoldingOrder = (typeof HOLDING_ORDERS)[number];

export function sortHoldings(
  holdings: HoldingView[],
  order: HoldingOrder,
  descending: boolean,
): HoldingView[] {
  const of = (h: HoldingView) => (order === "value" ? h.marketValue : h.gainLoss);
  // Copied, not sorted in place: the array belongs to whoever passed it, and
  // this runs on every tap of a toggle.
  return [...holdings].sort((a, b) => (descending ? of(b) - of(a) : of(a) - of(b)));
}
