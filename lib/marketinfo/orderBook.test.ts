import assert from "node:assert/strict";
import { test } from "node:test";
import { __testing } from "./orderBook";

const { collapse, BID, ASK } = __testing;

/**
 * The feed lists one row per standing order. АПУ's book carried five of them
 * at 980 — sized 1, 31, 100, 10 and 8 — and a reader deciding whether their
 * order will fill wants the 150 standing there, not five rows to add up by
 * eye. These are that book, as the API returned it.
 */
const apu = [
  { mdEntryType: "0", mdEntryPx: 983, mdEntrySize: 100 },
  { mdEntryType: "0", mdEntryPx: 983, mdEntrySize: 116 },
  { mdEntryType: "0", mdEntryPx: 982, mdEntrySize: 100 },
  { mdEntryType: "0", mdEntryPx: 982, mdEntrySize: 49 },
  { mdEntryType: "0", mdEntryPx: 981, mdEntrySize: 1000 },
  { mdEntryType: "0", mdEntryPx: 980, mdEntrySize: 1 },
  { mdEntryType: "0", mdEntryPx: 980, mdEntrySize: 31 },
  { mdEntryType: "0", mdEntryPx: 980, mdEntrySize: 100 },
  { mdEntryType: "0", mdEntryPx: 980, mdEntrySize: 10 },
  { mdEntryType: "0", mdEntryPx: 980, mdEntrySize: 8 },
  { mdEntryType: "1", mdEntryPx: 984, mdEntrySize: 3434 },
  { mdEntryType: "1", mdEntryPx: 985, mdEntrySize: 9508 },
  { mdEntryType: "1", mdEntryPx: 988, mdEntrySize: 5282 },
  { mdEntryType: "1", mdEntryPx: 988, mdEntrySize: 196 },
];

test("orders at one price become one level, counted", () => {
  const bids = collapse(apu, BID);
  assert.deepEqual(bids[0], { price: 983, size: 216, orders: 2 });
  assert.deepEqual(bids.at(-1), { price: 980, size: 150, orders: 5 });
});

test("each side takes only its own entries", () => {
  assert.equal(collapse(apu, BID).length, 4);
  assert.equal(collapse(apu, ASK).length, 3);
  // A price on one side must not leak into the other's ladder.
  assert.ok(!collapse(apu, BID).some((l) => l.price >= 984));
  assert.ok(!collapse(apu, ASK).some((l) => l.price <= 983));
});

test("both sides lead with the order that fills next", () => {
  // Highest bid first, lowest offer first — the two meet at the spread.
  assert.deepEqual(
    collapse(apu, BID).map((l) => l.price),
    [983, 982, 981, 980],
  );
  assert.deepEqual(
    collapse(apu, ASK).map((l) => l.price),
    [984, 985, 988],
  );
});

test("rows without a usable price or size are dropped", () => {
  const messy = [
    { mdEntryType: "0", mdEntryPx: 100, mdEntrySize: 5 },
    { mdEntryType: "0", mdEntryPx: 0, mdEntrySize: 5 },
    { mdEntryType: "0", mdEntryPx: 99, mdEntrySize: 0 },
    { mdEntryType: "0", mdEntryPx: null, mdEntrySize: 5 },
    { mdEntryType: "0", mdEntrySize: 5 },
  ];
  assert.deepEqual(collapse(messy, BID), [{ price: 100, size: 5, orders: 1 }]);
});

test("the side is matched as the feed writes it, string or number", () => {
  // Observed as strings — "0" and "1" — but a JSON number would be the same
  // entry type and must not silently produce an empty ladder.
  const numeric = [{ mdEntryType: 0, mdEntryPx: 500, mdEntrySize: 7 }];
  assert.deepEqual(collapse(numeric, BID), [{ price: 500, size: 7, orders: 1 }]);
});

test("an empty book is an empty ladder, not a throw", () => {
  assert.deepEqual(collapse([], BID), []);
});
