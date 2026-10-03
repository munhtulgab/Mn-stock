import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
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

/**
 * One panel at a time per company.
 *
 * Every provider here is on a free tier metered by the minute or the second:
 * Groq allows 8K tokens a minute, which is one prompt; a free Mistral key
 * allows one request a second. Two runs for the same company inside a minute
 * — a reader pressing Дахин тооцоолох while the page's own request is still
 * out, or two tabs — sent two full panels, and the second found every meter
 * spent and came back as a row of quota errors. That is what was on screen
 * on 3 October: two requests six seconds apart, Groq and Mistral both "rate
 * limit" on the second.
 *
 * So the second waits for the first and is answered with what it produced.
 * The claim is an upsert on the company code; one older than the route's own
 * time limit is a run that died and is taken over.
 */
const RUN_LOCK_MS = 3 * 60 * 1000;
const RUN_POLL_MS = 2_000;
/** Inside the route's 180s, with room to answer. */
const RUN_WAIT_MS = 170_000;

type RunClaim = { _id: number; startedAt: Date };

async function claimRun(
  db: Awaited<ReturnType<typeof getDb>>,
  companyCode: number,
): Promise<{ mine: true; startedAt: Date } | { mine: false; startedAt: Date }> {
  const runs = db.collection<RunClaim>("aiSignalRuns");
  const now = new Date();
  try {
    await runs.updateOne(
      { _id: companyCode, startedAt: { $lt: new Date(now.getTime() - RUN_LOCK_MS) } },
      { $set: { startedAt: now } },
      { upsert: true },
    );
    return { mine: true, startedAt: now };
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    const held = await runs.findOne({ _id: companyCode });
    return { mine: false, startedAt: held?.startedAt ?? now };
  }
}

/** The answer the run already under way produces, once it has. */
async function awaitRun(
  db: Awaited<ReturnType<typeof getDb>>,
  companyCode: number,
  startedAt: Date,
): Promise<AiSignal | null> {
  const until = Date.now() + RUN_WAIT_MS;
  while (Date.now() < until) {
    const done = await db
      .collection<AiSignal>("aiSignals")
      .findOne({ companyCode, createdAt: { $gte: startedAt } }, { sort: { createdAt: -1 } });
    if (done) return done;
    const still = await db.collection<RunClaim>("aiSignalRuns").findOne({ _id: companyCode });
    // Released without writing anything: that run failed, and this one may
    // as well report the stored answer than start the same failure again.
    if (!still || still.startedAt.getTime() !== startedAt.getTime()) return null;
    await new Promise((resolve) => setTimeout(resolve, RUN_POLL_MS));
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const force = req.nextUrl.searchParams.get("force") === "1";
  const db = await getDb();

  // Signed in only. Every run spends free-tier allowances at seven providers,
  // and this answered anyone who knew the address — `?force=1` from outside
  // the app could empty Groq's minute and Mistral's day for the reader who
  // actually opened the page. The page itself is behind the login already.
  if (!(await getCurrentUser(db))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const claim = await claimRun(db, security.companyCode);
  if (!claim.mine) {
    const produced = await awaitRun(db, security.companyCode, claim.startedAt);
    const fallback =
      produced ??
      (await db
        .collection<AiSignal>("aiSignals")
        .findOne({ companyCode: security.companyCode }, { sort: { createdAt: -1 } }));
    if (fallback) return NextResponse.json(refreshProviderErrors(fallback));
    return NextResponse.json(
      { error: "AI_RUN_IN_PROGRESS", message: "Шинжилгээ хийгдэж байна, түр хүлээгээд дахин оролдоно уу." },
      { status: 409 },
    );
  }

  try {
    return await runPanel(db, symbol);
  } finally {
    await db
      .collection<RunClaim>("aiSignalRuns")
      .deleteOne({ _id: security.companyCode, startedAt: claim.startedAt })
      .catch(() => {});
  }
}

async function runPanel(db: Awaited<ReturnType<typeof getDb>>, symbol: string) {
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
