import { decode } from "html-entities";
import { fetchMseHtml } from "./client";
import type { PricePoint } from "@/lib/types";

interface RawTradingHistory {
  OpeningPrice: number;
  ClosingPrice: number;
  HighPrice: number;
  LowPrice: number;
  VWAP: number;
  Volume: number;
  PreviousClose: number;
  Turnover: number;
  Trades: number;
  dates: string;
  companycode: number;
}

/**
 * Scrapes the full daily OHLCV trading history for one security from
 * open.mse.mn's "Арилжааны мэдээлэл" tab, which embeds the entire history
 * as a JSON blob in a `data-trading-histories` attribute.
 */
export async function fetchPriceHistory(
  companyCode: number,
): Promise<PricePoint[]> {
  const html = await fetchMseHtml(`/securities/${companyCode}/tab/tradeinfo`);
  const match = html.match(/data-trading-histories='(\[[\s\S]*?\])'/);
  if (!match) return [];

  const decoded = decode(match[1]);
  let rows: RawTradingHistory[];
  try {
    rows = JSON.parse(decoded);
  } catch {
    return [];
  }

  const byDate = new Map<string, PricePoint>();
  for (const row of rows) {
    if (!row.dates) continue;
    byDate.set(row.dates, {
      companyCode,
      date: row.dates,
      open: row.OpeningPrice ?? 0,
      close: row.ClosingPrice ?? 0,
      high: row.HighPrice ?? 0,
      low: row.LowPrice ?? 0,
      vwap: row.VWAP ?? row.ClosingPrice ?? 0,
      volume: row.Volume ?? 0,
      turnover: row.Turnover ?? 0,
      trades: row.Trades ?? 0,
      previousClose: row.PreviousClose ?? 0,
    });
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
}
