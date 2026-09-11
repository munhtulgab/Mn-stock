import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";

/**
 * How many alerts this reader has not opened yet.
 *
 * The bell is drawn on four pages and its number comes from the render that
 * drew it, so a reader who clears a row and then taps through to another tab
 * is shown the count as it stood before — the router serves the payload it
 * already had for that route rather than asking again. The bell asks here
 * instead, which is a few bytes and cannot be served out of a cache of a
 * page that was rendered earlier.
 *
 * A static segment, so it is matched ahead of the `[id]` route beside it.
 */
export async function GET() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ unread: 0 }, { status: 401 });
  return NextResponse.json(
    { unread: await getUnreadCount(db, user) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
