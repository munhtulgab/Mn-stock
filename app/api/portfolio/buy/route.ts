import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { PortfolioError, buyStock } from "@/lib/portfolio";

export async function POST(req: NextRequest) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const symbol = typeof body.symbol === "string" ? body.symbol : "";
  const quantity = Number(body.quantity);

  try {
    const summary = await buyStock(db, user._id!, symbol, quantity);
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof PortfolioError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("buy failed", err);
    return NextResponse.json({ error: "Худалдан авахад алдаа гарлаа" }, { status: 500 });
  }
}
