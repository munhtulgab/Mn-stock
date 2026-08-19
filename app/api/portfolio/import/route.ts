import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import {
  isStatementError,
  positionsFrom,
  summarise,
  type StatementFill,
} from "@/lib/statementImport";
import { parseGolomtStatements } from "@/lib/statement/golomt";
import { assertPdf, pdfText } from "@/lib/statement/pdf";
import { mergeFills, positionsBefore, shortfalls } from "@/lib/statement/merge";
import type { Holding, Portfolio, Security, Transaction } from "@/lib/types";

/** Reading four years of statements takes a few seconds, not milliseconds. */
export const maxDuration = 60;

/** Marks a row as the importer's, so a re-import can rebuild exactly its own. */
const SOURCE = "broker-statement";

interface ImportedTransaction extends Transaction {
  source?: string;
  statementDate?: string;
  fee?: number;
}

/**
 * Adds uploaded broker statements to the signed-in user's portfolio.
 *
 * Adds, rather than replaces. An account gets a new statement every few
 * months and nobody re-uploads four years of them each time, so what has
 * already been imported stays and a new file contributes its own period — the
 * period it covers is rebuilt from it, everything outside is left alone.
 *
 * The app opened as paper trading, where a new account starts with ten million
 * tögrög it never had. The first import clears that, because the value on the
 * home card is meant to be the portfolio and nothing else; later ones leave
 * the balance as they find it.
 *
 * Signed-in only, and it imports into the caller's own portfolio rather than
 * one named in the request: there is no version of this that should let one
 * account rewrite another's holdings. The PDFs are read and discarded; nothing
 * but the fills is kept.
 */
export async function POST(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user._id!;

  // Told apart from "no file was chosen" below on purpose. The two have
  // nothing to do with each other — this one means the upload never arrived,
  // and answering both with "attach a statement" sent the reader to attach a
  // statement they had already attached.
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      {
        error:
          "Хүсэлт хоосон ирлээ — файл серверт хүрсэнгүй. Хуудсаа сэргээгээд дахин оролдоно уу.",
      },
      { status: 400 },
    );
  }
  const dryRun = form.get("dryRun") === "true";
  const cashField = Number(form.get("cash"));
  const cash = Number.isFinite(cashField) && cashField >= 0 ? cashField : 0;

  // Duck-typed rather than `instanceof File`. The uploaded part arrives as
  // whatever `File` the runtime's own FormData built, and that is not always
  // the `File` this module closed over — a browser that plainly attached a
  // statement was being told it had attached nothing.
  const uploads = form
    .getAll("files")
    .filter(
      (part): part is File =>
        typeof part === "object" && part !== null && "arrayBuffer" in part,
    );
  if (uploads.length === 0) {
    return NextResponse.json({ error: "Хуулгын PDF файлаа сонгоно уу." }, { status: 400 });
  }

  let incoming: StatementFill[];
  let period: { from: string; to: string; reconciledDays: number };
  let carriedIn: { symbol: string; quantity: number }[] = [];
  try {
    const texts: string[] = [];
    for (const file of uploads) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      assertPdf(file.name, bytes);
      texts.push(await pdfText(bytes));
    }
    const parsed = parseGolomtStatements(texts);
    incoming = parsed.fills;
    carriedIn = parsed.carriedIn;
    period = { from: parsed.from, to: parsed.to, reconciledDays: parsed.reconciledDays };
  } catch (err) {
    if (isStatementError(err)) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  const transactions = db.collection<ImportedTransaction>("transactions");
  const storedRows = await transactions
    .find({ userId, source: SOURCE })
    .sort({ statementDate: 1 })
    .toArray();
  const stored: StatementFill[] = storedRows.map((row) => ({
    date: row.statementDate ?? row.createdAt.toISOString().slice(0, 10),
    symbol: row.symbol,
    companyCode: row.companyCode,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    settled: row.total,
    fee: row.fee ?? 0,
  }));

  const fills = mergeFills(stored, incoming, period);

  // Shares the new statement opens holding that nothing already imported
  // explains. Their quantity is known and what was paid for them is not, so
  // importing anyway would put a portfolio on screen whose profit is invented.
  const missing = shortfalls(carriedIn, positionsBefore(fills, period.from));
  if (missing.length > 0) {
    const named = missing
      .map((m) => `${m.symbol} ${(m.stated - m.known).toLocaleString("en-US")}ш`)
      .join(", ");
    return NextResponse.json(
      {
        error:
          `Энэ хуулга ${period.from}-нд эзэмшиж байсан зарим хувьцаа нь өмнө оруулсан ` +
          `хуулгуудаас гарахгүй байна (${named}). Тэдгээрийг ямар үнээр авсан нь мэдэгдэхгүй ` +
          `тул ашиг/алдагдал буруу гарна — тухайн хугацааны хуулгаа хамт хавсаргана уу.`,
      },
      { status: 422 },
    );
  }

  // The app keys on its own company code and the broker's need not agree, so
  // the symbol is what the two are matched on.
  const traded = [...new Set(fills.map((f) => f.symbol))];
  const securities = await db
    .collection<Security>("securities")
    .find({ symbol: { $in: traded } }, { projection: { _id: 0, symbol: 1, companyCode: 1 } })
    .toArray();
  const codes = new Map(securities.map((s) => [s.symbol, s.companyCode]));

  // A symbol this app has never heard of has no price, so there is no honest
  // figure to carry it at. ETT is the standing example: allocated by the
  // state, held at the depository, not traded on the board — and left out of
  // the broker's own valuation for the same reason. Reported rather than
  // refused, so one such holding does not block the others.
  const unlisted = traded.filter((s) => !codes.has(s)).sort();

  let positions;
  try {
    positions = positionsFrom(fills, unlisted);
  } catch (err) {
    if (isStatementError(err)) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
  const summary = summarise(fills, positions);

  const preview = {
    positions: positions.map((p) => ({
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: p.avgCost,
      cost: p.quantity * p.avgCost,
    })),
    costBasis: summary.costBasis,
    fills: summary.fills,
    fees: summary.fees,
    closed: summary.closed,
    excluded: unlisted,
    files: uploads.length,
    /** Of the total, how many came out of the files just uploaded. */
    added: incoming.length,
    /** And how many were already imported and left alone. */
    kept: fills.length - incoming.length,
    cash,
    ...period,
  };
  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, ...preview });

  const holdings = db.collection<Holding>("holdings");

  // Holdings are derived, so they are rebuilt whole from the merged history
  // rather than patched. The history itself is rewritten as one set for the
  // same reason: it is the merge that was checked, and writing half of it
  // would leave a portfolio nothing had verified.
  await Promise.all([
    holdings.deleteMany({ userId }),
    transactions.deleteMany({ userId, source: SOURCE }),
  ]);

  await holdings.insertMany(
    positions.map((p) => ({
      userId,
      companyCode: codes.get(p.symbol)!,
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: p.avgCost,
      updatedAt: new Date(),
    })),
  );

  await transactions.insertMany(
    fills
      // A company the app cannot price cannot carry a transaction either: the
      // row would link to a page that does not exist.
      .filter((f) => codes.has(f.symbol))
      .map((f) => ({
        userId,
        companyCode: codes.get(f.symbol)!,
        symbol: f.symbol,
        side: f.side,
        quantity: f.quantity,
        price: f.price,
        total: f.settled,
        fee: f.fee,
        // Dated to the day it dealt. The orders page is a history, and
        // stamping these with now would file four years of it under this
        // afternoon.
        createdAt: new Date(`${f.date}T00:00:00+08:00`),
        source: SOURCE,
        statementDate: f.date,
      })) as never,
  );

  // Only the first import touches the balance. A later statement says nothing
  // about cash, and helpfully zeroing it again would wipe a figure the account
  // holder had set on purpose.
  await db.collection<Portfolio>("portfolios").updateOne(
    { userId },
    storedRows.length === 0
      ? { $set: { userId, cashBalance: cash, updatedAt: new Date() } }
      : { $set: { userId, updatedAt: new Date() }, $setOnInsert: { cashBalance: cash } },
    { upsert: true },
  );

  return NextResponse.json({ ok: true, ...preview });
}
