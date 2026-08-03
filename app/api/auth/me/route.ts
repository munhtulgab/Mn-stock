import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser, toSafeUser } from "@/lib/auth";

export async function GET() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: toSafeUser(user) });
}
