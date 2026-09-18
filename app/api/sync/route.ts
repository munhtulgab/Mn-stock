import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureIndexes } from "@/lib/mongodb";
import { runSyncBatch } from "@/lib/sync";
import { checkSignalChangesAndNotify } from "@/lib/signalHistory";
import { refreshDashboardSnapshot } from "@/lib/data";
import { refreshMarketIndices } from "@/lib/indices";
import { refreshMarketNews } from "@/lib/marketNews";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";

export const maxDuration = 300;

/**
 * Two callers, one door.
 *
 * Vercel Cron sends the secret and nothing else; an administrator pressing
 * the button on the admin overview sends a session cookie and nothing else.
 * Before that button existed the secret was the only key, which meant a
 * deployment with CRON_SECRET set — every real one — had no way to run a sync
 * by hand at all.
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  const db = await getDb();
  if (await isSettingsRequestAuthorized(db, req.headers.get("cookie"))) return true;
  // No secret configured: open (local/dev use only).
  return !secret;
}

async function handle(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Three minutes by default, and never more than the ceiling below.
  //
  // It was forty-five seconds, which is a sixth of what this function is
  // allowed and nowhere near a session: the exchange publishes a close for
  // about fifty securities a day and its pages take two to three seconds
  // each, so a forty-five second run could not finish a day's trading even
  // in principle — which is why the store sat behind the market. Measured
  // after the change, a three-minute run reads around eighty companies.
  //
  // The ceiling is not `maxDuration`: a run overshoots its budget by however
  // long the slowest request still in flight takes, and 240s of budget was
  // measured finishing at 288s. Two hundred leaves that overshoot a minute
  // and a half of room before the platform kills the function mid-write.
  const MAX_BUDGET_MS = 200_000;
  const maxMsParam = Number(req.nextUrl.searchParams.get("maxMs"));
  const maxMs = Number.isFinite(maxMsParam) && maxMsParam > 0
    ? Math.min(maxMsParam, MAX_BUDGET_MS)
    : 180_000;

  try {
    await ensureIndexes();
    const db = await getDb();
    const result = await runSyncBatch(db, { maxMs });

    // Rebuild the dashboard snapshot first: it saves the next visitor from
    // recomputing indicators across every listed company, and the signal
    // check below reads those same rows. Run the other way round, the check
    // compares against a snapshot built before this sync ingested anything,
    // so every signal change is spotted one cycle late.
    let snapshotRows = 0;
    try {
      snapshotRows = await refreshDashboardSnapshot(db);
    } catch (err) {
      console.error("dashboard snapshot refresh failed", err);
    }

    let signalChanges: Awaited<ReturnType<typeof checkSignalChangesAndNotify>> = {
      changes: [],
      notified: false,
      smsSent: 0,
    };
    try {
      signalChanges = await checkSignalChangesAndNotify(db);
    } catch (err) {
      console.error("signal change check failed", err);
    }

    let indexCount = 0;
    try {
      indexCount = await refreshMarketIndices(db);
    } catch (err) {
      console.error("index snapshot refresh failed", err);
    }

    // Keeps the news tab warm without spending Facebook credits — the 12:30
    // run owns those; this one reuses whatever it stored.
    let newsCount = 0;
    try {
      newsCount = (await refreshMarketNews(db)).added;
    } catch (err) {
      console.error("market news refresh failed", err);
    }

    return NextResponse.json({
      ok: true,
      ...result,
      signalChanges,
      snapshotRows,
      indexCount,
      newsCount,
    });
  } catch (err) {
    console.error("sync failed", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message, stack: (err as Error).stack },
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
