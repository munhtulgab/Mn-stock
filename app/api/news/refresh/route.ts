import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { refreshMarketNews } from "@/lib/marketNews";

export const maxDuration = 300;

/**
 * Rebuilds the market feed.
 *
 * Two callers. The news tab asks for one when what it has is stale, so the
 * page can paint immediately and fill in behind itself rather than holding
 * the navigation for as long as every source takes to answer — that run
 * reuses the stored Facebook posts. The scheduled run each weekday carries
 * the cron secret and takes fresh ones, which is the only time Facebook
 * credits are spent.
 */
async function handle(req: NextRequest) {
  const db = await getDb();

  const secret = process.env.CRON_SECRET;
  const scheduled =
    !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!scheduled && !(await getCurrentUser(db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await refreshMarketNews(db, { force: scheduled });
    return NextResponse.json({ ok: true, count, scheduled });
  } catch (err) {
    console.error("market news refresh failed", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
