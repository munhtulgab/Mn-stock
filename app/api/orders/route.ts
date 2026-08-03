import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getTransactions } from "@/lib/portfolio";

export async function GET() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const transactions = await getTransactions(db, user._id!);
  return NextResponse.json({ transactions });
}
