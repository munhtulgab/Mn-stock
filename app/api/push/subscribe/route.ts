import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { saveSubscription } from "@/lib/push";

/**
 * Stores a device's push subscription, and who is signed in on it.
 *
 * Called when a reader turns alerts on, and again every time the app is
 * opened on a device that already has them on (see `PwaRegister`). The
 * second call is what keeps the device pointed at the right person: the
 * subscriptions made before they carried a reader pick one up the next time
 * they are opened, and a device that has been signed out of is unlinked from
 * the account that used to own it, so it stops receiving that account's
 * alerts about that account's money.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const db = await getDb();
  const user = await getCurrentUser(db);
  await saveSubscription(db, {
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    createdAt: new Date(),
    userId: user?._id ? String(user._id) : null,
  });

  return NextResponse.json({ ok: true });
}
