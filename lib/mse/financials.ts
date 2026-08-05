import * as cheerio from "cheerio";
import { fetchMseHtml } from "./client";
import type { Financials } from "@/lib/types";
import { ulaanbaatarDay } from "@/lib/day";

type NumericFinancialField = Exclude<
  keyof Financials,
  "companyCode" | "period" | "year" | "quarter" | "fetchedAt"
>;

const LABEL_MAP: Record<string, NumericFinancialField> = {
  "Нийт хөрөнгө": "totalAssets",
  "Өр төлбөрийн нийт дүн": "totalLiabilities",
  "Эзэмшигчдийн өмчийн дүн": "equity",
  "Нийт гаргасан хувьцаа": "sharesOutstanding",
  "Нийт борлуулалтын орлого": "revenue",
  "Борлуулсан бүтээгдэхүүний өртөг": "costOfSales",
  "Нийт ашиг": "grossProfit",
  "Цэвэр ашиг": "netProfit",
  "Нэгж хувьцааны дансны үнэ": "bookValuePerShare",
  "Нийт хөрөнгийн өгөөж /ROA/": "roa",
  "Хувь нийлүүлсэн хөрөнгийн өгөөж /ROE/": "roe",
  "Нийт хөрөнгийн эргэц /ROTA/": "rota",
  "Нэгж хувьцааны өгөөж /EPS/": "eps",
  "Үнэ ашгийн харьцаа (P/E Ratio)": "pe",
};

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
  };

  block.find("li").each((_, li) => {
    const fullText = $(li).text();
    const [labelRaw] = fullText.split(":");
    const label = labelRaw?.trim();
    if (!label || !(label in LABEL_MAP)) return;
    const valueText = $(li).find("b").text();
    const field = LABEL_MAP[label];
    (result[field] as number | null) = parseNumber(valueText);
  });

  return result;
}
