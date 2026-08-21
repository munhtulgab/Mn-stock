import assert from "node:assert/strict";
import { test } from "node:test";
import { perShare } from "./dividends";

/**
 * Reading a figure out of a sentence.
 *
 * Every number on the dividend card comes through here, so a wording this
 * misses is a year that silently disappears from a company's history — which
 * is what happened to Хаан банк, whose notices were being read as containing
 * no figure at all.
 */

test("the plain wording", () => {
  assert.equal(perShare("нэгж хувьцаанд 692 төгрөгийн ногдол ашиг хуваарилна"), 692);
  assert.equal(perShare("нэгж хувьцаанд 2.49 төгрөгөөр тооцож"), 2.49);
});

test("words between the phrase and the figure", () => {
  // Хаан банк's wording, and the reason it showed one year of a history it
  // has been adding to since it listed.
  assert.equal(perShare("Нэгж хувьцаа тус бүрд 141.73 төгрөгөөр тооцож ногдол ашгийг хуваарилна."), 141.73);
  assert.equal(perShare("нэгж хувьцаа тутамд 80 төгрөг"), 80);
  assert.equal(perShare("нэгж хувьцаанд ногдох 12.5 төгрөг"), 12.5);
});

test("a figure spelled out after the digits", () => {
  assert.equal(perShare("нэгж хувьцаанд 500 (Таван зуу) төгрөгөөр"), 500);
});

test("a comma is a thousands separator only where it can be one", () => {
  assert.equal(perShare("нэгж хувьцаанд 4,400 төгрөг"), 4400);
  // A fifth of a tugrik, not two hundred and twenty-six.
  assert.equal(perShare("нэгж хувьцаанд 0,226 төгрөг буюу нийт 250,000,000"), 0.226);
});

test("the total paid out is not the per-share figure", () => {
  // A notice states both, and picking the wrong one is a dividend a thousand
  // times too large.
  assert.equal(
    perShare("нийт 5,400,000,000 төгрөгийн ногдол ашгийг нэгж хувьцаанд 70 төгрөгөөр тооцов"),
    70,
  );
});

test("a sentence that only mentions a share is not a declaration", () => {
  assert.equal(perShare("хувьцаа эзэмшигчдэд 250,000,000 төгрөг"), null);
  assert.equal(perShare("ногдол ашиг тараахаар боллоо"), null);
});
