import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseStatements } from "./brokerStatement";
import { StatementError, positionsFrom } from "@/lib/statementImport";

const COLUMNS =
  "№ Огноо Нэр Симбол ҮЦТХТ код Эхний үлдэгдэл Орлого Зарлага Эцсийн үлдэгдэл " +
  "Үнэ Нийт дүн Шимтгэл Гүйлгээний утга ";

const HEADER =
  "Хэвлэгдсэн огноо: 2026-08-15 13:33:18 Харилцагч:ТУРШИЛТ " +
  "Голомт Капитал ҮЦК Харилцагчийн үнэт цаасны гүйлгээний түүх " +
  COLUMNS;

/** Mandal's heading over the same table, laid out as its PDF extracts. */
const MANDAL =
  "Хэвлэгдсэн огноо: 2026-10-12 19:16:48\nХарилцагч:ТУРШИЛТ\n" +
  "Мандал Капитал Маркетс ҮЦК Харилцагчийн үнэт цаасны\nгүйлгээний түүх\n" +
  COLUMNS;

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

  const { broker, fills, reconciledDays, from, to } = parseStatements([text]);
  assert.equal(broker, "golomt");
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

  const { fills } = parseStatements([text]);
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

  const { fills, reconciledDays } = parseStatements([text]);
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

  const { fills } = parseStatements([text]);
  assert.equal(fills[1].side, "SELL");
  assert.equal(fills[1].quantity, 1198);
  assert.deepEqual(positionsFrom(fills), []);
});

test("shares transferred in at no price still count", () => {
  const text =
    HEADER +
    row(1, "2023-01-09", "Эрдэнэс Таван Толгой", "ETT", 535, 1072, 1072, 0, 0, 0, 0);
  const { fills } = parseStatements([text]);
  assert.equal(fills[0].quantity, 1072);
  assert.equal(fills[0].price, 0);
});

test("two statements covering the same days are refused", () => {
  // Importing both would count every shared fill twice, and the running
  // balance would be wrong by exactly the overlap.
  const one = HEADER + row(1, "2024-01-05", "АПУ ХК", "APU", 90, 100, 100, 0, 1000, 101_000, 1000);
  const two = HEADER + row(1, "2024-01-05", "АПУ ХК", "APU", 90, 100, 100, 0, 1000, 101_000, 1000);
  assert.throws(() => parseStatements([one, two]), StatementError);
});

test("statements in any order read as one history", () => {
  const early = HEADER + row(1, "2022-06-08", "АПУ ХК", "APU", 90, 50, 50, 0, 1354, 68_377, 677);
  const late = HEADER + row(1, "2023-06-02", "АПУ ХК", "APU", 90, 75, 25, 0, 1293, 32_648, 323);
  const { fills, from, to } = parseStatements([late, early]);
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
    () => parseStatements([early, late]),
    (err: Error) => err instanceof StatementError && /дутуу|давхардсан/.test(err.message),
  );
});

test("something that is not this statement is refused clearly", () => {
  assert.throws(
    () => parseStatements(["Энэ бол огт өөр баримт бичиг."]),
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
    () => parseStatements([text]),
    (err: Error) => err instanceof StatementError && /бүтэц өөрчлөгдсөн/.test(err.message),
  );
});

test("a statement that opens mid-life says what it opened holding", () => {
  // The 2026 statement on its own: the account already held APU when it
  // starts, and what was paid for those shares is in an earlier file.
  const text =
    HEADER +
    row(1, "2026-02-25", "АПУ ХК", "APU", 90, 1156, 50, 0, 900, 45_450, 450) +
    row(2, "2026-03-09", "АПУ ХК", "APU", 90, 1200, 44, 0, 910, 40_440, 400);

  const { carriedIn, reconciledDays } = parseStatements([text]);
  // 1,156 at the close of the first day, of which 50 were bought that day.
  assert.deepEqual(carriedIn, [{ symbol: "APU", quantity: 1106 }]);
  assert.equal(reconciledDays, 2);
});

test("a carried-in balance is read from the day, not from a row", () => {
  // Two fills on the opening day. Taking the first row's stated opening would
  // call it 1,150 carried in; the day bought 50 and 6, so it is 1,100.
  const text =
    HEADER +
    row(1, "2026-02-25", "АПУ ХК", "APU", 90, 1156, 50, 0, 900, 45_450, 450) +
    row(2, "2026-02-25", "АПУ ХК", "APU", 90, 1156, 6, 0, 900, 5_454, 54);

  const { carriedIn } = parseStatements([text]);
  assert.deepEqual(carriedIn, [{ symbol: "APU", quantity: 1100 }]);
});

test("a history that starts at zero carries nothing in", () => {
  const text =
    HEADER + row(1, "2022-06-08", "АПУ ХК", "APU", 90, 50, 50, 0, 1354, 68_377, 677);
  assert.deepEqual(parseStatements([text]).carriedIn, []);
});

/** NEH on Mandal's statement, as its PDF extracts it: name and description wrapped. */
function mandalNeh(n: number): string {
  return (
    `${n} 2024-04-30 ДАРХАН\nНЭХИЙ NEH 71 20.00 10.00 0.00 30.00 17.00 171.70 1.70 NEH-\n` +
    "Худалдан\nавсан -\n2024-04-30\n"
  );
}

/** Mandal's sale of MFG, with its total written however the PDF wraps it. */
function mandalMfgSale(total: string): string {
  return (
    "4 2024-08-07 Мандал\nИрээдүйн\nӨсөлт ХОС\nMFG 4002 55,210.00 0.00 55,210.00 0.00 " +
    `961.50 ${total} 530,844.15 MFG-\nХудалдсан -\n2024-08-07`
  );
}

test("a Mandal statement is read as Mandal's", () => {
  const text =
    MANDAL + mandalNeh(1) + mandalNeh(2) + mandalNeh(3) + mandalMfgSale("52,553,570\n.85");

  const { broker, fills, from, to, reconciledDays, carriedIn } = parseStatements([text]);
  assert.equal(broker, "mandal");
  assert.equal(fills.length, 4);
  assert.equal(from, "2024-04-30");
  assert.equal(to, "2024-08-07");
  // NEH on the 30th and MFG on the 7th, each checked against its close.
  assert.equal(reconciledDays, 2);

  // Three rows of 10 that each say 20 → 30 are three fills, from nothing: the
  // same report as Golomt's, read the same way.
  const neh = fills.filter((f) => f.symbol === "NEH");
  assert.equal(neh.length, 3);
  assert.equal(
    neh.reduce((sum, f) => sum + f.quantity, 0),
    30,
  );
  // MFG was held before the statement starts, and all of it was sold.
  assert.deepEqual(carriedIn, [{ symbol: "MFG", quantity: 55_210 }]);
});

test("a figure too wide for its column is read across the wrap", () => {
  // The PDF wraps a figure wherever the column runs out, so the break can
  // fall anywhere in it — before the point, after it, between the decimals.
  for (const total of [
    "52,553,570.85",
    "52,553,570\n.85",
    "52,553,\n570.85",
    "52,553,570.\n85",
    "52,553,570.8\n5",
  ]) {
    const [sale] = parseStatements([MANDAL + mandalMfgSale(total)]).fills;
    assert.deepEqual(
      sale,
      {
        date: "2024-08-07",
        symbol: "MFG",
        companyCode: 4002,
        side: "SELL",
        quantity: 55_210,
        price: 961.5,
        settled: 52_553_570.85,
        fee: 530_844.15,
      },
      JSON.stringify(total),
    );
  }
});

test("a date the column broke after a hyphen is still the date", () => {
  const text =
    MANDAL +
    "1 2024-04-\n30 ДАРХАН\nНЭХИЙ NEH 71 0.00 30.00 0.00 30.00 17.00 515.10 5.10 NEH-\n" +
    "Худалдан\nавсан -\n2024-04-30";
  const [fill] = parseStatements([text]).fills;
  assert.equal(fill.date, "2024-04-30");
  assert.equal(fill.quantity, 30);
});

test("a row it cannot read stops the import instead of going missing", () => {
  // The sale with its commission left out. Unread, it would simply not be in
  // the history, and the shares it sold would still be in the portfolio.
  const text = MANDAL + mandalNeh(1) + mandalMfgSale("52,553,570.85").replace(" 530,844.15", "");
  assert.throws(
    () => parseStatements([text]),
    (err: Error) =>
      err instanceof StatementError && /2024-08-07-ны мөрийг уншиж чадсангүй/.test(err.message),
  );
});

test("a row that is not a company's is left out as before, not called unreadable", () => {
  // A bond's code is no ticker. The app carries no bonds, so the row is not
  // read — and not mistaken for a company row that failed to read.
  const text =
    HEADER +
    row(1, "2024-05-06", "Дархан Нэхий ХК", "NEH", 71, 2040, 2040, 0, 17.5, 36_057, 357) +
    "2 2024-05-07 Хөгжлийн банк MDB-B-25 9001 0.00 10.00 0.00 10.00 100,000.00 1,000,000.00 0.00 " +
    "Худалдан авсан - 2024-05-07 ";
  assert.equal(parseStatements([text]).fills.length, 1);
});

test("two brokers' statements go in one broker at a time", () => {
  const golomt =
    HEADER + row(1, "2024-05-06", "Дархан Нэхий ХК", "NEH", 71, 2040, 2040, 0, 17.5, 36_057, 357);
  const mandal = MANDAL + mandalNeh(1) + mandalNeh(2) + mandalNeh(3);
  assert.throws(
    () => parseStatements([golomt, mandal]),
    (err: Error) => err instanceof StatementError && /тус тусад нь/.test(err.message),
  );
});

test("a broker it does not read is named as the problem", () => {
  const text =
    HEADER.replace("Голомт Капитал", "Тэнгэр Капитал") +
    row(1, "2022-06-08", "АПУ ХК", "APU", 90, 50, 50, 0, 1354, 68_377, 677);
  assert.throws(
    () => parseStatements([text]),
    (err: Error) => err instanceof StatementError && /аль брокерынх/.test(err.message),
  );
});

test("the broker is read from the heading, not from the companies in the rows", () => {
  // A fund named after the other broker, bought through Mandal, is Mandal's.
  const text =
    MANDAL + row(1, "2024-05-06", "Голомт Капитал Сан", "GCF", 4100, 100, 100, 0, 1000, 101_000, 1000);
  assert.equal(parseStatements([text]).broker, "mandal");
});
