import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./data";
import type { PricePoint, Security } from "./types";
import type { CombinedSignal } from "./analysis/signal";

const { buildRow } = __testing;

/**
 * A row's verdict comes from the combined analysis and from nowhere else.
 *
 * It used to fall back to the older single-company rule engine wherever that
 * analysis was missing, and the notifier compares this field. So a run where
 * the analysis failed announced the other engine's opinion of the whole
 * market: TGI went out as АВАХ while its own page read ХҮЛЭЭХ on a score of
 * 2, alongside forty-six more.
 */

const security = {
  symbol: "TGI",
  name: "Тэнгэр Даатгал ХК",
  classification: "Хувьцаа",
  companyCode: 400,
} as unknown as Security;

const prices: PricePoint[] = [
  { companyCode: 400, date: "2026-08-12", open: 790, high: 795, low: 780, close: 790, volume: 10 },
  { companyCode: 400, date: "2026-08-13", open: 790, high: 792, low: 775, close: 781, volume: 12 },
] as PricePoint[];

const combined = { signal: "HOLD", score: 2 } as CombinedSignal;

test("the row reports the combined verdict when there is one", () => {
  const row = buildRow(security, prices, combined);
  assert.equal(row.signal, "HOLD");
  assert.equal(row.score, 2);
});

test("no combined verdict is no verdict, not another engine's", () => {
  const row = buildRow(security, prices, undefined);
  assert.equal(row.signal, null);
  assert.equal(row.score, null);
});

test("a row without a verdict still carries its price", () => {
  // The list is still worth drawing: only the verdict column goes blank.
  const row = buildRow(security, prices, undefined);
  assert.equal(row.lastPrice, 781);
  assert.equal(row.lastDate, "2026-08-13");
  assert.ok(row.sparkline.length > 0);
});
