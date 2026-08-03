import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { removeSubscription } from "@/lib/push";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.endpoint) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDb();
  await removeSubscription(db, body.endpoint);

  return NextResponse.json({ ok: true });
}
