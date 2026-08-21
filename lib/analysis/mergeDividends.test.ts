import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeDividends } from "./report";
import type { Dividend } from "@/lib/dividends";
import type { TdbDividend } from "@/lib/tdb/datalab";

/**
 * Two dividend histories into one table.
 *
 * They cover different companies and different years, and where they overlap
 * they sometimes differ. Which one wins is not a matter of taste: a notice
 * total is built by pulling a number out of a sentence and can come up short
 * when a declaration's standfirst gives a payment date and no figure, while
 * Datalab's is computed from the filings and cannot come up long.
 */

function notice(year: number, amount: number): Dividend {
  return {
    year,
    amount,
    payments: 1,
    yieldPct: null,
    url: `https://mse.mn/news/${year}`,
    date: `${year}-02-14`,
  };
}

function datalab(year: number, amountPerShare: number): TdbDividend {
  return { year, amountPerShare, totalPaid: null, yieldPct: null, payoutRatio: 40 };
}

test("a company Datalab does not cover keeps every year the notices found", () => {
  // Хаан банк: Datalab has no dividend for any bank, so the notices are the
  // whole history and dropping them would empty the card.
  const rows = mergeDividends([notice(2026, 214), notice(2025, 195.35), notice(2024, 141.73)], [], null);
  assert.deepEqual(rows.map((r) => r.year), [2026, 2025, 2024]);
  assert.equal(rows[0].amount, 214);
  assert.equal(rows[0].source, "mse");
});

test("Datalab supplies the years no notice survives for", () => {
  const rows = mergeDividends([], [datalab(2019, 46), datalab(2018, 10)], null);
  assert.deepEqual(rows.map((r) => r.year), [2019, 2018]);
  assert.equal(rows[0].source, "tdb");
  assert.equal(rows[0].url, null);
});

test("where both have a year, the figure is Datalab's", () => {
  // АПУ 2025: the notices total 65₮ because the July declaration states a
  // payment date and no amount. Datalab has the year's 130. Taking the
  // notice's figure — which is what this used to do — halves a real dividend.
  const rows = mergeDividends([notice(2025, 65)], [datalab(2025, 130)], null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 130);
});

test("but the announcement's date and link survive it", () => {
  // The link is the one thing only the exchange has, and it is what lets a
  // reader check a figure rather than take it on trust.
  const rows = mergeDividends([notice(2025, 65)], [datalab(2025, 130)], null);
  assert.equal(rows[0].date, "2025-02-14");
  assert.equal(rows[0].url, "https://mse.mn/news/2025");
  assert.equal(rows[0].source, "mse");
  assert.equal(rows[0].payoutRatio, 40);
});

test("a yield Datalab does not state is worked out from today's price", () => {
  const rows = mergeDividends([], [{ ...datalab(2025, 50), yieldPct: null }], 1000);
  assert.equal(rows[0].yieldPct, 5);
  assert.equal(mergeDividends([], [{ ...datalab(2025, 50), yieldPct: null }], null)[0].yieldPct, null);
});

test("the whole run comes back, newest first and nothing truncated", () => {
  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const rows = mergeDividends(
    years.map((y) => notice(y, 10)),
    years.map((y) => datalab(y, 20)),
    null,
  );
  assert.deepEqual(rows.map((r) => r.year), [...years].reverse());
});
