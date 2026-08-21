import assert from "node:assert/strict";
import { test } from "node:test";
import { sortHoldings, type HoldingView } from "./holdings";
import { distinctColors } from "./symbolColor";

/**
 * The two questions a list of holdings gets asked.
 *
 * "Where is my money?" and "what is working?" have different answers, and a
 * portfolio that can only be read in size order never answers the second: the
 * best performer is usually a small position, sitting at the bottom under
 * larger ones that have gone nowhere.
 */

function holding(symbol: string, marketValue: number, gainLoss: number): HoldingView {
  return {
    companyCode: 1,
    symbol,
    name: symbol,
    quantity: 1,
    avgCost: 1,
    currentPrice: 1,
    marketValue,
    costBasis: marketValue - gainLoss,
    gainLoss,
    gainLossPct: null,
  };
}

// A big holding that has barely moved, a small one that has doubled, and one
// that is down.
const HOLDINGS = [
  holding("KHAN", 778_346, 64_922),
  holding("APU", 1_555_421, 171_595),
  holding("TCK", 96_181, 23_864),
  holding("NEH", 249_986, -22_034),
];

const order = (rows: HoldingView[]) => rows.map((h) => h.symbol).join(" ");

test("by value, largest first", () => {
  assert.equal(order(sortHoldings(HOLDINGS, "value", true)), "APU KHAN NEH TCK");
});

test("by gain, most made first", () => {
  // Not the same order: ТАХЬ has made more than Нэйшнл has lost, and moves up
  // past it despite being the smallest position on the list.
  assert.equal(order(sortHoldings(HOLDINGS, "gain", true)), "APU KHAN TCK NEH");
});

test("reversed, the loss comes to the top", () => {
  // Which is the point of letting the direction turn: the position that has
  // lost the most is the one worth looking at, and it is otherwise last.
  assert.equal(order(sortHoldings(HOLDINGS, "gain", false)), "NEH TCK KHAN APU");
  assert.equal(order(sortHoldings(HOLDINGS, "value", false)), "TCK NEH KHAN APU");
});

test("sorting does not disturb what it was given", () => {
  const before = order(HOLDINGS);
  sortHoldings(HOLDINGS, "gain", true);
  assert.equal(order(HOLDINGS), before);
});

test("nothing held sorts to nothing rather than throwing", () => {
  assert.deepEqual(sortHoldings([], "value", true), []);
});

/**
 * A pie needs colours that differ; an avatar only needs one that is stable.
 * Hashing eight tickers into eight colours collides about as often as not —
 * Хаан банк, MFC and Боди all came out the same green, and two neighbouring
 * slices in one colour read as a single larger slice.
 */
test("every symbol shown together gets its own colour", () => {
  const symbols = ["APU", "KHAN", "TUM", "MLG", "MFC", "NEH", "BODI", "TCK"];
  const colors = distinctColors(symbols);
  assert.equal(colors.size, symbols.length);
  assert.equal(new Set(colors.values()).size, symbols.length);
});

test("a symbol keeps its usual colour when nothing else has taken it", () => {
  const alone = distinctColors(["APU"]).get("APU");
  const crowded = distinctColors(["APU", "KHAN", "TUM"]).get("APU");
  assert.equal(crowded, alone);
});

test("more holdings than colours still gives every one a colour", () => {
  // Eight in the palette. Past that they repeat, which is honest — there is
  // nothing left to promise — but no holding may come back undefined.
  const many = Array.from({ length: 14 }, (_, i) => `SYM${i}`);
  const colors = distinctColors(many);
  assert.equal(colors.size, many.length);
  for (const symbol of many) assert.match(colors.get(symbol)!, /^#[0-9A-F]{6}$/i);
});
