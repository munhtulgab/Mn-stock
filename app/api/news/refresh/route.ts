import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { refreshMarketNews } from "@/lib/marketNews";

export const maxDuration = 60;

/**
 * Rebuilds the market feed. Called from the news tab when what it has is
 * stale, so the page can paint immediately and fill in behind itself instead
 * of holding the navigation for as long as every source takes to answer.
 */
export async function POST() {
  const db = await getDb();
  if (!(await getCurrentUser(db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await refreshMarketNews(db);
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    console.error("market news refresh failed", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
