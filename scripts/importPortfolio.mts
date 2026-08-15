/**
 * Loads a broker statement into a user's portfolio.
 *
 *   node --import tsx --env-file=.env.local scripts/importPortfolio.mts \
 *     --user <username> [--file scripts/statements/golomt.json] \
 *     [--cash 0] [--dry-run]
 *
 * The app's portfolio was built for paper trading, so a new account opens with
 * ten million tögrög of play money. An account that is being told what it
 * actually owns has no such balance, and leaving it there would put the whole
 * of it into the value on the home card. `--cash` is what replaces it, and
 * nothing is a truer answer than ten million; pass a figure to say otherwise.
 *
 * Re-running is safe. Imported rows are tagged, so a second run replaces the
 * first rather than doubling every position.
 */

import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import {
  positionsFrom,
  summarise,
  type StatementFill,
} from "../lib/statementImport";
import type { Holding, Portfolio, Security, Transaction, User } from "../lib/types";

/** Marks a row as this importer's, so a re-run can replace exactly its own. */
const SOURCE = "broker-statement";

function arg(name: string, fallback?: string): string {
  const at = process.argv.indexOf(`--${name}`);
  const value = at === -1 ? undefined : process.argv[at + 1];
  if (value === undefined && fallback === undefined) {
    throw new Error(`--${name} is required`);
  }
  return value ?? fallback!;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const username = arg("user");
  const file = arg("file", "scripts/statements/golomt.json");
  const cash = Number(arg("cash", "0"));
  const dryRun = process.argv.includes("--dry-run");

  const statement = JSON.parse(readFileSync(file, "utf8")) as {
    source?: string;
    excluded?: string[];
    transactions: StatementFill[];
  };
  const fills = statement.transactions;
  const positions = positionsFrom(fills, statement.excluded ?? []);
  const summary = summarise(fills, positions);

  console.log(`${file}: ${summary.fills} fills (${summary.bought} buys, ${summary.sold} sells)`);
  console.log(`  ${positions.length} positions, ${money(summary.costBasis)} ₮ cost basis`);
  console.log(`  ${money(summary.fees)} ₮ in commission, which the cost above includes`);
  if (statement.excluded?.length) {
    console.log(`  held but not valued: ${statement.excluded.join(", ")}`);
  }
  if (summary.closed.length > 0) {
    console.log(`  closed out and not imported: ${summary.closed.join(", ")}`);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db();
    const user = await db.collection<User>("users").findOne({ username });
    if (!user) throw new Error(`no user named ${username}`);
    const userId = String(user._id);

    // The app keys everything on its own company code, and the broker's is not
    // guaranteed to be the same number. Symbol is what the two agree on.
    const securities = await db
      .collection<Security>("securities")
      .find(
        { symbol: { $in: positions.map((p) => p.symbol) } },
        { projection: { _id: 0, symbol: 1, companyCode: 1, name: 1 } },
      )
      .toArray();
    const codes = new Map(securities.map((s) => [s.symbol, s.companyCode]));

    const unknown = positions.filter((p) => !codes.has(p.symbol));
    if (unknown.length > 0) {
      // Importing under the broker's code would put a position on a company
      // page that shows somebody else's prices. Better to stop and be told.
      throw new Error(
        `not listed in this app: ${unknown.map((p) => p.symbol).join(", ")}` +
          " — run a securities sync first",
      );
    }

    console.log("");
    for (const p of positions) {
      console.log(
        `  ${p.symbol.padEnd(5)} ${String(Math.round(p.quantity)).padStart(7)} @ ` +
          `${money(p.avgCost).padStart(10)} ₮  = ${money(p.quantity * p.avgCost).padStart(14)} ₮`,
      );
    }

    if (dryRun) {
      console.log("\n--dry-run: nothing written");
      return;
    }

    const holdings = db.collection<Holding>("holdings");
    const transactions = db.collection<Transaction & { source?: string; statementDate?: string }>(
      "transactions",
    );

    // Replaced rather than merged: this is the account saying what it holds,
    // not adding to it. Anything bought in the app before now was paper.
    const clearedHoldings = await holdings.deleteMany({ userId });
    const clearedRows = await transactions.deleteMany({ userId, source: SOURCE });

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
        // The day it dealt, not the day it was imported — the orders page is
        // a history, and stamping it now would file 2022 under today.
        createdAt: new Date(`${f.date}T00:00:00+08:00`),
        source: SOURCE,
        statementDate: f.date,
      })) as never,
    );

    await db.collection<Portfolio>("portfolios").updateOne(
      { userId },
      { $set: { userId, cashBalance: cash, updatedAt: new Date() } },
      { upsert: true },
    );

    console.log(
      `\nwrote ${positions.length} holdings and ${fills.length} transactions for ${username}` +
        ` (cleared ${clearedHoldings.deletedCount} holdings,` +
        ` ${clearedRows.deletedCount} previously imported rows)`,
    );
    console.log(`cash balance set to ${money(cash)} ₮`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
