import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { dismiss, markRead } from "@/lib/notifications";

/**
 * One alert's state for the reader who is signed in.
 *
 * POST marks it read — sent as the reader taps through to what it is about,
 * which is the only thing that counts as reading it. DELETE takes it out of
 * their feed, which is what a swipe does.
 *
 * Both are per reader rather than to the alert itself: the feed is written
 * once for the market and read by everybody, so one reader clearing a row
 * must not clear it for the next.
 */
async function resolve(id: string) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user?._id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // The id goes into a $addToSet as a plain string, so nothing here can reach
  // the query — but a caller sending something that is not an id at all has
  // made a mistake worth answering rather than storing.
  if (!/^[0-9a-f]{24}$/i.test(id)) {
    return { error: NextResponse.json({ error: "Bad id" }, { status: 400 }) };
  }
  return { db, userId: user._id };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resolved = await resolve(id);
  if (resolved.error) return resolved.error;

  await markRead(resolved.db, resolved.userId, id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resolved = await resolve(id);
  if (resolved.error) return resolved.error;

  await dismiss(resolved.db, resolved.userId, id);
  return NextResponse.json({ ok: true });
}
