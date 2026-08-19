import { StatementError, type StatementFill } from "@/lib/statementImport";

/**
 * Golomt Capital's "харилцагчийн үнэт цаасны гүйлгээний түүх" as fills.
 *
 * The statement's `Эхний үлдэгдэл` column looks like a running balance and is
 * not one: on every row it is exactly `Эцсийн үлдэгдэл - (Орлого - Зарлага)`,
 * back-computed from that row's own fill. A day with three fills therefore
 * states three different openings, none of which is where the account stood
 * that morning, and following them reconstructs a portfolio the account never
 * had — 5,013 shares of MFC against the broker's 5,300, in the case that found
 * this.
 *
 * What is real is `Орлого` and `Зарлага`. Their running total lands on the
 * stated closing balance at the end of every dealing day, and {@link
 * parseGolomtStatements} refuses to return anything until it has checked that.
 */

/** `1,234.56` — the statement writes every figure with two decimals. */
const NUMBER = String.raw`[\d,]+\.\d{2}`;

const ROW = new RegExp(
  String.raw`(?<date>\d{4}-\d{2}-\d{2})\s+` +
    // Company names carry no digits, which is what keeps this from running on
    // into the next row's figures.
    String.raw`(?<name>[^\d]+?)\s+` +
    String.raw`(?<symbol>[A-Z]{2,5})\s+(?<code>\d+)\s+` +
    String.raw`(?<opening>${NUMBER})\s+(?<inn>${NUMBER})\s+(?<out>${NUMBER})\s+` +
    String.raw`(?<closing>${NUMBER})\s+` +
    String.raw`(?<price>${NUMBER})\s+(?<total>${NUMBER})\s+(?<fee>${NUMBER})`,
  "gu",
);

/** Where the table starts. Above it are the print date and the account name. */
const TABLE_HEADER = "Гүйлгээний утга";

function num(text: string): number {
  return Number(text.replace(/,/g, ""));
}

interface ParsedRow extends StatementFill {
  opening: number;
  closing: number;
}

/**
 * One statement's rows, in the order it lists them.
 *
 * The print date at the top of the page parses as a transaction date if it is
 * left in, which files the first row of every statement under the day it was
 * printed — so the header is cut rather than skipped.
 */
function rowsOf(text: string): ParsedRow[] {
  const header = text.indexOf(TABLE_HEADER);
  if (header === -1) {
    throw new StatementError(
      "Голомт Капиталын гүйлгээний түүх мэт харагдахгүй байна (хүснэгтийн толгой олдсонгүй).",
    );
  }
  // The extractor wraps company names and splits row numbers across lines, so
  // the only reliable unit is the whole document with its whitespace flattened.
  const body = text.slice(header + TABLE_HEADER.length).replace(/\s+/gu, " ");

  const rows: ParsedRow[] = [];
  for (const match of body.matchAll(ROW)) {
    const g = match.groups!;
    const opening = num(g.opening);
    const closing = num(g.closing);
    const inn = num(g.inn);
    const out = num(g.out);

    // The one structural fact everything below leans on. If a statement ever
    // arrives with a genuine running balance this stops rather than quietly
    // reading it the wrong way.
    if (Math.abs(opening - (closing - inn + out)) > 0.001) {
      throw new StatementError(
        `${g.symbol} ${g.date}: эхний үлдэгдэл ${opening} нь эцсийн үлдэгдэл ${closing}-аас ` +
          `гүйлгээгээр гарахгүй байна — хуулгын бүтэц өөрчлөгдсөн бололтой.`,
      );
    }
    const quantity = inn - out;
    if (quantity === 0) continue;

    rows.push({
      date: g.date,
      symbol: g.symbol,
      companyCode: Number(g.code),
      side: quantity > 0 ? "BUY" : "SELL",
      quantity: Math.abs(quantity),
      price: num(g.price),
      settled: num(g.total),
      fee: num(g.fee),
      opening,
      closing,
    });
  }

  if (rows.length === 0) {
    throw new StatementError("Энэ файлаас нэг ч гүйлгээ уншигдсангүй.");
  }
  return rows;
}

/** `YYYY-MM-DD` of the first and last row. */
function span(rows: ParsedRow[]): { from: string; to: string } {
  const dates = rows.map((r) => r.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

export interface ParsedStatements {
  fills: StatementFill[];
  /** The period the uploaded files cover between them. */
  from: string;
  to: string;
  /** How many dealing days were checked against the broker's own balances. */
  reconciledDays: number;
}

/**
 * Reads one or more statements into a single history, and checks it.
 *
 * Statements are expected to cover separate periods. Two that overlap would
 * count the same fills twice, and while the balance check below catches that
 * as a mismatch, saying so plainly is more use than a number that does not
 * add up.
 */
export function parseGolomtStatements(texts: string[]): ParsedStatements {
  if (texts.length === 0) {
    throw new StatementError("Файл сонгогдоогүй байна.");
  }

  const perFile = texts.map(rowsOf);
  const ranges = perFile
    .map((rows, index) => ({ index, ...span(rows) }))
    .sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].from <= ranges[i - 1].to) {
      throw new StatementError(
        `Хоёр хуулга давхцаж байна (${ranges[i - 1].from}..${ranges[i - 1].to} ба ` +
          `${ranges[i].from}..${ranges[i].to}). Давхцахгүй хугацаатай хуулгуудыг сонгоно уу.`,
      );
    }
  }

  // Statement order within a file is the dealing order; files are ordered by
  // the period they cover. Sorting on the date alone would interleave two
  // files' rows for a shared day, and there are no shared days by the check
  // above — but it would also lose the order of same-day fills, which the
  // running balance below is checked against.
  const rows = ranges.flatMap((range) => perFile[range.index]);

  // The last row for a company on a day, which is the only one whose closing
  // balance is the day's. Found by looking, not by comparing with the next
  // row: a day's fills are interleaved with other companies' — three MFC fills
  // on 2022-07-26 sit at rows 3, 6 and 8 — so "the next row is a different
  // company" means nothing at all.
  const lastRowOfDay = new Map<string, number>();
  rows.forEach((row, index) => lastRowOfDay.set(`${row.symbol}|${row.date}`, index));

  // The check that makes this parse worth trusting: the fills, added up, have
  // to land where the broker says the account stood at the end of each day.
  const position = new Map<string, number>();
  let reconciledDays = 0;
  rows.forEach((row, index) => {
    const held = (position.get(row.symbol) ?? 0) + (row.side === "BUY" ? 1 : -1) * row.quantity;
    position.set(row.symbol, held);

    if (lastRowOfDay.get(`${row.symbol}|${row.date}`) !== index) return;
    if (Math.abs(held - row.closing) > 0.001) {
      throw new StatementError(
        `${row.symbol} ${row.date}: гүйлгээнүүд ${held} ширхэг гэж гарч байхад хуулга ` +
          `${row.closing} гэж бичжээ. Хуулга дутуу эсвэл давхардсан байж магадгүй.`,
      );
    }
    reconciledDays++;
  });

  const all = span(rows);
  return {
    // The balances were the parse's own evidence and have done their job; a
    // fill is what the rest of the app deals in.
    fills: rows.map((row) => ({
      date: row.date,
      symbol: row.symbol,
      companyCode: row.companyCode,
      side: row.side,
      quantity: row.quantity,
      price: row.price,
      settled: row.settled,
      fee: row.fee,
    })),
    from: all.from,
    to: all.to,
    reconciledDays,
  };
}
