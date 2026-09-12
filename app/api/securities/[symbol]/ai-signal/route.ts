import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getStockDetailFresh } from "@/lib/data";
import { fetchCompanyNews } from "@/lib/mse/news";
import {
  companySearchTerms,
  fetchNewsSources,
  usableExtracts,
} from "@/lib/mse/newsSources";
import { getSettings } from "@/lib/settings";
import {
  AllProvidersFailedError,
  NoProviderConfiguredError,
  generateMultiProviderSignal,
} from "@/lib/ai/multiAnalyst";
import { humanizeProviderError } from "@/lib/ai/errorMessages";
import { buildAnalysis } from "@/lib/analysis/report";
import { ulaanbaatarDay } from "@/lib/day";
import type { AiSignal, Security } from "@/lib/types";

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

/**
 * A run is a chain of third parties: the exchange for a fresh price, the
 * newsroom, then every configured model. Sixty seconds was enough for the
 * models alone and the whole thing died at the ceiling when the news took a
 * while, so the run is given room to finish rather than half-finish.
 */
export const maxDuration = 180;

const CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const db = await getDb();

  // The stored answer is looked for first. Everything below it — a live
  // price sync, the newsroom, the models — is the expensive part, and a
  // cached hit used to pay for all of it before finding out it was a hit.
  const security = await db
    .collection<Security>("securities")
    .findOne({ symbol: symbol.toUpperCase() });
  if (!security) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!force) {
    const cached = await db
      .collection<AiSignal>("aiSignals")
      .findOne({ companyCode: security.companyCode }, { sort: { createdAt: -1 } });
    if (cached && Date.now() - cached.createdAt.getTime() < CACHE_MS) {
      return NextResponse.json(refreshProviderErrors(cached));
    }
  }

  const detail = await getStockDetailFresh(db, symbol);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await getSettings(db);

  let news: Awaited<ReturnType<typeof fetchCompanyNews>> = [];
  try {
    news = await fetchCompanyNews(detail.security.companyCode, 8);
  } catch (err) {
    console.error("news fetch failed", err);
  }

  // Only sources that produced real text reach the prompt — a login wall or
  // a bot-challenge page would otherwise be fed to the LLM as if it were news.
  let externalNews: ReturnType<typeof usableExtracts> = [];
  if (settings.newsSources.length > 0) {
    try {
      const results = await fetchNewsSources(settings.newsSources, {
        // Sources that can be queried are asked about this company, so the
        // prompt gets its coverage rather than only the day's front page.
        searchTerms: companySearchTerms(
          detail.security.symbol,
          detail.security.name,
        ),
        apifyToken: settings.apifyToken,
        facebookToken: settings.facebookToken,
        facebookCookie: settings.facebookCookie,
        db,
        extraCaCerts: settings.extraCaCerts,
      });
      for (const r of results.filter((r) => r.status !== "ok")) {
        console.warn(`news source unusable (${r.status}): ${r.url} — ${r.reason}`);
      }
      externalNews = usableExtracts(results);
    } catch (err) {
      console.error("external news source fetch failed", err);
    }
  }

  // The same analysis the company's page shows: the technical scorecards,
  // the ratios ranked against the sector, the dividends, the risk figures,
  // the peer table and our own combined verdict. Without it every model was
  // being asked to judge a company from thirty candles and six ratios while
  // the page beneath it carried a far better picture.
  //
  // Never fatal: it reads every other company's last report to build the
  // ranking, and a run that cannot do that should still return an answer
  // from the prices and the news, as it always did.
  const analysis = await buildAnalysis(
    db,
    detail.security,
    detail.priceHistory.at(-1)?.close ?? null,
    ulaanbaatarDay(new Date()),
  ).catch((err) => {
    console.error(`analysis for the AI prompt failed (${detail.security.symbol})`, err);
    return null;
  });

  try {
    const result = await generateMultiProviderSignal(settings, {
      security: detail.security,
      prices: detail.priceHistory,
      financials: detail.financials,
      recommendation: detail.recommendation,
      news,
      externalNews,
      analysis,
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
