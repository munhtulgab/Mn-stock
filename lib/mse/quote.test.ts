import { strict as assert } from "node:assert";
import { test } from "node:test";
import { headingIsNewer, parseHeadingQuote } from "./quote";

/**
 * The exchange's own heading, as open.mse.mn serves it. Taken from the live
 * pages rather than written here: the gain carries no sign and the loss
 * does, which is the part a parser gets wrong.
 */
function heading(price: string, move: string, colour = "color-red"): string {
  return `<div class="pages-heading">
      <div class="pages-heading-left"><p>Нэр</p><h4>SYM</h4></div>
      <div class="pages-heading-right">
        <h3>${price}</h3>
        <h6 class=" ${colour} ">${move}</h6>
      </div>
    </div>`;
}

/** 2026-09-17 was a Thursday; 2026-09-19 a Saturday. */
const THURSDAY = new Date("2026-09-17T11:00:00Z");
const SATURDAY = new Date("2026-09-19T11:00:00Z");

test("a loss is read with its sign, and the previous close falls out of it", () => {
  // FTI on the evening of 2026-09-17, while its trading table still ended at
  // the previous session's 1,022.
  assert.deepEqual(parseHeadingQuote(heading("1019₮", "-3 (-0.29%)")), {
    price: 1019,
    change: -3,
    changePct: -0.29,
    previousClose: 1022,
  });
});

test("a gain is printed without a sign and is still a gain", () => {
  assert.deepEqual(
    parseHeadingQuote(heading("5015₮", "15 (0.3%)", "color-green")),
    { price: 5015, change: 15, changePct: 0.3, previousClose: 5000 },
  );
});

test("four and five figures alike, with no separator to strip", () => {
  const found = parseHeadingQuote(heading("59500₮", "1300 (2.23%)", "color-green"));
  assert.equal(found?.price, 59500);
  assert.equal(found?.previousClose, 58200);
});

test("a security that has never traded is heading a page with no price", () => {
  // It reads 0₮ / 0 (0%), which is the absence of a price rather than one.
  assert.equal(parseHeadingQuote(heading("0₮", "0 (0%)", "color-black")), null);
});

test("a page without the heading block yields nothing rather than a guess", () => {
  assert.equal(parseHeadingQuote("<html><body><h3>1019₮</h3></body></html>"), null);
});

test("the heading counts as newer when its previous close is what is stored", () => {
  // The whole basis for dating it: the exchange is measuring against the
  // session already on file, so this is the one after it — today's.
  const quote = parseHeadingQuote(heading("1019₮", "-3 (-0.29%)"));
  assert.equal(headingIsNewer(quote, 1022, THURSDAY), true);
});

test("a heading that measures against something else is left alone", () => {
  // Two sessions behind, or a history that has moved on: either way the
  // relationship is unknown and a stored close beats a guess.
  const quote = parseHeadingQuote(heading("1019₮", "-3 (-0.29%)"));
  assert.equal(headingIsNewer(quote, 1030, THURSDAY), false);
});

test("a heading the history already carries adds nothing", () => {
  const quote = parseHeadingQuote(heading("1022₮", "0 (0%)", "color-black"));
  assert.equal(headingIsNewer(quote, 1022, THURSDAY), false);
});

test("on a weekend an unpublished session is Friday's, so it is not stamped", () => {
  // Nothing trades on Saturday. Dating Friday's price as Saturday would put
  // the wrong day under it, which is the one thing the stored close does not.
  const quote = parseHeadingQuote(heading("1019₮", "-3 (-0.29%)"));
  assert.equal(headingIsNewer(quote, 1022, SATURDAY), false);
});

test("with nothing stored there is nothing to measure against", () => {
  const quote = parseHeadingQuote(heading("1019₮", "-3 (-0.29%)"));
  assert.equal(headingIsNewer(quote, null, THURSDAY), false);
});
