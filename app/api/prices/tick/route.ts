import { NextRequest, NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import { fetchLiveQuotes, type LiveQuote } from "@/lib/marketinfo/quotes";
import { refreshDashboardSnapshot } from "@/lib/data";
import { checkSignalChangesAndNotify } from "@/lib/signalHistory";
import { ulaanbaatarDateTime } from "@/lib/day";

/**
 * A price check, every couple of minutes through the trading session.
 *
 * `/api/sync` walks the whole exchange for histories and financial reports
 * and takes minutes; it runs once a day and has no business running ninety
 * times. This is the light one: a single call to the live feed, and work
 * afterwards only if something actually moved.
 *
 * What it buys, given every page already fetches the running price itself:
 * the market is watched while nobody is looking. A signal that turns at
 * eleven o'clock is noticed at eleven o'clock and its alert goes out then,
 * rather than waiting for the daily sync or for somebody to happen to open
 * the app.
 */

export const maxDuration = 60;

const SNAPSHOT_KEY = "priceTick";

interface TickState {
  key: string;
  /** Last quoted price per company, to tell a real move from a repeat. */
  prices: Record<string, number>;
  checkedAt: Date;
}

/**
 * The scheduler, or someone signed in asking for one by hand.
 *
 * Same rule as the news refresh: the bearer token when the deployment has a
 * secret, and the scheduler's own user agent when it does not — otherwise a
 * deployment without CRON_SECRET set has a cron that is turned away 401 on
 * every firing and a market nobody is watching.
 */
function isScheduled(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  return /vercel-cron/i.test(req.headers.get("user-agent") ?? "");
}

/** Companies whose quoted price differs from the one the last tick saw. */
function moved(
  quotes: Map<number, LiveQuote>,
  previous: Record<string, number>,
): number {
  let count = 0;
  for (const [companyCode, quote] of quotes) {
    if (quote.price === null) continue;
    const before = previous[String(companyCode)];
    if (before === undefined || before !== quote.price) count++;
  }
  return count;
}

function currentPrices(quotes: Map<number, LiveQuote>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [companyCode, quote] of quotes) {
    if (quote.price !== null) out[String(companyCode)] = quote.price;
  }
  return out;
}

async function handle(req: NextRequest) {
  if (!isScheduled(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db: Db = await getDb();
  const checkedAt = new Date();

  const settings = await getSettings(db).catch(() => ({ extraCaCerts: undefined }));
  // A generous budget: nothing is waiting on this, and giving up early would
  // mean a tick that saw nothing and a session that went unwatched.
  const quotes = await fetchLiveQuotes({
    extraCaCerts: settings.extraCaCerts,
    budgetMs: 20_000,
  }).catch(() => new Map<number, LiveQuote>());

  const state = await db
    .collection<TickState>("marketSnapshots")
    .findOne({ key: SNAPSHOT_KEY });

  if (quotes.size === 0) {
    // The exchange is shut, or the feed is down. Either way there is nothing
    // to recompute, and saying so is cheaper than pretending otherwise.
    return NextResponse.json({
      ok: true,
      at: ulaanbaatarDateTime(checkedAt),
      quoted: 0,
      moved: 0,
      recomputed: false,
    });
  }

  const changed = moved(quotes, state?.prices ?? {});

  await db.collection<TickState>("marketSnapshots").updateOne(
    { key: SNAPSHOT_KEY },
    { $set: { key: SNAPSHOT_KEY, prices: currentPrices(quotes), checkedAt } },
    { upsert: true },
  );

  // Nothing traded since the last look. The feed republishes on its own
  // clock and most of this market does not trade most minutes, so this is
  // the common answer and it costs one request to reach.
  if (changed === 0) {
    return NextResponse.json({
      ok: true,
      at: ulaanbaatarDateTime(checkedAt),
      quoted: quotes.size,
      moved: 0,
      recomputed: false,
    });
  }

  // Something moved, so the stored rows every list is served from are now
  // behind the market, and a recommendation computed from them may have
  // turned. Snapshot first: the signal check reads those same rows, and the
  // other order compares against a snapshot built before this tick.
  let snapshotRows = 0;
  try {
    snapshotRows = await refreshDashboardSnapshot(db);
  } catch (err) {
    console.error("price tick: snapshot refresh failed", err);
  }

  let signalChanges: Awaited<ReturnType<typeof checkSignalChangesAndNotify>> = {
    changes: [],
    notified: false,
    smsSent: 0,
  };
  try {
    signalChanges = await checkSignalChangesAndNotify(db);
  } catch (err) {
    console.error("price tick: signal check failed", err);
  }

  return NextResponse.json({
    ok: true,
    at: ulaanbaatarDateTime(checkedAt),
    quoted: quotes.size,
    moved: changed,
    recomputed: true,
    snapshotRows,
    signalChanges,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
