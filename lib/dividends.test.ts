import assert from "node:assert/strict";
import { test } from "node:test";
import { estimatedDividend, perShare, profitYear } from "./dividends";

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

/**
 * Which year a declaration belongs to.
 *
 * The card was showing Хаан банк's 214₮ against 2026 when the notice says
 * "2025 ОНЫ ... ЦЭВЭР АШГААС", and АПУ's 2024 as 99₮ when the exchange
 * announced 55₮ and 65₮ for that year's two halves. Both came from counting
 * by the year a payment was made rather than the year it was earned.
 */

test("the year the headline states is the year", () => {
  assert.equal(
    profitYear('"ХААН БАНК" ХК 2025 ОНЫ ТАТВАРЫН ДАРААХ ЦЭВЭР АШГААС НОГДОЛ АШИГ ХУВААРИЛНА', "2026-02-23"),
    2025,
  );
  // Announced in the same year it was earned, on the first half's result.
  assert.equal(
    profitYear('"АПУ" ХК 2024 ОНЫ ЭХНИЙ ХАГАС ЖИЛИЙН ЦЭВЭР АШГААС НОГДОЛ АШИГ ХУВААРИЛНА', "2024-08-02"),
    2024,
  );
  // And the second half's, announced the February after.
  assert.equal(
    profitYear('"АПУ" ХК 2024 ОНЫ ХОЁРДУГААР ХАГАС ЖИЛИЙН ЦЭВЭР АШГААС НОГДОЛ АШИГ ХУВААРИЛНА', "2025-02-11"),
    2024,
  );
});

test("a headline naming no year is dated by the half it appeared in", () => {
  // The exchange's older wording. A February notice distributes the year just
  // closed; an August one is an interim on the year running.
  assert.equal(profitYear('"АПУ" ХК НОГДОЛ АШИГ ТАРААХААР БОЛЛОО', "2018-02-20"), 2017);
  assert.equal(profitYear('"АПУ" ХК ХАГАС ЖИЛИЙН ЦЭВЭР АШГААС НОГДОЛ АШИГ ХУВААРИЛНА', "2020-08-18"), 2020);
  // June is still the first half; July is not.
  assert.equal(profitYear("НОГДОЛ АШИГ ТАРААХААР БОЛЛОО", "2021-06-30"), 2020);
  assert.equal(profitYear("НОГДОЛ АШИГ ТАРААХААР БОЛЛОО", "2021-07-01"), 2021);
});

test("the year is not taken from the payment date in the standfirst", () => {
  // Only the headline is read. A notice's body routinely names the date the
  // money must reach shareholders — "2026 оны 12 дугаар сарын 31-ний өдрийн
  // дотор" — and that is a deadline, not a financial year.
  assert.equal(
    profitYear('"АПУ" ХК 2026 ОНЫ ЭХНИЙ ХАГАС ЖИЛИЙН САНХҮҮГИЙН ҮР ДҮНГ ХАРГАЛЗАЖ НОГДОЛ АШИГ ХУВААРИЛНА', "2026-08-19"),
    2026,
  );
});

/* -------------------------------------------------------------------------
   Half the earnings, where a year carries no declaration.

   A figure in brackets on a card people make decisions from, so what it
   refuses to answer matters as much as what it works out.
   ------------------------------------------------------------------------- */

const filing = (
  eps: number | null,
  netProfit: number | null,
  sharesOutstanding: number | null,
) => ({ eps, netProfit, sharesOutstanding });

test("half the filed EPS, and the yield against the price", () => {
  const estimate = estimatedDividend(filing(120, 12_000_000, 100_000), 1_000);
  assert.equal(estimate?.amount, 60);
  assert.equal(estimate?.yieldPct, 6);
});

test("EPS is preferred, because it is the figure printed on the same card", () => {
  // Profit over shares would give 200; the filing's own ratio says 120, and
  // a reader halving what they can see should land where the app did.
  const estimate = estimatedDividend(filing(120, 20_000_000, 100_000), null);
  assert.equal(estimate?.amount, 60);
});

test("profit over shares where the filing carries no EPS", () => {
  const estimate = estimatedDividend(filing(null, 20_000_000, 100_000), null);
  assert.equal(estimate?.amount, 100);
});

test("a loss estimates nothing, whatever the ratios say", () => {
  assert.equal(estimatedDividend(filing(null, -5_000_000, 100_000), 1_000), null);
  // Including when a stale EPS on the same filing is still positive.
  assert.equal(estimatedDividend(filing(120, -5_000_000, 100_000), 1_000), null);
});

test("a break-even year estimates nothing either", () => {
  assert.equal(estimatedDividend(filing(0, 0, 100_000), 1_000), null);
});

test("no earnings figure at all, no estimate", () => {
  assert.equal(estimatedDividend(filing(null, null, 100_000), 1_000), null);
  assert.equal(estimatedDividend(filing(null, 20_000_000, null), 1_000), null);
  assert.equal(estimatedDividend(filing(null, 20_000_000, 0), 1_000), null);
});

test("no price is an amount without a yield, not no amount", () => {
  const estimate = estimatedDividend(filing(120, 12_000_000, 100_000), null);
  assert.equal(estimate?.amount, 60);
  assert.equal(estimate?.yieldPct, null);
});
