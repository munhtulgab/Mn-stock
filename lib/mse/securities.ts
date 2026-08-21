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
 *
 * Two of the page's five sections are read. #stocks is the Хувьцаа tab, the
 * shares, split by class and with the delisted ones behind their own tab.
 * #funds is the Сан tab — the collective investment funds and ETFs — and it
 * was not read at all, which is why FTI, listed on 2026-08-19 and trading
 * from that day, could not be found anywhere in this app. Nor could ALTT,
 * MFG, or ХӨС, which has been trading since 2020.
 *
 * The other three are left alone deliberately. #bonds, #abs and
 * #government-bonds are debt: they have a coupon and a maturity rather than
 * earnings and a P/E, and every scorecard, ratio and verdict this app
 * computes would be meaningless against them. A fund has a price history and
 * a chart, which is most of what a company page is.
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
    // #funds is a top-level section; the class tabs sit inside #stocks. The
    // selector covers both rather than the caller having to know which.
    $(`#stocks #${tabId} table tr, #${tabId}:not(#stocks *) table tr`).each((_, row) => {
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
  // The Сан tab is a section rather than a tab within one, so it is passed
  // its own id instead of one nested under #stocks.
  parseSection("funds", "fund", "active");

  return results;
}
