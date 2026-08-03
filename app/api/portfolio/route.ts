import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioSummary } from "@/lib/portfolio";

export async function GET() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await getPortfolioSummary(db, user._id!);
  return NextResponse.json(summary);
}
