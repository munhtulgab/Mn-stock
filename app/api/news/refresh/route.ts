import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { refreshMarketNews } from "@/lib/marketNews";
import type { FacebookSpend } from "@/lib/mse/facebook";

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
/**
 * Is this the weekday run rather than a reader's tab?
 *
 * The scheduler sends `Authorization: Bearer $CRON_SECRET` only when that
 * variable is set on the deployment. Without it the run arrived as an
 * ordinary request with no session, was turned away with a 401, and the
 * feed — Facebook posts included — was never refreshed on a schedule at all:
 * the only rebuilds were the ones a reader's tab asked for, which
 * deliberately reuse the stored posts. So the scheduler's own user agent
 * counts too, the way `/api/sync` treats an unset secret as open.
 *
 * This decides whether to spend Facebook credits, not whether to answer:
 * everything below rebuilds a feed that is public to anyone signed in.
 */
function isScheduled(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    return req.headers.get("authorization") === `Bearer ${secret}`;
  }
  return /vercel-cron/i.test(req.headers.get("user-agent") ?? "");
}

/**
 * How much this run may spend on Facebook.
 *
 * Two scheduled runs, not one. The free sources are polled through the day so
 * a story is announced near when it went up; Facebook is billed per post and
 * is taken once a weekday. `?facebook=skip` is what the frequent one calls
 * itself, and without it a scheduled run still means the weekday scrape.
 */
function spend(req: NextRequest, scheduled: boolean): FacebookSpend {
  if (req.nextUrl.searchParams.get("facebook") === "skip") return "cached";
  return scheduled ? "fresh" : "stored";
}

async function handle(req: NextRequest) {
  const db = await getDb();

  const scheduled = isScheduled(req);
  if (!scheduled && !(await getCurrentUser(db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const facebook = spend(req, scheduled);
  try {
    const { total, added } = await refreshMarketNews(db, { facebook });
    return NextResponse.json({ ok: total > 0, total, added, scheduled, facebook });
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
