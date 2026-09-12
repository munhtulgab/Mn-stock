import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getGoldPrices } from "@/lib/gold";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Mongolbank's gold buying price, a hundredth of a gram at a time.
 *
 * Asked for only when a reader picks the gold view on a chart, so the page
 * itself carries none of it — most charts are opened and closed without ever
 * wanting this, and a series of two and a half thousand points is not worth
 * putting in every one of them.
 */
export async function GET() {
  const db = await getDb();
  if (!(await getCurrentUser(db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prices = await getGoldPrices(db);
  return NextResponse.json({ prices });
}
