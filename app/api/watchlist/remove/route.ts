import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { removeFromWatchlist } from "@/lib/portfolio";

/** Removing one, and nothing else — see the note on the add route. */
export async function POST(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const symbol = typeof body.symbol === "string" ? body.symbol : "";

  await removeFromWatchlist(db, user._id!, symbol);
  return NextResponse.json({ ok: true });
}
