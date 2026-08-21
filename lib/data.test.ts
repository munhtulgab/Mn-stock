import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing, tradedThisMonth, type DashboardRow } from "./data";
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

/**
 * What may be offered as a pick: something that has traded this month.
 *
 * The bound used to be forty-five days from the latest session, which in the
 * middle of a month reaches back into the one before it and lets a listing
 * last traded in July be ranked in the third week of August.
 */
const dated = (symbol: string, lastDate: string | null): DashboardRow =>
  ({ symbol, lastDate }) as DashboardRow;

test("this month is kept and last month is not", () => {
  const rows = [
    dated("A", "2026-08-01"),
    dated("B", "2026-08-20"),
    dated("C", "2026-07-31"),
    dated("D", "2026-06-15"),
  ];
  assert.deepEqual(
    tradedThisMonth(rows, "2026-08-20").map((r) => r.symbol),
    ["A", "B"],
  );
});

test("the first of the month is inside it", () => {
  // The boundary the string comparison turns on: `2026-08-01` is not before
  // `2026-08-01`, and a company that traded once on the 1st is a company that
  // has traded this month.
  assert.equal(tradedThisMonth([dated("A", "2026-08-01")], "2026-08-01").length, 1);
});

test("a row with no last trade is not a pick", () => {
  assert.deepEqual(tradedThisMonth([dated("A", null)], "2026-08-20"), []);
});

test("no session, no picks", () => {
  // Nothing to reckon a month from, and no basis for calling anything current.
  assert.deepEqual(tradedThisMonth([dated("A", "2026-08-20")], null), []);
});

test("the month comes from the session, not from the clock", () => {
  // The 1st, before anything has traded: the latest session is still July, so
  // July's trades are the current ones. Reckoned from the calendar instead,
  // the rule would ask for August trades on a day August has had none and the
  // section would disappear.
  assert.deepEqual(
    tradedThisMonth([dated("A", "2026-07-31"), dated("B", "2026-06-30")], "2026-07-31")
      .map((r) => r.symbol),
    ["A"],
  );
});
