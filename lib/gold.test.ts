import { test } from "node:test";
import assert from "node:assert/strict";
import { alignByDate, parseGoldRows } from "./gold";

/** A page of the bank's answer, shaped as it really comes back. */
const PAYLOAD = {
  success: true,
  data: [
    { RATE_DATE: "2026-09-10", GOLD_BUY: "510,096.92", SILVER_BUY: "7,427.38" },
    { RATE_DATE: "2026-09-11", GOLD_BUY: "504,401.92", SILVER_BUY: "7,364.69" },
  ],
};

test("a price with thousands separators is a number, over a hundred", () => {
  assert.deepEqual(parseGoldRows(PAYLOAD), [
    { date: "2026-09-10", price: 5100.9692 },
    { date: "2026-09-11", price: 5044.0192 },
  ]);
});

test("the failure the endpoint answers with a 200 yields nothing", () => {
  // Sent the parameters in the body rather than the query string, the site
  // returns success:false and a sentence where the rows should be.
  assert.deepEqual(
    parseGoldRows({ success: false, data: "Тохирох үр дүн олдсонгүй." }),
    [],
  );
  assert.deepEqual(parseGoldRows(null), []);
  assert.deepEqual(parseGoldRows({}), []);
});

test("a row without a usable date or price is skipped, not zeroed", () => {
  assert.deepEqual(
    parseGoldRows({
      data: [
        { RATE_DATE: "", GOLD_BUY: "500,000" },
        { RATE_DATE: "2026-09-10", GOLD_BUY: "" },
        { RATE_DATE: "2026-09-10", GOLD_BUY: "-1" },
        { RATE_DATE: "2026-09-11", GOLD_BUY: "504,401.92" },
      ],
    }),
    [{ date: "2026-09-11", price: 5044.0192 }],
  );
});

test("a restated day is kept once, at its later figure", () => {
  assert.deepEqual(
    parseGoldRows({
      data: [
        { RATE_DATE: "2026-09-10", GOLD_BUY: "500,000" },
        { RATE_DATE: "2026-09-10", GOLD_BUY: "510,000" },
      ],
    }),
    [{ date: "2026-09-10", price: 5100 }],
  );
});

test("rows come back oldest first whatever order they arrived in", () => {
  const parsed = parseGoldRows({
    data: [
      { RATE_DATE: "2026-09-11", GOLD_BUY: "2" },
      { RATE_DATE: "2026-09-09", GOLD_BUY: "1" },
      { RATE_DATE: "2026-09-10", GOLD_BUY: "3" },
    ],
  });
  assert.deepEqual(
    parsed.map((p) => p.date),
    ["2026-09-09", "2026-09-10", "2026-09-11"],
  );
});

const POINTS = [
  { date: "2026-09-07", price: 100 },
  { date: "2026-09-08", price: 110 },
  { date: "2026-09-11", price: 120 },
];

test("a bar takes the last value quoted on or before its own day", () => {
  // The 9th and 10th are unquoted; the 12th is a Saturday the bank skipped.
  assert.deepEqual(
    alignByDate(
      [{ date: "2026-09-08" }, { date: "2026-09-10" }, { date: "2026-09-12" }],
      POINTS,
      "gold",
    ),
    [
      { date: "2026-09-08", gold: 110 },
      { date: "2026-09-10", gold: 110 },
      { date: "2026-09-12", gold: 120 },
    ],
  );
});

test("rows before the other series begins are left without one", () => {
  assert.deepEqual(
    alignByDate([{ date: "2026-09-01" }, { date: "2026-09-07" }], POINTS, "gold"),
    [{ date: "2026-09-01" }, { date: "2026-09-07", gold: 100 }],
  );
});

test("it joins the other way too, which is the gold view", () => {
  // The metal is the spine and the fund, listed late, is attached to it.
  const spine = [{ date: "2009-01-02" }, { date: "2026-05-14" }, { date: "2026-09-11" }];
  assert.deepEqual(
    alignByDate(spine, [{ date: "2026-05-14", price: 5000 }], "close"),
    [
      { date: "2009-01-02" },
      { date: "2026-05-14", close: 5000 },
      { date: "2026-09-11", close: 5000 },
    ],
  );
});

test("no series means the rows are handed back untouched", () => {
  const rows = [{ date: "2026-09-08", close: 5 }];
  assert.equal(alignByDate(rows, null, "gold"), rows);
  assert.equal(alignByDate(rows, [], "gold"), rows);
});

test("the walk is monotonic, so a long chart is one pass", () => {
  const points = Array.from({ length: 500 }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    price: i,
  }));
  assert.equal(alignByDate([{ date: "2026-01-28" }], points, "gold")[0].gold, 499);
});
