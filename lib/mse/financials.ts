import * as cheerio from "cheerio";
import { fetchMseHtml } from "./client";
import type { Financials } from "@/lib/types";
import { ulaanbaatarDay } from "@/lib/day";

type NumericFinancialField = Exclude<
  keyof Financials,
  "companyCode" | "period" | "year" | "quarter" | "fetchedAt" | "reportKind"
>;

/**
 * The exchange publishes four different summaries, not one.
 *
 * A manufacturer reports a turnover and a cost of sales; a bank reports
 * interest income, deposits and current accounts; a non-bank lender reports
 * interest income without the deposits; an insurer reports premiums and
 * claims. They are the same eight ratios underneath — assets, liabilities,
 * shares, book value, ROA, ROE, EPS, P/E are on all 267 reports — but the
 * three lines above them are named differently on each.
 *
 * Reading only the manufacturer's names left equity and net profit empty for
 * every bank and lender on the exchange, which is to say for the whole of
 * the financial sector. Each layout's own wording is mapped here.
 */
const LABEL_MAP: Record<string, NumericFinancialField> = {
  "Нийт хөрөнгө": "totalAssets",
  "Өр төлбөрийн нийт дүн": "totalLiabilities",
  "Эзэмшигчдийн өмчийн дүн": "equity",
  // A bank states the same figure under its own name.
  "Өөрийн хөрөнгийн дүн": "equity",
  "Нийт гаргасан хувьцаа": "sharesOutstanding",
  "Нийт борлуулалтын орлого": "revenue",
  // What a lender and an insurer sell instead of goods.
  "Хүүгийн орлого": "revenue",
  "Даатгалын хураамжийн орлого": "revenue",
  "Борлуулсан бүтээгдэхүүний өртөг": "costOfSales",
  "Нийт ашиг": "grossProfit",
  "Цэвэр ашиг": "netProfit",
  "Татварын дараах ашиг, алдагдал": "netProfit",
  "Тайлант үеийн цэвэр ашиг, алдагдал": "netProfit",
  "Нэгж хувьцааны дансны үнэ": "bookValuePerShare",
  "Нийт хөрөнгийн өгөөж /ROA/": "roa",
  "Хувь нийлүүлсэн хөрөнгийн өгөөж /ROE/": "roe",
  "Нийт хөрөнгийн эргэц /ROTA/": "rota",
  "Нэгж хувьцааны өгөөж /EPS/": "eps",
  "Үнэ ашгийн харьцаа (P/E Ratio)": "pe",
};

/**
 * Which of the four summaries this company filed.
 *
 * Worth keeping because it is the exchange's own statement of what kind of
 * business this is — it files a bank's report because it is a bank — and the
 * exchange publishes no industry field anywhere else. It is what the sector
 * a company is compared against is built from.
 */
const LAYOUT_MARKERS: [string, Financials["reportKind"]][] = [
  // A deposit book is what separates a bank from any other lender.
  ["Хадгаламж", "bank"],
  ["Даатгалын хураамжийн орлого", "insurance"],
  ["Хүүгийн орлого", "nbfi"],
];

function reportKindOf(labels: Set<string>): Financials["reportKind"] {
  for (const [marker, kind] of LAYOUT_MARKERS) {
    if (labels.has(marker)) return kind;
  }
  return "general";
}

function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "N/A") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Scrapes the latest quarterly financial snapshot for one security from
 * open.mse.mn's "Санхүүгийн мэдээлэл" tab.
 */
export async function fetchLatestFinancials(
  companyCode: number,
): Promise<Omit<Financials, "fetchedAt"> | null> {
  const html = await fetchMseHtml(`/securities/${companyCode}/tab/financials`);
  const $ = cheerio.load(html);

  const block = $(".finance-report-item").first();
  if (block.length === 0) return null;

  const heading = block.find("h5").first().text().trim();
  const periodMatch = heading.match(/(\d{4})\s*Он\s*(\d)\s*Улирал/);
  const year = periodMatch ? Number(periodMatch[1]) : Number(ulaanbaatarDay(new Date()).slice(0, 4));
  const quarter = periodMatch ? Number(periodMatch[2]) : 0;

  const result: Omit<Financials, "fetchedAt"> = {
    companyCode,
    period: `${year}-Q${quarter}`,
    year,
    quarter,
    totalAssets: null,
    totalLiabilities: null,
    equity: null,
    sharesOutstanding: null,
    revenue: null,
    costOfSales: null,
    grossProfit: null,
    netProfit: null,
    bookValuePerShare: null,
    roa: null,
    roe: null,
    rota: null,
    eps: null,
    pe: null,
    reportKind: "general",
  };

  const labels = new Set<string>();
  block.find("li").each((_, li) => {
    const fullText = $(li).text();
    const [labelRaw] = fullText.split(":");
    const label = labelRaw?.trim();
    if (!label) return;
    labels.add(label);
    if (!(label in LABEL_MAP)) return;
    const valueText = $(li).find("b").text();
    const field = LABEL_MAP[label];
    (result[field] as number | null) = parseNumber(valueText);
  });

  result.reportKind = reportKindOf(labels);
  return result;
}
