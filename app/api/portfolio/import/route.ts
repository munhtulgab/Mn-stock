import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import {
  StatementError,
  positionsFrom,
  summarise,
  type StatementFill,
} from "@/lib/statementImport";
import statement from "@/scripts/statements/golomt.json";
import type { Holding, Portfolio, Security, Transaction } from "@/lib/types";

/** Marks a row as the importer's, so a re-run replaces exactly its own. */
const SOURCE = "broker-statement";

interface ImportedTransaction extends Transaction {
  source?: string;
  statementDate?: string;
}

/**
 * Loads the stored broker statement into the signed-in user's portfolio.
 *
 * The app opened as paper trading, where a new account starts with ten million
 * tögrög it never had. An account that can be told what it actually owns is a
 * better thing, and this is what tells it: the fills from the statement, the
 * positions they add up to, and no play money — the cash balance goes to zero,
 * because the value on the home card is meant to be the portfolio and nothing
 * else.
 *
 * Signed-in only, and it imports into the caller's own portfolio rather than
 * one named in the request: there is no version of this that should let one
 * account rewrite another's holdings.
 */
export async function POST(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user._id!;

  const body = await req.json().catch(() => ({}));
  const cash = typeof body.cash === "number" && body.cash >= 0 ? body.cash : 0;
  const dryRun = body.dryRun === true;

  const fills = statement.transactions as StatementFill[];
  let positions;
  try {
    positions = positionsFrom(fills, statement.excluded);
  } catch (err) {
    if (err instanceof StatementError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
  const summary = summarise(fills, positions);

  // The app keys on its own company code and the broker's need not agree, so
  // the symbol is what the two are matched on. A position the app has never
  // heard of would land on nobody's page, which is worse than not importing.
  const securities = await db
    .collection<Security>("securities")
    .find(
      { symbol: { $in: positions.map((p) => p.symbol) } },
      { projection: { _id: 0, symbol: 1, companyCode: 1 } },
    )
    .toArray();
  const codes = new Map(securities.map((s) => [s.symbol, s.companyCode]));
  const unknown = positions.filter((p) => !codes.has(p.symbol)).map((p) => p.symbol);
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Энэ аппад бүртгэлгүй симбол: ${unknown.join(", ")}` },
      { status: 422 },
    );
  }

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
    excluded: statement.excluded,
    cash,
  };
  if (dryRun) return NextResponse.json({ ok: true, dryRun: true, ...preview });

  const holdings = db.collection<Holding>("holdings");
  const transactions = db.collection<ImportedTransaction>("transactions");

  // Replaced, not merged. This is the account stating what it holds, and a
  // paper position bought in the app before now is not part of that.
  const [clearedHoldings, clearedRows] = await Promise.all([
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
    fills.map((f) => ({
      userId,
      companyCode: codes.get(f.symbol) ?? f.companyCode,
      symbol: f.symbol,
      side: f.side,
      quantity: f.quantity,
      price: f.price,
      total: f.settled,
      // Dated to the day it dealt. The orders page is a history, and stamping
      // these with now would file four years of it under this afternoon.
      createdAt: new Date(`${f.date}T00:00:00+08:00`),
      source: SOURCE,
      statementDate: f.date,
    })) as never,
  );

  await db
    .collection<Portfolio>("portfolios")
    .updateOne(
      { userId },
      { $set: { userId, cashBalance: cash, updatedAt: new Date() } },
      { upsert: true },
    );

  return NextResponse.json({
    ok: true,
    ...preview,
    clearedHoldings: clearedHoldings.deletedCount,
    clearedTransactions: clearedRows.deletedCount,
  });
}
