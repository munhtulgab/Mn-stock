import * as cheerio from "cheerio";
import { fetchWithExtraCa, parsePemBundle } from "@/lib/tls/extraCa";

/**
 * marketinfo.mn company data.
 *
 * The site keys its companies by the MSE company code — verified against
 * three of them (SUU 135, NEH 71, NKT 531) — so every security this app
 * already knows can be addressed without a lookup table.
 *
 * It is an ASP.NET MVC app with Kendo UI widgets: the registration block is
 * server-rendered into the page, while dividends, period changes and the
 * ownership breakdown come from JSON actions the widgets call. Both shapes
 * were captured from a live company site.
 */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;

export interface MarketInfoProfile {
  isin: string | null;
  /** Shares in issue, for market-cap and per-share maths. */
  sharesOutstanding: number | null;
  marketCap: number | null;
  closePrice: number | null;
  closeDate: string | null;
  classification: string | null;
  business: string | null;
}

export interface PeriodChange {
  key: string;
  label: string;
  /** Price at the start of the period. */
  value: number;
  changeValue: number;
  changePercent: number;
  date: string;
}

export interface Dividend {
  year: number;
  amount: number;
  ratio: number | null;
  yieldPct: number | null;
}

export interface BigOwner {
  name: string;
  shares: number;
  percent: number;
  asOf: string | null;
}

export interface OwnershipSlice {
  name: string;
  count: number;
  percent: number;
}

export interface MarketInfoCompany {
  sourceUrl: string;
  profile: MarketInfoProfile;
  changes: PeriodChange[];
  dividends: Dividend[];
  bigOwners: BigOwner[];
  /** Large- vs small-holder split, and domestic vs foreign. */
  concentration: OwnershipSlice[];
  domesticForeign: OwnershipSlice[];
}

/** Period keys the site uses, in the order a reader expects them. */
const PERIOD_LABELS: Record<string, string> = {
  last: "Сүүлийн",
  honog_7: "7 хоног",
  sar_1: "1 сар",
  sar_6: "6 сар",
  jil_1: "1 жил",
  jil_2: "2 жил",
};

function toNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  // "208,900,691,292.02₮" and "343,061,914" both reduce to a plain number.
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isoDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Reads a labelled figure out of the registration block. The page marks each
 * one up as a label element followed by its value, so matching on the label
 * text survives restyling in a way that a class-based selector would not.
 */
function labelled($: cheerio.CheerioAPI, label: string): string | null {
  let found: string | null = null;
  $("h1,h2,h3,h4,h5,h6,dt,strong,span,div,td").each((_, el) => {
    if (found) return;
    const node = $(el);
    if (node.children().length > 0) return;
    if (node.text().replace(/\s+/g, " ").trim() !== label) return;
    const value = node.next().text().replace(/\s+/g, " ").trim();
    if (value) found = value;
  });
  return found;
}

function parseProfile(html: string): MarketInfoProfile {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return {
    isin: labelled($, "ISIN"),
    sharesOutstanding: toNumber(labelled($, "Гаргасан хувьцааны тоо")),
    marketCap: toNumber(labelled($, "Зах зээлийн үнэлгээ")),
    closePrice: toNumber(labelled($, "Хаалтын ханш")),
    closeDate: isoDate(labelled($, "Хаалтын огноо")),
    classification: labelled($, "Бүртгэлийн ангилал"),
    business: labelled($, "Бизнес"),
  };
}

async function getText(
  url: string,
  extraCerts: string[],
  init: { method: "GET" | "POST" } = { method: "GET" },
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "X-Requested-With": "XMLHttpRequest",
  };
  if (init.method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  try {
    const res = await fetch(url, {
      method: init.method,
      headers,
      body: init.method === "POST" ? "" : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    // marketinfo.mn omits its intermediate certificate, so the operator-
    // supplied one is the only way through. Nothing to retry without it.
    if (extraCerts.length === 0) throw err;
    const res = await fetchWithExtraCa(url, {
      extraCerts,
      headers,
      timeoutMs: TIMEOUT_MS,
    });
    return { status: res.status, body: res.body };
  }
}

async function getJson<T>(
  url: string,
  extraCerts: string[],
): Promise<T | null> {
  try {
    const res = await getText(url, extraCerts, { method: "POST" });
    if (res.status !== 200) return null;
    return JSON.parse(res.body) as T;
  } catch {
    // A widget endpoint that moved or needs different arguments must not
    // take the whole company page down with it.
    return null;
  }
}

/** Company page URL. A dedicated per-company host wins when one exists. */
export function companyUrl(companyCode: number, host?: string): string {
  return host
    ? `https://${host}/`
    : `https://marketinfo.mn/stock/company/${companyCode}`;
}

export async function fetchMarketInfoCompany(
  companyCode: number,
  options: { host?: string; extraCaCerts?: string } = {},
): Promise<MarketInfoCompany | null> {
  const extraCerts = options.extraCaCerts
    ? parsePemBundle(options.extraCaCerts)
    : [];
  const url = companyUrl(companyCode, options.host);
  const origin = new URL(url).origin;

  const page = await getText(url, extraCerts);
  if (page.status !== 200) return null;

  const [changesRaw, dividendsRaw, ownershipRaw] = await Promise.all([
    getJson<
      { Name: string; ChangeValue: number; Value: number; ChangePercent: number; date: string }[]
    >(`${origin}/Home/TradeHistoryChange_Read`, extraCerts),
    getJson<
      { dividend_y: number; divident_val: number; divident_haritsaa: number; divident_uguuj: number }[]
    >(`${origin}/Home/NoogdolAshig`, extraCerts),
    getJson<{
      bigOwners?: { Lastname: string; Firstname: string; stockshare: number; StockPercent: number; DataDate: string }[];
      tomBagamodel?: { Name: string; Value: number; Percent: number }[];
      gadaadDotoodmodel?: { Name: string; Value: number; Percent: number }[];
    }>(`${origin}/Home/EzemshigchButets`, extraCerts),
  ]);

  return {
    sourceUrl: url,
    profile: parseProfile(page.body),
    changes: (changesRaw ?? []).map((c) => ({
      key: c.Name,
      label: PERIOD_LABELS[c.Name] ?? c.Name,
      value: c.Value,
      changeValue: c.ChangeValue,
      changePercent: c.ChangePercent,
      date: isoDate(c.date) ?? "",
    })),
    dividends: (dividendsRaw ?? [])
      .map((d) => ({
        year: d.dividend_y,
        amount: d.divident_val,
        ratio: Number.isFinite(d.divident_haritsaa) ? d.divident_haritsaa : null,
        yieldPct: Number.isFinite(d.divident_uguuj) ? d.divident_uguuj : null,
      }))
      .sort((a, b) => b.year - a.year),
    bigOwners: (ownershipRaw?.bigOwners ?? []).map((o) => ({
      name: [o.Firstname, o.Lastname].filter(Boolean).join(" ").trim(),
      shares: o.stockshare,
      percent: o.StockPercent,
      asOf: isoDate(o.DataDate),
    })),
    concentration: (ownershipRaw?.tomBagamodel ?? []).map((s) => ({
      name: s.Name,
      count: s.Value,
      percent: s.Percent,
    })),
    domesticForeign: (ownershipRaw?.gadaadDotoodmodel ?? []).map((s) => ({
      name: s.Name,
      count: s.Value,
      percent: s.Percent,
    })),
  };
}
