import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { PortfolioError, addToWatchlist } from "@/lib/portfolio";

/**
 * Adding a company to the watchlist, and nothing else.
 *
 * This used to answer with the whole watchlist, rebuilt: every row's latest
 * two closes, and `livePricesFor` on top of that — an outbound call to the
 * quote feed with a budget measured in seconds. The one caller reads
 * `res.ok` and discards the body, so all of that was a reader waiting on a
 * price fetch to find out whether a bookmark had been saved. The write
 * itself is one upsert.
 */
export async function POST(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const symbol = typeof body.symbol === "string" ? body.symbol : "";

  try {
    await addToWatchlist(db, user._id!, symbol);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PortfolioError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
