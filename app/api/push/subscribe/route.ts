import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { saveSubscription } from "@/lib/push";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const db = await getDb();
  await saveSubscription(db, {
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
