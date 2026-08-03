import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getStockDetail } from "@/lib/data";
import { fetchCompanyNews } from "@/lib/mse/news";
import { fetchNewsSources } from "@/lib/mse/newsSources";
import { getSettings } from "@/lib/settings";
import {
  AllProvidersFailedError,
  NoProviderConfiguredError,
  generateMultiProviderSignal,
} from "@/lib/ai/multiAnalyst";
import { humanizeProviderError } from "@/lib/ai/errorMessages";
import type { AiSignal } from "@/lib/types";

/**
 * Re-runs error humanization over a stored document's provider errors.
 * Docs are cached for hours, so this keeps old cached results in step
 * with the current translation rules instead of forever replaying
 * whatever raw/translated text existed at the moment they were written.
 */
function refreshProviderErrors(doc: AiSignal): AiSignal {
  return {
    ...doc,
    providers: doc.providers.map((p) =>
      p.error ? { ...p, error: humanizeProviderError(p.provider, p.error) } : p,
    ),
  };
}

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
      return NextResponse.json(refreshProviderErrors(cached));
    }
  }

  const settings = await getSettings(db);

  let news: Awaited<ReturnType<typeof fetchCompanyNews>> = [];
  try {
    news = await fetchCompanyNews(detail.security.companyCode, 8);
  } catch (err) {
    console.error("news fetch failed", err);
  }

  let externalNews: Awaited<ReturnType<typeof fetchNewsSources>> = [];
  if (settings.newsSources.length > 0) {
    try {
      externalNews = await fetchNewsSources(settings.newsSources);
    } catch (err) {
      console.error("external news source fetch failed", err);
    }
  }

  try {
    const result = await generateMultiProviderSignal(settings, {
      security: detail.security,
      prices: detail.priceHistory,
      financials: detail.financials,
      recommendation: detail.recommendation,
      news,
      externalNews,
    });

    const doc: AiSignal = {
      companyCode: detail.security.companyCode,
      symbol: detail.security.symbol,
      createdAt: new Date(),
      consensus: result.consensus,
      agreement: result.agreement,
      providersUsed: result.providersUsed,
      providers: result.providers,
    };
    await db.collection<AiSignal>("aiSignals").insertOne(doc);
    return NextResponse.json(doc);
  } catch (err) {
    if (err instanceof NoProviderConfiguredError) {
      return NextResponse.json(
        { error: "AI_NOT_CONFIGURED", message: err.message },
        { status: 501 },
      );
    }
    if (err instanceof AllProvidersFailedError) {
      return NextResponse.json(
        { error: "AI_ALL_PROVIDERS_FAILED", message: err.message },
        { status: 502 },
      );
    }
    console.error("AI signal generation failed", err);
    return NextResponse.json(
      { error: "AI_SIGNAL_FAILED", message: (err as Error).message },
      { status: 502 },
    );
  }
}
