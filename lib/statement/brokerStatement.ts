import { StatementError, type StatementFill } from "@/lib/statementImport";

/**
 * A broker's "харилцагчийн үнэт цаасны гүйлгээний түүх" as fills.
 *
 * Golomt Capital and Mandal Capital Markets print the same report: the same
 * columns in the same order, down to the № in front of each row, out of what
 * is plainly the same back-office software. One parser reads both, and the
 * name across the top is what tells them apart.
 *
 * The report's `Эхний үлдэгдэл` column looks like a running balance and is
 * not one: on every row it is exactly `Эцсийн үлдэгдэл - (Орлого - Зарлага)`,
 * back-computed from that row's own fill. A day with three fills therefore
 * states three different openings, none of which is where the account stood
 * that morning, and following them reconstructs a portfolio the account never
 * had — 5,013 shares of MFC against the broker's 5,300, in the case that found
 * this. Mandal's statement shows the same thing from the other side: three
 * rows of 10 NEH on 2024-04-30, every one of them reading 20 → 30, are three
 * fills and 30 shares bought from nothing — the board's own record has seven
 * trades in NEH that day, all at 17₮ — not one fill printed three times.
 *
 * What is real is `Орлого` and `Зарлага`. Their running total lands on the
 * stated closing balance at the end of every dealing day, and {@link
 * parseStatements} refuses to return anything until it has checked that.
 */

/**
 * The brokers whose statements this reads.
 *
 * Recognised by the name in the heading, and only there: the rows under it
 * are full of company names, and a statement from either broker can list
 * Голомт Банк or Мандал Ирээдүйн Өсөлт among them.
 */
export const BROKERS = {
  golomt: {
    name: "Голомт Капитал",
    genitive: "Голомт Капиталын",
    heading: /Голомт\s+Капитал/u,
  },
  mandal: {
    name: "Мандал Капитал Маркетс",
    genitive: "Мандал Капитал Маркетсийн",
    heading: /Мандал\s+Капитал\s+Маркетс/u,
  },
} as const;

export type BrokerId = keyof typeof BROKERS;

const BROKER_IDS = Object.keys(BROKERS) as BrokerId[];

/**
 * `1,234.56` — the statement writes every figure with two decimals.
 *
 * A figure wider than its column is wrapped wherever it runs out of room,
 * mid-number: Mandal's 52,553,570.85 comes out of the PDF as `52,553,570` and,
 * a line further down, `.85`. So a gap is allowed anywhere inside one. The two
 * decimals are what end a figure — every figure has them — which is what
 * keeps a gap after them meaning the next column and a gap before them
 * meaning the wrap.
 */
const NUMBER = String.raw`\d(?:\s?[\d,])*\s?\.\s?\d\s?\d`;

/**
 * `2024-04-30`, which a narrow column breaks after a hyphen — the one place
 * a PDF writer will break a date — into `2024-04-` and `30`.
 */
const DATE = String.raw`\d{4}-\s?\d{2}-\s?\d{2}`;

const ROW = new RegExp(
  String.raw`(?<date>${DATE})\s+` +
    // Company names carry no digits, which is what keeps this from running on
    // into the next row's figures.
    String.raw`(?<name>[^\d]+?)\s+` +
    String.raw`(?<symbol>[A-Z]{2,5})\s+(?<code>\d+)\s+` +
    String.raw`(?<opening>${NUMBER})\s+(?<inn>${NUMBER})\s+(?<out>${NUMBER})\s+` +
    String.raw`(?<closing>${NUMBER})\s+` +
    String.raw`(?<price>${NUMBER})\s+(?<total>${NUMBER})\s+(?<fee>${NUMBER})`,
  "gu",
);

/**
 * Where a row begins: its №, its date, and a company — a name, a ticker and
 * the depository's code. Ends just before the date, which is where {@link ROW}
 * starts reading.
 *
 * Looked for separately so that a row ROW cannot read is an error instead of
 * a fill that is quietly not there. A sale missing from the history leaves
 * the shares it sold in the portfolio, and nothing anywhere says so — which
 * is what Mandal's one large sale did, without a word, before figures were
 * allowed to wrap.
 *
 * The print date is no row: a time follows it, not a name. Nor is the date
 * at the end of each row's description, which follows a hyphen rather than
 * a number. A bond is not one either — its code is no ticker, and its rows
 * are left out as they always were: this app carries no bonds.
 */
const ROW_START = new RegExp(
  String.raw`(?<![\d,.\-])\d+\s+(?=${DATE}\s+[^\d]+?\s[A-Z]{2,5}\s+\d)`,
  "gu",
);

/** Where the table starts. Above it are the print date and the account name. */
const TABLE_HEADER = "Гүйлгээний утга";

function num(text: string): number {
  return Number(text.replace(/[,\s]/gu, ""));
}

interface ParsedRow extends StatementFill {
  opening: number;
  closing: number;
}

/** Whose statement this is, from the heading above its table. */
function brokerOf(heading: string): BrokerId {
  const broker = BROKER_IDS.find((id) => BROKERS[id].heading.test(heading));
  if (!broker) {
    throw new StatementError(
      "Энэ хуулга аль брокерынх болох нь танигдсангүй. Одоогоор " +
        `${BROKERS.golomt.name} болон ${BROKERS.mandal.genitive} хуулгыг уншдаг.`,
    );
  }
  return broker;
}

/**
 * One statement's rows, in the order it lists them.
 *
 * The print date at the top of the page parses as a transaction date if it is
 * left in, which files the first row of every statement under the day it was
 * printed — so the header is cut rather than skipped.
 */
function rowsOf(text: string): { broker: BrokerId; rows: ParsedRow[] } {
  const header = text.indexOf(TABLE_HEADER);
  if (header === -1) {
    throw new StatementError(
      "Брокерын гүйлгээний түүх мэт харагдахгүй байна (хүснэгтийн толгой олдсонгүй).",
    );
  }
  const broker = brokerOf(text.slice(0, header));
  // The extractor wraps company names and splits row numbers across lines, so
  // the only reliable unit is the whole document with its whitespace flattened.
  const body = text.slice(header + TABLE_HEADER.length).replace(/\s+/gu, " ");

  const rows: ParsedRow[] = [];
  const read = new Set<number>();
  for (const match of body.matchAll(ROW)) {
    read.add(match.index);
    const g = match.groups!;
    const date = g.date.replace(/\s/gu, "");
    const opening = num(g.opening);
    const closing = num(g.closing);
    const inn = num(g.inn);
    const out = num(g.out);

    // The one structural fact everything below leans on. If a statement ever
    // arrives with a genuine running balance this stops rather than quietly
    // reading it the wrong way.
    if (Math.abs(opening - (closing - inn + out)) > 0.001) {
      throw new StatementError(
        `${g.symbol} ${date}: эхний үлдэгдэл ${opening} нь эцсийн үлдэгдэл ${closing}-аас ` +
          `гүйлгээгээр гарахгүй байна — хуулгын бүтэц өөрчлөгдсөн бололтой.`,
      );
    }
    const quantity = inn - out;
    if (quantity === 0) continue;

    rows.push({
      date,
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

  for (const start of body.matchAll(ROW_START)) {
    const at = start.index + start[0].length;
    if (read.has(at)) continue;
    // At most two breaks inside the date, both of them after a hyphen.
    const date = body.slice(at, at + 12).replace(/\s/gu, "").slice(0, 10);
    throw new StatementError(
      `${date}-ны мөрийг уншиж чадсангүй ` +
        `(«${body.slice(at, at + 80).trim()}…») — хуулгын хэлбэр өөрчлөгдсөн бололтой.`,
    );
  }

  if (rows.length === 0) {
    throw new StatementError("Энэ файлаас нэг ч гүйлгээ уншигдсангүй.");
  }
  return { broker, rows };
}

/** `YYYY-MM-DD` of the first and last row. */
function span(rows: ParsedRow[]): { from: string; to: string } {
  const dates = rows.map((r) => r.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

export interface ParsedStatements {
  /** Whose statements these are. One broker's at a time — see {@link parseStatements}. */
  broker: BrokerId;
  fills: StatementFill[];
  /** The period the uploaded files cover between them. */
  from: string;
  to: string;
  /** How many dealing days were checked against the broker's own balances. */
  reconciledDays: number;
  /**
   * Shares already held when the earliest uploaded statement opens.
   *
   * A statement covering one stretch of an account's life says what was held
   * before it starts, but not what was paid for it. The quantities here are
   * therefore known and their cost is not, which is the difference between a
   * portfolio and a portfolio with a made-up profit — so the caller is handed
   * this rather than left to assume the history began at zero.
   */
  carriedIn: { symbol: string; quantity: number }[];
}

/**
 * Reads one or more statements into a single history, and checks it.
 *
 * Statements are expected to cover separate periods. Two that overlap would
 * count the same fills twice, and while the balance check below catches that
 * as a mismatch, saying so plainly is more use than a number that does not
 * add up.
 *
 * And to come from one broker. An account at Golomt and an account at Mandal
 * are two histories, and NEH held at both is two positions that share a name:
 * checking one broker's closing balances against the other's fills would fail
 * on the first day both dealt in it.
 */
export function parseStatements(texts: string[]): ParsedStatements {
  if (texts.length === 0) {
    throw new StatementError("Файл сонгогдоогүй байна.");
  }

  const files = texts.map(rowsOf);
  const brokers = BROKER_IDS.filter((id) => files.some((file) => file.broker === id));
  if (brokers.length > 1) {
    const last = brokers[brokers.length - 1];
    const others = brokers.slice(0, -1).map((id) => BROKERS[id].name);
    throw new StatementError(
      `${others.join(", ")} болон ${BROKERS[last].genitive} хуулгыг тус тусад нь оруулна уу — ` +
        `нэг удаад нэг брокерынхыг.`,
    );
  }

  const perFile = files.map((file) => file.rows);
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

  // What was already held when these statements open.
  //
  // A statement need not be the account's first. The balance it carries in is
  // not printed anywhere, but it follows from the first day it does print: the
  // day closed where it says, and it got there from the fills it lists, so
  // whatever is left over was there beforehand. Read per day rather than per
  // row, because a row's opening is that row's fill subtracted from the close
  // and not the morning's position.
  const carried = new Map<string, number>();
  const firstDate = new Map<string, string>();
  for (const row of rows) {
    if (!firstDate.has(row.symbol)) firstDate.set(row.symbol, row.date);
  }
  for (const [symbol, date] of firstDate) {
    const day = rows.filter((r) => r.symbol === symbol && r.date === date);
    const net = day.reduce((sum, r) => sum + (r.side === "BUY" ? 1 : -1) * r.quantity, 0);
    carried.set(symbol, day[day.length - 1].closing - net);
  }

  // The check that makes this parse worth trusting: the fills, added up from
  // what was carried in, have to land where the broker says the account stood
  // at the end of each day.
  const position = new Map(carried);
  let reconciledDays = 0;
  rows.forEach((row, index) => {
    const held = (position.get(row.symbol) ?? 0) + (row.side === "BUY" ? 1 : -1) * row.quantity;
    position.set(row.symbol, held);

    if (lastRowOfDay.get(`${row.symbol}|${row.date}`) !== index) return;
    if (Math.abs(held - row.closing) > 0.001) {
      // Not a carried-in balance — that is accounted for above — so the run
      // of statements has a hole in the middle, or the same one twice.
      throw new StatementError(
        `${row.symbol} ${row.date}: гүйлгээнүүд ${held} ширхэг гэж гарч байхад хуулга ` +
          `${row.closing} гэж бичжээ. Хугацааны дунд нь хуулга дутуу эсвэл давхардсан байна.`,
      );
    }
    reconciledDays++;
  });

  const all = span(rows);
  return {
    broker: brokers[0],
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
    carriedIn: [...carried.entries()]
      .filter(([, quantity]) => Math.round(quantity * 1e4) !== 0)
      .map(([symbol, quantity]) => ({ symbol, quantity }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
  };
}
