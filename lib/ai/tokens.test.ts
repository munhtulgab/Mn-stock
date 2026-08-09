import assert from "node:assert/strict";
import { test } from "node:test";
import { estimateTokens } from "./tokens";

/**
 * The figures below are cl100k_base's own counts, measured once and written
 * down here. The estimate has one job — never to come in under what a
 * provider will actually charge — because a budget that guesses low sends a
 * request that is refused outright, which is exactly how Groq broke.
 */

test("Mongolian Cyrillic is never counted as cheap as English", () => {
  const mongolian = "Монголын хөрөнгийн бирж дээр өнөөдөр арилжаа идэвхтэй болов. ".repeat(30);
  // cl100k: 1561 tokens for 1830 characters — 1.33 per token, not the 2.0
  // the old character budget assumed.
  assert.ok(estimateTokens(mongolian) >= 1561, "must not undercount Mongolian");
  // A page of English of the same length must be counted as costing less.
  const english = "The Mongolian Stock Exchange traded actively today. ".repeat(36);
  assert.ok(estimateTokens(english) < estimateTokens(mongolian));
});

test("JSON punctuation is not counted as prose", () => {
  const json = JSON.stringify({ rsi: 55.82, macd: 2.46, ma50: 956.86 }).repeat(20);
  // cl100k charges 440 for this; anything less would overfill the request.
  assert.ok(estimateTokens(json) >= 440, "must not undercount JSON");
});

test("a label-and-verdict payload, which is what the analysis is", () => {
  const mixed = JSON.stringify({
    "RSI(14)": "55.82 · NEUTRAL",
    note: "Индикатор бүрийн ард гарсан дүгнэлт",
  }).repeat(15);
  assert.ok(estimateTokens(mixed) >= 660);
});

test("empty and ASCII-only text", () => {
  assert.equal(estimateTokens(""), 0);
  assert.ok(estimateTokens("abc") >= 1);
});
