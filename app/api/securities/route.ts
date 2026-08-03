import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getDashboardRows } from "@/lib/data";

export async function GET() {
  const db = await getDb();
  const rows = await getDashboardRows(db);
  return NextResponse.json({ rows });
}
