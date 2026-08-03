import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { PortfolioError, addToWatchlist, getWatchlist } from "@/lib/portfolio";

export async function POST(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const symbol = typeof body.symbol === "string" ? body.symbol : "";

  try {
    await addToWatchlist(db, user._id!, symbol);
    const items = await getWatchlist(db, user._id!);
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof PortfolioError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
