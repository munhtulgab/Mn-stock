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

/**
 * What the overview says about a company beyond its running price.
 *
 * The same call the live quote already makes carries a dozen figures it does
 * not read: the year's range and return, the year's standard deviation, the
 * shares in issue and the share of them in public hands, the average day's
 * volume. They are stated by the source rather than worked out here, which
 * is the point — a 52-week high computed from the candles this app holds is
 * only as complete as those candles.
 */
export interface TdbProfile {
  companyCode: number;
  symbol: string;
  /** Highest and lowest close of the last year, as Datalab states them. */
  high52w: number | null;
  low52w: number | null;
  /** The last year's price return, as a percentage. */
  yearlyReturn: number | null;
  /** Annualised standard deviation of daily returns, as a percentage. */
  yearlyStdDev: number | null;
  /** Shares traded on an average session, and over the whole year. */
  avgVolume: number | null;
  yearVolume: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  /**
   * The percentage of shares not held by the controlling owners — the free
   * float, and the part of a listing that can actually change hands.
   */
  freeFloatPct: number | null;
  /**
   * Market capitalisation plus net debt.
   *
   * Left as stated, including where that is negative: a bank funded by
   * deposits has more cash than debt and the figure comes out below zero,
   * which is arithmetic rather than an error, but it is also not a number
   * worth showing next to an industrial company's. Whoever displays this has
   * to decide that; this only reports what Datalab said.
   */
  enterpriseValue: number | null;
}

/** One column of the histogram: sessions whose return landed in this bucket. */
export interface TdbReturnBucket {
  /** The bucket's lower edge, as a daily percentage return. */
  bucket: number;
  count: number;
}

/**
 * How a company's daily returns were distributed over the last trading year.
 *
 * The app works out its own volatility over three years, against the index,
 * to price risk. This is a different question and a shorter window: what one
 * day in this share has actually looked like lately, from the source's own
 * arithmetic. The histogram is the part worth having — a standard deviation
 * says how wide the spread is and nothing about its shape, and these are not
 * symmetrical. KHAN's worst session in the year was -15.5% against a best of
 * +3.8%, around a daily deviation of 1.26%.
 */
export interface TdbReturnDistribution {
  companyCode: number;
  /** Sessions the distribution is built from. 243 across every company. */
  sessions: number;
  meanPct: number | null;
  dailyStdDev: number | null;
  annualStdDev: number | null;
  minPct: number | null;
  maxPct: number | null;
  /** The band a session lands in two times in three. */
  best1Sigma: number | null;
  worst1Sigma: number | null;
  histogram: TdbReturnBucket[];
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
 * The overview's non-price fields.
 *
 * Separate from `fetchTdbQuote`, which reads the same endpoint for the
 * running session. That one is on the hot path — it answers a page render
 * when marketinfo is down — and drops any company that has not traded today;
 * these figures are about the year and are wanted whether it traded or not.
 */
export async function fetchTdbProfile(
  companyCode: number,
): Promise<TdbProfile | null> {
  interface RawOverview {
    stockcode?: number;
    symbol?: string;
    high52w?: number | null;
    low52w?: number | null;
    yearlyreturn?: number | null;
    yearlystddev?: number | null;
    avgvolume?: number | null;
    totalvolume?: number | null;
    marketcap?: number | null;
    stockcnt?: number | null;
    minoritysharesperc?: number | null;
    companyev?: number | null;
  }
  const row = (await request(`/stock/${companyCode}/overview`)) as RawOverview;
  if (typeof row.stockcode !== "number" || !row.symbol) return null;

  return {
    companyCode: row.stockcode,
    symbol: row.symbol.trim().toUpperCase(),
    high52w: num(row.high52w),
    low52w: num(row.low52w),
    yearlyReturn: num(row.yearlyreturn),
    yearlyStdDev: num(row.yearlystddev),
    avgVolume: num(row.avgvolume),
    yearVolume: num(row.totalvolume),
    marketCap: num(row.marketcap),
    sharesOutstanding: num(row.stockcnt),
    freeFloatPct: num(row.minoritysharesperc),
    enterpriseValue: num(row.companyev),
  };
}

/**
 * The spread of this company's daily returns over the last trading year.
 */
export async function fetchTdbReturnDistribution(
  companyCode: number,
): Promise<TdbReturnDistribution | null> {
  interface RawBucket {
    bucket?: number;
    count?: number;
  }
  interface RawDistribution {
    n_days?: number;
    mean?: number | null;
    daily_std?: number | null;
    annual_std?: number | null;
    min?: number | null;
    max?: number | null;
    best_1sigma?: number | null;
    worst_1sigma?: number | null;
    histogram?: RawBucket[];
  }
  const row = (await request(
    `/stock/${companyCode}/return-distribution`,
  )) as RawDistribution;

  const sessions = num(row.n_days) ?? 0;
  // A distribution of nothing is not a distribution. Companies that have
  // barely traded come back with a handful of sessions and a shape that says
  // more about the gaps than about the share.
  if (sessions < MIN_DISTRIBUTION_SESSIONS) return null;

  // Empty buckets are kept. They are what makes the row of bars a shape:
  // drop the sessions nobody traded at -4% and the bar for -8% slides up
  // against the bar for -1%, which draws a fat tail as a narrow one.
  const histogram = (row.histogram ?? [])
    .filter((b) => num(b.bucket) !== null && num(b.count) !== null)
    .map<TdbReturnBucket>((b) => ({ bucket: b.bucket!, count: b.count! }))
    .sort((a, b) => a.bucket - b.bucket);

  return {
    companyCode,
    sessions,
    meanPct: num(row.mean),
    dailyStdDev: num(row.daily_std),
    annualStdDev: num(row.annual_std),
    minPct: num(row.min),
    maxPct: num(row.max),
    best1Sigma: num(row.best_1sigma),
    worst1Sigma: num(row.worst_1sigma),
    histogram,
  };
}

/**
 * Below this a histogram is a scatter of single sessions rather than a
 * shape. Datalab answers with a full trading year — 243 sessions — for
 * every company checked, so this only guards the thin end of the exchange.
 */
const MIN_DISTRIBUTION_SESSIONS = 30;

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
