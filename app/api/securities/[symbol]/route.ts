import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getStockDetail } from "@/lib/data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const db = await getDb();
  const detail = await getStockDetail(db, symbol);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
