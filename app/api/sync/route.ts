import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureIndexes } from "@/lib/mongodb";
import { runSyncBatch } from "@/lib/sync";
import { checkSignalChangesAndNotify } from "@/lib/signalHistory";

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
    };
    try {
      signalChanges = await checkSignalChangesAndNotify(db);
    } catch (err) {
      console.error("signal change check failed", err);
    }

    return NextResponse.json({ ok: true, ...result, signalChanges });
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
