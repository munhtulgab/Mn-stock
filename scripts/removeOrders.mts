/**
 * Takes orders back out of an account, cash and holding with them.
 *
 * The admin area does this from a page now — Хэрэглэгч → the account → its
 * order history. This stays for the case that page cannot help with: an
 * installation whose administrator cannot sign in, or a correction wanted
 * before the deploy carrying that page is out.
 *
 * Deleting a row from `transactions` is not enough on its own: `holdings` and
 * `portfolios` are their own collections, written alongside the history rather
 * than derived from it, so a history row removed by hand leaves the shares in
 * the portfolio and the money still spent. The arithmetic that reverses all
 * three is `lib/adminOrders.ts`, shared with the page so the two cannot
 * disagree about what undoing an order means.
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
import { afterChange, checkChange, type AccountState } from "../lib/adminOrders";

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

  const { companyCode } = chosen[0];
  const portfolio = await db.collection("portfolios").findOne({ userId });
  const holding = await db.collection("holdings").findOne({ userId, companyCode });
  const before: AccountState = {
    cash: (portfolio?.cashBalance as number) ?? 0,
    held: (holding?.quantity as number) ?? 0,
    avgCost: (holding?.avgCost as number) ?? 0,
  };

  // Newest first, one at a time. Taken as a batch the average cost would be
  // computed against a holding two orders too large.
  let after = before;
  for (const t of chosen) {
    after = afterChange(after, t, null);
    checkChange(after, symbol);
  }

  console.log(`\n  cash     ${money(before.cash)} → ${money(after.cash)}₮`);
  console.log(
    `  ${symbol} held  ${before.held} → ${after.held}${after.held === 0 ? " (holding removed)" : ""}`,
  );
  if (after.held > 0) console.log(`  avg cost ${money(before.avgCost)} → ${money(after.avgCost)}₮`);

  if (!apply) {
    console.log("\nDry run. Add --apply to write it.\n");
    process.exit(0);
  }

  await db.collection("transactions").deleteMany({ _id: { $in: chosen.map((t) => t._id) } } as never);
  await db.collection("portfolios").updateOne(
    { userId },
    { $set: { cashBalance: after.cash, updatedAt: new Date() } },
  );
  if (after.held === 0) {
    await db.collection("holdings").deleteOne({ userId, companyCode });
  } else {
    await db.collection("holdings").updateOne(
      { userId, companyCode },
      { $set: { quantity: after.held, avgCost: after.avgCost, updatedAt: new Date() } },
    );
  }
  console.log(`\nDone: ${chosen.length} order(s) removed.\n`);
} finally {
  await client.close();
}
