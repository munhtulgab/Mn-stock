import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getStockDetail } from "@/lib/data";
import { fetchCompanyNews } from "@/lib/mse/news";
import { AiNotConfiguredError, generateAiSignal } from "@/lib/ai/analyst";
import type { AiSignal } from "@/lib/types";

export const maxDuration = 60;

const CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const db = await getDb();

  const detail = await getStockDetail(db, symbol);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!force) {
    const cached = await db
      .collection<AiSignal>("aiSignals")
      .findOne(
        { companyCode: detail.security.companyCode },
        { sort: { createdAt: -1 } },
      );
    if (cached && Date.now() - cached.createdAt.getTime() < CACHE_MS) {
      return NextResponse.json(cached);
    }
  }

  let news: Awaited<ReturnType<typeof fetchCompanyNews>> = [];
  try {
    news = await fetchCompanyNews(detail.security.companyCode, 8);
  } catch (err) {
    console.error("news fetch failed", err);
  }

  try {
    const { raw, parsed } = await generateAiSignal({
      security: detail.security,
      prices: detail.priceHistory,
      financials: detail.financials,
      recommendation: detail.recommendation,
      news,
    });

    const doc: AiSignal = {
      companyCode: detail.security.companyCode,
      symbol: detail.security.symbol,
      createdAt: new Date(),
      raw,
      parsed,
    };
    await db.collection<AiSignal>("aiSignals").insertOne(doc);
    return NextResponse.json(doc);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json(
        { error: "AI_NOT_CONFIGURED", message: err.message },
        { status: 501 },
      );
    }
    console.error("AI signal generation failed", err);
    return NextResponse.json(
      { error: "AI_SIGNAL_FAILED", message: (err as Error).message },
      { status: 502 },
    );
  }
}
