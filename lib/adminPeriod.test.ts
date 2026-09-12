import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PERIOD_DAYS, PERIODS, periodFrom, periodHref } from "./adminPeriod";

test("a listed window is honoured", () => {
  for (const p of PERIODS) {
    assert.equal(periodFrom(String(p.days)), p.days);
  }
});

test("anything else falls back to the default", () => {
  for (const bad of [undefined, "", "0", "-7", "8", "99999", "abc", "7.5", "1e3"]) {
    assert.equal(periodFrom(bad), DEFAULT_PERIOD_DAYS, `for ${JSON.stringify(bad)}`);
  }
});

test("a repeated parameter takes the first", () => {
  assert.equal(periodFrom(["30", "90"]), 30);
});

test("the default window is the absence of the parameter", () => {
  assert.equal(periodHref(7), "/admin");
  assert.equal(periodHref(30), "/admin?days=30");
});

test("it drops the parameter rather than setting it back to the default", () => {
  const from30 = new URLSearchParams("days=30");
  assert.equal(periodHref(7, from30), "/admin");
});

test("other parameters survive the change", () => {
  const params = new URLSearchParams("days=30&q=bataa");
  assert.equal(periodHref(90, params), "/admin?days=90&q=bataa");
  assert.equal(periodHref(7, params), "/admin?q=bataa");
});

test("every href it produces parses back to the window it was made for", () => {
  for (const p of PERIODS) {
    const href = periodHref(p.days);
    const query = new URLSearchParams(href.split("?")[1] ?? "");
    assert.equal(periodFrom(query.get("days") ?? undefined), p.days);
  }
});
