import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureIndexes } from "@/lib/mongodb";
import { runSyncBatch } from "@/lib/sync";
import { checkSignalChangesAndNotify } from "@/lib/signalHistory";
import { refreshDashboardSnapshot } from "@/lib/data";
import { refreshMarketIndices } from "@/lib/indices";

export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured: open (local/dev use only)
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxMsParam = req.nextUrl.searchParams.get("maxMs");
  const maxMs = maxMsParam ? Number(maxMsParam) : 45_000;

  try {
    await ensureIndexes();
    const db = await getDb();
    const result = await runSyncBatch(db, { maxMs });

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

    // Rebuild the dashboard snapshot so the first visitor after a sync doesn't
    // pay for recomputing indicators across every listed company.
    let snapshotRows = 0;
    try {
      snapshotRows = await refreshDashboardSnapshot(db);
    } catch (err) {
      console.error("dashboard snapshot refresh failed", err);
    }

    let indexCount = 0;
    try {
      indexCount = await refreshMarketIndices(db);
    } catch (err) {
      console.error("index snapshot refresh failed", err);
    }

    return NextResponse.json({
      ok: true,
      ...result,
      signalChanges,
      snapshotRows,
      indexCount,
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
