import * as cheerio from "cheerio";
import { fetchMseHtml } from "./client";
import type { Security, SecurityClassification } from "@/lib/types";

const CLASS_TAB_IDS: { id: string; classification: SecurityClassification }[] = [
  { id: "class1", classification: "I" },
  { id: "class2", classification: "II" },
  { id: "class3", classification: "III" },
];

/**
 * Scrapes the public securities directory at open.mse.mn/securities.
 * Only the "stocks" (Хувьцаа) section is parsed for now.
 */
export async function fetchSecuritiesList(): Promise<
  Omit<Security, "updatedAt">[]
> {
  const html = await fetchMseHtml("/securities");
  const $ = cheerio.load(html);
  const results: Omit<Security, "updatedAt">[] = [];
  const seen = new Set<number>();

  function parseSection(
    tabId: string,
    classification: SecurityClassification,
    status: "active" | "delisted",
  ) {
    $(`#stocks #${tabId} table tr`).each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const link = $(cells[1]).find("a").first();
      const href = link.attr("href") || "";
      const match = href.match(/\/securities\/(\d+)/);
      if (!match) return;
      const companyCode = Number(match[1]);
      const symbol = link.text().trim();
      const name = $(cells[2]).text().trim();
      if (!symbol || !companyCode || seen.has(companyCode)) return;
      seen.add(companyCode);
      results.push({ companyCode, symbol, name, classification, status });
    });
  }

  for (const { id, classification } of CLASS_TAB_IDS) {
    parseSection(id, classification, "active");
  }
  parseSection("delisted", "unknown", "delisted");

  return results;
}
