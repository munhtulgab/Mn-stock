import { callMseAction } from "./action";

/**
 * The exchange's own board of what is moving right now.
 *
 * mse.mn's front page carries the day's gainers and losers, and it is the
 * exchange saying it — not a figure derived from whatever closes happen to
 * be stored here. It is the only source that is current the moment a trade
 * prints, for every security that traded, so the movers on the home page are
 * built from it and fall back to stored closes only if it cannot be reached.
 *
 * The `code` in this feed is the site's own id and is not the company code
 * the rest of the app uses — AARD is 326 here and TTL is 458 — so rows are
 * matched by their ticker, which both sides agree on.
 */

export interface ExchangeMover {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

interface RawMover {
  legalDocument: string;
  companyName: string;
  price: string;
  changePercentage: number;
}

function isRawMoverArray(value: unknown): value is RawMover[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0] as RawMover;
  return (
    typeof first?.legalDocument === "string" &&
    typeof first?.changePercentage === "number"
  );
}

/** "41,760.00" — thousands separated, as the site formats it for display. */
function toNumber(text: string): number {
  return Number(text.replace(/,/g, ""));
}

function toMovers(rows: RawMover[]): ExchangeMover[] {
  return rows
    .map((row) => ({
      symbol: row.legalDocument.toUpperCase(),
      name: row.companyName,
      price: toNumber(row.price),
      changePct: row.changePercentage,
    }))
    .filter((m) => m.symbol && Number.isFinite(m.price) && m.price > 0);
}

export interface ExchangeMovers {
  gainers: ExchangeMover[];
  losers: ExchangeMover[];
}

/** A minute: the board changes as trades print, but not faster than a page. */
const CACHE_MS = 60_000;
let cache: { at: number; movers: ExchangeMovers } | null = null;
let inFlight: Promise<ExchangeMovers> | null = null;

async function load(): Promise<ExchangeMovers> {
  const [up, down] = await Promise.all([
    callMseAction("stock_up", "?lang=mn", isRawMoverArray).catch(() => null),
    callMseAction("stock_down", "?lang=mn", isRawMoverArray).catch(() => null),
  ]);
  return {
    gainers: up ? toMovers(up) : [],
    losers: down ? toMovers(down) : [],
  };
}

export async function fetchExchangeMovers(): Promise<ExchangeMovers> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.movers;
  if (inFlight) return inFlight;

  inFlight = load()
    .then((movers) => {
      // An empty board is what a day with no trades looks like, but it is
      // also what an unreachable one looks like; keep the last real answer.
      if (movers.gainers.length > 0 || movers.losers.length > 0) {
        cache = { at: Date.now(), movers };
        return movers;
      }
      return cache?.movers ?? movers;
    })
    .catch(() => cache?.movers ?? { gainers: [], losers: [] })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** The exchange's live index levels — what its own front page is showing. */
export interface LiveIndexTable {
  top20Unit: number;
  top20Change: number;
  top20Percent: number;
  mseAUnit: number;
  mseAChange: number;
  mseAPercent: number;
  mseBUnit: number;
  mseBChange: number;
  mseBPercent: number;
}

function isLiveIndexTable(value: unknown): value is LiveIndexTable {
  return typeof (value as LiveIndexTable)?.top20Unit === "number";
}

let indexCache: { at: number; table: LiveIndexTable } | null = null;

/**
 * The published index series ends at the last session the exchange has
 * closed and reported; this is where those three numbers stand right now.
 */
export async function fetchLiveIndexTable(): Promise<LiveIndexTable | null> {
  if (indexCache && Date.now() - indexCache.at < CACHE_MS) return indexCache.table;
  const table = await callMseAction("index_table", "?lang=mn", isLiveIndexTable).catch(
    () => null,
  );
  if (table) indexCache = { at: Date.now(), table };
  return table ?? indexCache?.table ?? null;
}
