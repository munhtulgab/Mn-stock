import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import type { PricePoint, Security } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Every session this app has stored for one security.
 *
 * The company page already carries candles, but only twelve years of them —
 * enough for the long averages and the scorecards, which is what that number
 * was chosen for. The chart's "Бүх цаг үе" meant something longer than that
 * and was quietly given the same twelve years, so a listing that has traded
 * since before then showed a history that began in the middle.
 *
 * Sent from here instead of widening the page's own read: the whole-market
 * pass uses the same reader, and thirty years of daily prices for four
 * hundred listings is a different job from drawing one chart. This is asked
 * for only when somebody picks the range that needs it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const db = await getDb();
  if (!(await getCurrentUser(db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { symbol } = await params;
  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() }, { projection: { companyCode: 1 } });
  if (!security) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rows = await db
    .collection<PricePoint>("prices")
    .find(
      { companyCode: security.companyCode },
      {
        projection: {
          _id: 0,
          date: 1,
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
        },
      },
    )
    .sort({ date: 1 })
    .toArray();

  return NextResponse.json({
    candles: rows.map((row) => ({
      date: row.date,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
    })),
  });
}
