import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bigMoves,
  followersFrom,
  moveKey,
  PRICE_ALERT_PCT,
} from "./personalAlerts";
import { visibleTo } from "./notifications";

/* ------------------------------------------------------------- followers */

test("a holder and a watcher of the same company are both told", () => {
  const f = followersFrom(
    [{ userId: "bat", companyCode: 1 }],
    [{ userId: "saraa", companyCode: 1 }],
  );
  assert.deepEqual([...f.get(1)!].sort(), [
    ["bat", "holds"],
    ["saraa", "watches"],
  ]);
});

test("holding outranks watching, whichever order they arrive in", () => {
  // The alert says which it is, and holding is the stronger reason.
  const a = followersFrom([{ userId: "bat", companyCode: 1 }], [{ userId: "bat", companyCode: 1 }]);
  assert.equal(a.get(1)!.get("bat"), "holds");
});

test("a company nobody follows has no one to tell", () => {
  const f = followersFrom([{ userId: "bat", companyCode: 1 }], []);
  assert.equal(f.get(2), undefined);
});

/* ------------------------------------------------------------ price moves */

const move = (changePct: number | null, extra = {}) => ({
  companyCode: 1,
  symbol: "APU",
  price: 1000,
  changePct,
  day: "2026-09-25",
  ...extra,
});

test("a move at the threshold counts, one just under it does not", () => {
  assert.equal(bigMoves([move(PRICE_ALERT_PCT)]).length, 1);
  assert.equal(bigMoves([move(-PRICE_ALERT_PCT)]).length, 1);
  assert.equal(bigMoves([move(PRICE_ALERT_PCT - 0.01)]).length, 0);
});

test("a move says which way it went", () => {
  assert.equal(bigMoves([move(6.2)])[0].direction, "up");
  assert.equal(bigMoves([move(-14.8)])[0].direction, "down");
});

test("no change, or a nonsense one, is not a move", () => {
  assert.equal(bigMoves([move(null), move(Number.NaN), move(0)]).length, 0);
});

test("one alert per company, per session, per direction", () => {
  const [up] = bigMoves([move(6)]);
  const [down] = bigMoves([move(-6)]);
  const [tomorrow] = bigMoves([move(6, { day: "2026-09-28" })]);
  const [other] = bigMoves([move(6, { companyCode: 2 })]);
  // The intraday check and the evening sync see the same move and share a key…
  assert.equal(moveKey(up), moveKey(bigMoves([move(8.5)])[0]));
  // …and a different day, direction or company is a different alert.
  assert.notEqual(moveKey(up), moveKey(down));
  assert.notEqual(moveKey(up), moveKey(tomorrow));
  assert.notEqual(moveKey(up), moveKey(other));
});

/* ------------------------------------------------------------------ feed */

test("a reader's feed is their own alerts plus the market's news", () => {
  // Not somebody else's, and not the old market-wide signal rows.
  assert.deepEqual(visibleTo("bat"), {
    $or: [{ userId: "bat" }, { userId: { $exists: false }, kind: "news" }],
  });
});
