import * as cheerio from "cheerio";
import { fetchMseHtml } from "./client";
import { toLocalTimestamp } from "./feed";

export interface CompanyNewsItem {
  title: string;
  date: string;
  url: string;
}

/**
 * Scrapes the "Холбоотой мэдээ, мэдээлэл" (related news) table shown on a
 * security's main open.mse.mn profile page.
 *
 * MSE serves the rows in no particular order — a 2018 notice can sit above
 * last month's dividend announcement — so they are sorted newest first here
 * rather than at each call site.
 */
export async function fetchCompanyNews(
  companyCode: number,
  limit = 10,
): Promise<CompanyNewsItem[]> {
  const html = await fetchMseHtml(`/securities/${companyCode}`);
  const $ = cheerio.load(html);
  const items: CompanyNewsItem[] = [];

  $("table.custom_table")
    .filter((_, table) => $(table).find("th").text().includes("Мэдээний"))
    .first()
    .find("tbody tr, tr")
    .each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const link = $(cells[1]).find("a").first();
      const title = link.text().trim();
      const date = toLocalTimestamp($(cells[2]).text().trim());
      const url = link.attr("href") || "";
      if (!title) return;
      items.push({ title, date, url });
    });

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items.slice(0, limit);
}
