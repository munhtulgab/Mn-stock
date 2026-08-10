/**
 * Today's session from TDB Securities' Datalab, for when marketinfo is down.
 *
 * marketinfo.mn is the app's live price, and on the morning of 10 August 2026
 * every one of its endpoints answered 503 through an open session. The
 * exchange's own movers board covers that outage for the twenty companies
 * that moved, but it publishes a price and nothing else — no open, no high or
 * low, no volume — so a chart built from it draws a flat bar.
 *
 * Datalab states the whole session per company:
 *
 *     openprice 384.99  closeprice 385.0  high 385.0  low 384.0
 *     volume 13693  turnover 5271542.96  prevclose 379.4  changeperc 1.476
 *
 * and its `prevclose` reconciles to the cent with the close this app has
 * stored from the exchange. There is one company per request and no listing
 * endpoint — probed for, and the API answers 401 on everything but the two
 * paths already known and this one — so it is asked about companies by name
 * rather than swept.
 */

const BASE = "https://api.tdbsecurities.mn/tdbs/datalab";
const TIMEOUT_MS = 8_000;

export interface TdbQuote {
  companyCode: number;
  symbol: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  vwap: number | null;
  volume: number | null;
  turnover: number | null;
  previousClose: number | null;
  changePct: number | null;
}

interface RawOverview {
  stockcode?: number;
  symbol?: string;
  openprice?: number | null;
  closeprice?: number | null;
  high?: number | null;
  low?: number | null;
  vwap?: number | null;
  volume?: number | null;
  turnover?: number | null;
  prevclose?: number | null;
  changeperc?: number | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Zero is "no trade yet today" on the price fields, not a price of nothing. */
function positive(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

export async function fetchTdbQuote(companyCode: number): Promise<TdbQuote | null> {
  try {
    const res = await fetch(`${BASE}/stock/${companyCode}/overview`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const row = (await res.json()) as RawOverview;
    const code = num(row.stockcode);
    if (code === null || !row.symbol) return null;

    const close = positive(row.closeprice);
    const previousClose = positive(row.prevclose);
    // A company that has not traded today reports its previous close and no
    // volume. That is not a quote for today, and returning it as one would
    // date yesterday's price to this morning.
    const volume = num(row.volume);
    if (close === null || (volume !== null && volume <= 0 && close === previousClose)) {
      return null;
    }

    return {
      companyCode: code,
      symbol: row.symbol.trim().toUpperCase(),
      open: positive(row.openprice),
      close,
      high: positive(row.high),
      low: positive(row.low),
      vwap: positive(row.vwap),
      volume,
      turnover: num(row.turnover),
      previousClose,
      changePct: num(row.changeperc),
    };
  } catch {
    return null;
  }
}
