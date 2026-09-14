import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ORDER_MARKS,
  RANGES,
  USER_ROLES,
  labelOf,
  pick,
  rangeSince,
} from "./adminFilters";

test("a value not on the list is no filter rather than a query", () => {
  // It reaches a database query and a chip. `role=root` should show the whole
  // list, not an error and not an empty one.
  assert.equal(pick("root", USER_ROLES), "");
  assert.equal(pick("ADMIN", USER_ROLES), "");
  assert.equal(pick("admin", USER_ROLES), "admin");
});

test("the empty option is never something that can be asked for", () => {
  // "" is how the absence of a filter is spelled everywhere else, so a URL
  // carrying it must not come back looking like a chosen value.
  assert.equal(pick("", USER_ROLES), "");
  assert.equal(pick(undefined, USER_ROLES), "");
});

test("a repeated parameter is read as its first value", () => {
  assert.equal(pick(["admin", "user"], USER_ROLES), "admin");
});

test("surrounding space is not a different filter", () => {
  assert.equal(pick(" admin ", USER_ROLES), "admin");
});

test("a range turns into a date only when one was chosen", () => {
  assert.equal(rangeSince(""), undefined);
  assert.equal(rangeSince("0"), undefined);
  assert.equal(rangeSince("-7"), undefined);
  const week = rangeSince("7");
  assert.ok(week instanceof Date);
  const days = (Date.now() - week.getTime()) / 86_400_000;
  assert.ok(Math.abs(days - 7) < 0.01, `expected about seven days, got ${days}`);
});

test("every option is worded once, where the chips read it from", () => {
  // The chip and the control have to say the same thing; two spellings of
  // the same filter is a chip that lies about what the list is showing.
  assert.equal(labelOf(RANGES, "30"), "Сүүлийн 30 хоног");
  assert.equal(labelOf(ORDER_MARKS, "reversal"), "Буцаалт");
});

test("an unknown value still words itself rather than coming back blank", () => {
  // labelOf is only reached with values pick has already accepted, but a
  // chip with no text in it is unremovable — better the raw value.
  assert.equal(labelOf(USER_ROLES, "root"), "root");
});

test("no two options on a list share a value", () => {
  for (const list of [RANGES, USER_ROLES, ORDER_MARKS]) {
    assert.equal(new Set(list.map((o) => o.value)).size, list.length);
  }
});
