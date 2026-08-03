import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getWatchlist } from "@/lib/portfolio";

export async function GET() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await getWatchlist(db, user._id!);
  return NextResponse.json({ items });
}
