import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseGolomtStatements } from "./golomt";
import { StatementError, positionsFrom } from "@/lib/statementImport";

const HEADER =
  "Хэвлэгдсэн огноо: 2026-08-15 13:33:18 Харилцагч:ТУРШИЛТ " +
  "Голомт Капитал ҮЦК Харилцагчийн үнэт цаасны гүйлгээний түүх " +
  "№ Огноо Нэр Симбол ҮЦТХТ код Эхний үлдэгдэл Орлого Зарлага Эцсийн үлдэгдэл " +
  "Үнэ Нийт дүн Шимтгэл Гүйлгээний утга ";

/**
 * A row as the statement writes one. `opening` is not passed in because the
 * statement does not really carry it — it is derived from the closing balance
 * and the fill, which is the whole quirk this parser exists to survive.
 */
function row(
  n: number,
  date: string,
  name: string,
  symbol: string,
  code: number,
  closing: number,
  inn: number,
  out: number,
  price: number,
  total: number,
  fee: number,
): string {
  const f = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2 });
  const opening = closing - inn + out;
  return (
    `${n} ${date} ${name} ${symbol} ${code} ${f(opening)} ${f(inn)} ${f(out)} ` +
    `${f(closing)} ${f(price)} ${f(total)} ${f(fee)} ${symbol}- Худалдан авсан - ${date} `
  );
}

test("a plain statement reads as its fills", () => {
  const text =
    HEADER +
    row(1, "2022-06-08", "Түмэн Шувуут ХК", "TUM", 549, 50, 50, 0, 440.01, 22_220.51, 220.01) +
    row(2, "2022-06-08", "АПУ ХК", "APU", 90, 50, 50, 0, 1354, 68_377, 677);

  const { fills, reconciledDays, from, to } = parseGolomtStatements([text]);
  assert.equal(fills.length, 2);
  assert.equal(reconciledDays, 2);
  assert.equal(from, "2022-06-08");
  assert.equal(to, "2022-06-08");
  assert.deepEqual(fills[0], {
    date: "2022-06-08",
    symbol: "TUM",
    companyCode: 549,
    side: "BUY",
    quantity: 50,
    price: 440.01,
    settled: 22_220.51,
    fee: 220.01,
  });
});

test("three fills of one company on one day add up, whatever their openings say", () => {
  // The statement's own numbers for 2022-07-26: each row's opening is the
  // day's close minus that row's fill, so following them lands at 140 from
  // three different places. The fills are 40 + 50 + 50, from nothing.
  const text =
    HEADER +
    row(1, "2022-07-26", "Монос Хүнс ХК", "MFC", 551, 140, 40, 0, 114, 4_605.6, 45.6) +
    row(2, "2022-07-26", "Говь ХК", "GOV", 354, 10, 10, 0, 270, 2_727, 27) +
    row(3, "2022-07-26", "Монос Хүнс ХК", "MFC", 551, 140, 50, 0, 114, 5_757, 57) +
    row(4, "2022-07-26", "Монос Хүнс ХК", "MFC", 551, 140, 50, 0, 114, 5_757, 57);

  const { fills } = parseGolomtStatements([text]);
  const mfc = fills.filter((f) => f.symbol === "MFC");
  assert.equal(mfc.length, 3);
  assert.equal(
    mfc.reduce((sum, f) => sum + f.quantity, 0),
    140,
  );
});

test("a company's day-end is found past the other companies' rows", () => {
  // The MFC rows above are interleaved with GOV. Reconciling on "the next row
  // is a different company" would check MFC against the broker after its
  // first fill of the day and fail on the other two.
  const text =
    HEADER +
    row(1, "2024-05-06", "Дархан Нэхий ХК", "NEH", 71, 2040, 2040, 0, 17.5, 36_057, 357) +
    row(2, "2024-05-08", "Дархан Нэхий ХК", "NEH", 71, 2060, 6, 0, 17.77, 107.69, 1.06) +
    row(3, "2024-05-08", "АПУ ХК", "APU", 90, 20, 20, 0, 1000, 20_200, 200) +
    row(4, "2024-05-08", "Дархан Нэхий ХК", "NEH", 71, 2060, 14, 0, 17.8, 251.69, 2.49);

  const { fills, reconciledDays } = parseGolomtStatements([text]);
  assert.equal(fills.filter((f) => f.symbol === "NEH").length, 3);
  // NEH on the 6th, NEH on the 8th, APU on the 8th — the second NEH row is
  // not a day-end and the third one is, two rows later.
  assert.equal(reconciledDays, 3);
  assert.equal(positionsFrom(fills).find((p) => p.symbol === "NEH")!.quantity, 2060);
});

test("a sale is read as one", () => {
  const text =
    HEADER +
    row(1, "2026-08-01", "Говь ХК", "GOV", 354, 1198, 1198, 0, 250, 299_500, 2_995) +
    row(2, "2026-08-04", "Говь ХК", "GOV", 354, 0, 0, 1198, 281, 336_638, 3_366);

  const { fills } = parseGolomtStatements([text]);
  assert.equal(fills[1].side, "SELL");
  assert.equal(fills[1].quantity, 1198);
  assert.deepEqual(positionsFrom(fills), []);
});

test("shares transferred in at no price still count", () => {
  const text =
    HEADER +
    row(1, "2023-01-09", "Эрдэнэс Таван Толгой", "ETT", 535, 1072, 1072, 0, 0, 0, 0);
  const { fills } = parseGolomtStatements([text]);
  assert.equal(fills[0].quantity, 1072);
  assert.equal(fills[0].price, 0);
});

test("two statements covering the same days are refused", () => {
  // Importing both would count every shared fill twice, and the running
  // balance would be wrong by exactly the overlap.
  const one = HEADER + row(1, "2024-01-05", "АПУ ХК", "APU", 90, 100, 100, 0, 1000, 101_000, 1000);
  const two = HEADER + row(1, "2024-01-05", "АПУ ХК", "APU", 90, 100, 100, 0, 1000, 101_000, 1000);
  assert.throws(() => parseGolomtStatements([one, two]), StatementError);
});

test("statements in any order read as one history", () => {
  const early = HEADER + row(1, "2022-06-08", "АПУ ХК", "APU", 90, 50, 50, 0, 1354, 68_377, 677);
  const late = HEADER + row(1, "2023-06-02", "АПУ ХК", "APU", 90, 75, 25, 0, 1293, 32_648, 323);
  const { fills, from, to } = parseGolomtStatements([late, early]);
  assert.equal(from, "2022-06-08");
  assert.equal(to, "2023-06-02");
  assert.equal(fills[0].date, "2022-06-08");
});

test("a statement missing a period is caught, not silently believed", () => {
  // 2023's rows say the account already held 75 by then, which the 2022 rows
  // do not account for: a statement is missing between them.
  const early = HEADER + row(1, "2022-06-08", "АПУ ХК", "APU", 90, 50, 50, 0, 1354, 68_377, 677);
  const late = HEADER + row(1, "2023-06-02", "АПУ ХК", "APU", 90, 100, 25, 0, 1293, 32_648, 323);
  assert.throws(
    () => parseGolomtStatements([early, late]),
    (err: Error) => err instanceof StatementError && /дутуу|давхардсан/.test(err.message),
  );
});

test("something that is not this statement is refused clearly", () => {
  assert.throws(
    () => parseGolomtStatements(["Энэ бол огт өөр баримт бичиг."]),
    (err: Error) => err instanceof StatementError && /хүснэгтийн толгой/.test(err.message),
  );
});

test("a statement whose opening column is a real running balance stops", () => {
  // If the broker ever fixes the column, reading it the old way would be
  // wrong in a way nothing else would catch.
  const text =
    HEADER +
    "1 2024-01-05 АПУ ХК APU 90 500.00 100.00 0.00 100.00 1,000.00 101,000.00 1,000.00 ";
  assert.throws(
    () => parseGolomtStatements([text]),
    (err: Error) => err instanceof StatementError && /бүтэц өөрчлөгдсөн/.test(err.message),
  );
});
