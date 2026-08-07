/**
 * TDB Securities' Datalab, which publishes what the exchange does not.
 *
 * MSE's own summary carries one quarter, no industry, and only balance-sheet
 * totals. Datalab carries five closed financial years per company, the
 * industry each company is actually in, a dividend history with payout
 * ratios, and — the reason this file exists — the current-asset and
 * current-liability split that a current ratio needs and that MSE never
 * publishes.
 *
 * It is a second opinion, not a replacement. MSE remains the source for the
 * running quarter and for prices, because it is the exchange; this fills the
 * gaps around it. Where the two disagree on a figure both publish, MSE wins.
 *
 * The API is TDB's own, read the way their site reads it: no key, no
 * session. `stockcode` is the same company code MSE uses — verified across
 * all 88 companies Datalab covers, 88 matches and no collisions — so the two
 * sources join without a lookup table.
 */

const BASE = "https://api.tdbsecurities.mn/tdbs/datalab";

/** Requests are small; a stalled one should not hold up a sync. */
const TIMEOUT_MS = 15_000;

/**
 * The years Datalab holds complete company-years for.
 *
 * The market-wide list answers for 2018 onward, but the per-company series
 * — the one carrying the current ratio — runs 2020 to 2024. The most recent
 * year is deliberately not the current one: see `usable` below.
 */
export const TDB_FIRST_YEAR = 2020;

export interface TdbYear {
  year: number;
  /** MSE's company code. */
  companyCode: number;
  symbol: string;
  /** The industry TDB files this company under, in Mongolian. */
  industry: string | null;
  industryCode: string | null;

  currentRatio: number | null;
  cashRatio: number | null;
  debtToEquity: number | null;
  assetTurnover: number | null;
  inventoryTurnover: number | null;
  receivablesTurnover: number | null;
  grossMargin: number | null;
  ebitdaMargin: number | null;
  netMargin: number | null;
  roa: number | null;
  roe: number | null;
  pe: number | null;
  pb: number | null;
  ps: number | null;
  eps: number | null;
  bookValuePerShare: number | null;
  /** As reported for the year the profit was earned. */
  dividendPerShare: number | null;
  dividendYield: number | null;
  dividendPayoutRatio: number | null;
}

export interface TdbDividend {
  year: number;
  amountPerShare: number;
  totalPaid: number | null;
  yieldPct: number | null;
  payoutRatio: number | null;
}

export interface TdbDividendSummary {
  companyCode: number;
  history: TdbDividend[];
  /** The most recent payment and the year it was made, as TDB states them. */
  lastPaid: number | null;
  lastPaidYear: number | null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`TDB ${path} -> ${response.status}`);
  return response.json();
}

/* ------------------------------------------------------------- plausibility */

/**
 * Whether a company-year is worth believing.
 *
 * Datalab's most recent year is loaded before every company has filed, and
 * the half-filed rows are not empty — they are wrong. In the 2025 set АПУ
 * reports a net profit six times its own previous year and larger than its
 * revenue, Сүү fourteen times, and Багануур a return on equity of 5,319%.
 * The closed years behind them are consistent and match MSE.
 *
 * So each row is checked against itself rather than trusted for being
 * recent. A company cannot earn more than it took in, and no listed company
 * returns ten times its own equity in a year; a row claiming either is
 * dropped whole, because whatever produced one bad field produced the rest
 * of them too.
 */
const MAX_PLAUSIBLE_ROE = 200;
const MAX_PLAUSIBLE_MARGIN = 100;

export function usable(row: TdbYear): boolean {
  // Only the arithmetically impossible is rejected here, and only because it
  // condemns the whole row: a company cannot keep more than it took in, and
  // no listed company doubles its own equity twice over in a year.
  //
  // Everything else is left alone and judged field by field further on. A
  // loss-making miner with a negative return on equity and no meaningful P/E
  // is not bad data — it is a loss-making miner, and an earlier version of
  // this check threw away twenty such companies for it.
  if (row.roe !== null && Math.abs(row.roe) > MAX_PLAUSIBLE_ROE) return false;
  if (row.netMargin !== null && row.netMargin > MAX_PLAUSIBLE_MARGIN) return false;
  return true;
}

/* ------------------------------------------------------------------ fetching */

interface RawRatio {
  stockcode?: number;
  symbol?: string;
  year?: number;
  inducode?: string | null;
  induname?: string | null;
  currentratio?: number | null;
  cashratio?: number | null;
  debttoequityratio?: number | null;
  assetturnover?: number | null;
  inventoryturnover?: number | null;
  receivablesturnover?: number | null;
  grossmargin?: number | null;
  ebitdamargin?: number | null;
  netmargin?: number | null;
  roa?: number | null;
  roe?: number | null;
  pe?: number | null;
  pb?: number | null;
  ps?: number | null;
  eps?: number | null;
  bookvaluepershare?: number | null;
  dividendpershare?: number | null;
  dividendyield?: number | null;
  dividendpayoutratio?: number | null;
}

function toYear(raw: RawRatio, companyCode: number, symbol: string, year: number): TdbYear {
  return {
    year,
    companyCode,
    symbol,
    industry: raw.induname ?? null,
    industryCode: raw.inducode ?? null,
    currentRatio: num(raw.currentratio),
    cashRatio: num(raw.cashratio),
    debtToEquity: num(raw.debttoequityratio),
    assetTurnover: num(raw.assetturnover),
    inventoryTurnover: num(raw.inventoryturnover),
    receivablesTurnover: num(raw.receivablesturnover),
    grossMargin: num(raw.grossmargin),
    ebitdaMargin: num(raw.ebitdamargin),
    netMargin: num(raw.netmargin),
    roa: num(raw.roa),
    roe: num(raw.roe),
    pe: num(raw.pe),
    pb: num(raw.pb),
    ps: num(raw.ps),
    eps: num(raw.eps),
    bookValuePerShare: num(raw.bookvaluepershare),
    dividendPerShare: num(raw.dividendpershare),
    dividendYield: num(raw.dividendyield),
    dividendPayoutRatio: num(raw.dividendpayoutratio),
  };
}

/**
 * Every company Datalab covers, for one financial year.
 *
 * One call for the whole market rather than one per company: this is what
 * the industry map and the sector medians are built from, and 88 separate
 * requests to learn 88 industries would be absurd.
 */
export async function fetchTdbYear(year: number): Promise<TdbYear[]> {
  const payload = (await request(`/ratio?pageNo=1&pageSize=500`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The year goes in the body; sent as a query parameter the API answers
    // that the field is missing.
    body: JSON.stringify({ year }),
  })) as { content?: RawRatio[] };

  return (payload.content ?? [])
    .filter((row) => typeof row.stockcode === "number" && typeof row.symbol === "string")
    .map((row) => toYear(row, row.stockcode!, row.symbol!, year));
}

/**
 * What this company has paid, year by year.
 *
 * Keyed by company code, not ticker — the per-company endpoints answer with
 * a server error for a ticker. Only years with a stated amount come back;
 * TDB pads its history with empty years and those say nothing.
 */
export async function fetchTdbDividends(
  companyCode: number,
  year: number,
): Promise<TdbDividendSummary | null> {
  interface RawDividend {
    year?: number;
    amountpershare?: number | null;
    totalpaid?: number | null;
    dividendyield?: number | null;
    payoutratio?: number | null;
  }
  const payload = (await request(
    `/stock/${companyCode}/dividend?year=${year}`,
  )) as {
    history?: RawDividend[];
    summary?: { lastpaid?: number | null; lastpaidyear?: number | null };
  };

  const history = (payload.history ?? [])
    // A stated zero means the company paid nothing that year, which is the
    // absence of a dividend rather than a dividend of nothing. Listing it as
    // a row reads as a payment having been made.
    .filter((row) => (num(row.amountpershare) ?? 0) > 0 && typeof row.year === "number")
    .map<TdbDividend>((row) => ({
      year: row.year!,
      amountPerShare: row.amountpershare!,
      totalPaid: num(row.totalpaid),
      yieldPct: num(row.dividendyield),
      payoutRatio: num(row.payoutratio),
    }))
    .sort((a, b) => b.year - a.year);

  if (history.length === 0) return null;
  return {
    companyCode,
    history,
    lastPaid: num(payload.summary?.lastpaid),
    lastPaidYear: num(payload.summary?.lastpaidyear),
  };
}
