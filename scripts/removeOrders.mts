/**
 * Takes orders back out of an account, cash and holding with them.
 *
 * Deleting a row from `transactions` is not enough on its own: `holdings`
 * and `portfolios` are their own collections, written alongside the history
 * rather than derived from it, so a history row removed by hand leaves the
 * shares in the portfolio and the money still spent. This reverses all three.
 *
 * Dry by default — it prints what it found and what it would do, and changes
 * nothing until `--apply` is passed.
 *
 *   MONGODB_URI="mongodb+srv://…" npx tsx scripts/removeOrders.mts \
 *     --user munhtulga --symbol QPAY
 *
 *   …then the same line with --apply once the list looks right.
 *
 * By default it only offers orders the app itself placed. A broker statement
 * writes its own rows tagged `source: "broker-statement"` and rebuilds every
 * holding from scratch when it is re-imported, so removing one of those by
 * hand is undone by the next import; re-import the statement instead.
 * `--include-imported` overrides that for the case where it is really wanted.
 */
import { MongoClient, type Db } from "mongodb";

interface Row {
  _id: unknown;
  userId: string;
  companyCode: number;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  total: number;
  createdAt: Date;
  source?: string;
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}
const has = (name: string) => process.argv.includes(`--${name}`);

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}
const username = arg("user");
const symbol = arg("symbol")?.toUpperCase();
if (!username || !symbol) {
  console.error("Usage: --user <username> --symbol <SYMBOL> [--last N] [--include-imported] [--apply]");
  process.exit(1);
}
/** How many of the newest matching orders to take, newest first. */
const last = Number(arg("last") ?? 2);
const apply = has("apply");

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const client = await MongoClient.connect(uri);
try {
  const db: Db = client.db("mse");

  const user = await db
    .collection("users")
    .findOne({ username: { $regex: `^${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } });
  if (!user) throw new Error(`No user named "${username}".`);
  const userId = user._id as unknown as string;

  const all = (await db
    .collection("transactions")
    .find({ userId, symbol })
    .sort({ createdAt: -1 })
    .toArray()) as unknown as Row[];
  const eligible = all.filter((t) => has("include-imported") || !t.source);
  const chosen = eligible.slice(0, last);

  console.log(`\n${symbol} orders on @${user.username}: ${all.length} in all, ${eligible.length} eligible\n`);
  for (const t of all) {
    const mark = chosen.includes(t) ? "→ REMOVE" : "        ";
    const tag = t.source ? ` [${t.source}]` : "";
    console.log(
      `${mark}  ${t.createdAt.toISOString().slice(0, 16).replace("T", " ")}  ${t.side}` +
        `  ${t.quantity} × ${money(t.price)} = ${money(t.total)}₮${tag}`,
    );
  }
  if (chosen.length === 0) {
    console.log("\nNothing to remove.");
    process.exit(0);
  }

  // A buy took cash out and put shares in; undoing it does the reverse. A
  // sell is the other way round.
  const cashBack = chosen.reduce((n, t) => n + (t.side === "BUY" ? t.total : -t.total), 0);
  const shares = chosen.reduce((n, t) => n + (t.side === "BUY" ? t.quantity : -t.quantity), 0);

  const portfolio = await db.collection("portfolios").findOne({ userId });
  const holding = await db.collection("holdings").findOne({ userId, companyCode: chosen[0].companyCode });
  const cashNow = (portfolio?.cashBalance as number) ?? 0;
  const heldNow = (holding?.quantity as number) ?? 0;
  const heldAfter = heldNow - shares;

  if (heldAfter < 0) {
    throw new Error(
      `The holding is ${heldNow} shares and this would take ${shares} out of it. ` +
        `Something else has already moved it; nothing changed.`,
    );
  }

  // The average cost with these orders never having happened. Exact where
  // they are the newest ones, which is what --last takes.
  const spentBack = chosen.reduce((n, t) => n + (t.side === "BUY" ? t.total : 0), 0);
  const avgNow = (holding?.avgCost as number) ?? 0;
  const avgAfter = heldAfter > 0 ? (avgNow * heldNow - spentBack) / heldAfter : 0;

  console.log(`\n  cash     ${money(cashNow)} → ${money(cashNow + cashBack)}₮`);
  console.log(`  ${symbol} held  ${heldNow} → ${heldAfter}${heldAfter === 0 ? " (holding removed)" : ""}`);
  if (heldAfter > 0) console.log(`  avg cost ${money(avgNow)} → ${money(avgAfter)}₮`);

  if (!apply) {
    console.log("\nDry run. Add --apply to write it.\n");
    process.exit(0);
  }

  await db.collection("transactions").deleteMany({ _id: { $in: chosen.map((t) => t._id) } } as never);
  await db.collection("portfolios").updateOne(
    { userId },
    { $inc: { cashBalance: cashBack }, $set: { updatedAt: new Date() } },
  );
  if (heldAfter === 0) {
    await db.collection("holdings").deleteOne({ userId, companyCode: chosen[0].companyCode });
  } else {
    await db.collection("holdings").updateOne(
      { userId, companyCode: chosen[0].companyCode },
      { $set: { quantity: heldAfter, avgCost: avgAfter, updatedAt: new Date() } },
    );
  }
  console.log(`\nDone: ${chosen.length} order(s) removed.\n`);
} finally {
  await client.close();
}
