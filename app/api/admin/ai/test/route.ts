import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSettings, resolveApiKey } from "@/lib/settings";
import { isSettingsRequestAuthorized } from "@/lib/settingsAuth";
import { PROVIDER_CATALOG, isProviderName } from "@/lib/ai/providers/catalog";
import { humanizeProviderError } from "@/lib/ai/errorMessages";
import { callAnthropic } from "@/lib/ai/providers/anthropic";
import { callGemini } from "@/lib/ai/providers/gemini";
import { callGroq } from "@/lib/ai/providers/groq";
import { callOpenRouter } from "@/lib/ai/providers/openrouter";
import { callMistral } from "@/lib/ai/providers/mistral";
import { callZai } from "@/lib/ai/providers/zai";
import { callNvidia } from "@/lib/ai/providers/nvidia";
import { callCloudflare } from "@/lib/ai/providers/cloudflare";
import {
  PROVIDER_TOKEN_BUDGET,
  completionTokensFor,
  type ProviderName,
  type ProviderResult,
} from "@/lib/ai/providers/types";
import { buildPrompt, type AnalystPrompt } from "@/lib/ai/prompt";
import { buildAnalysis } from "@/lib/analysis/report";
import { getStockDetail } from "@/lib/data";
import { ulaanbaatarDay } from "@/lib/day";
import type { Db } from "mongodb";

export const dynamic = "force-dynamic";
/** One provider, one call, and some of them think for a minute and a half. */
export const maxDuration = 180;

/**
 * The question the panel actually asks, against a real company.
 *
 * A miniature prompt was tried first and thrown away. It is cheaper and it
 * lies: `nemotron-3-super` answers a short Mongolian question in Mongolian
 * and this app's real nine-thousand-token prompt in English, so a test built
 * on a toy would have reported a model as working and left the panel
 * unreadable. A test whose result does not predict the thing being tested is
 * worse than no test.
 *
 * So it is the same builder, the same analysis and the same per-provider
 * token budget the panel uses — one real analysis, which is what one press
 * of this button costs the plan.
 */
async function buildTestPrompt(db: Db, symbol: string, provider: ProviderName) {
  const detail = await getStockDetail(db, symbol);
  if (!detail) return null;
  const analysis = await buildAnalysis(
    db,
    detail.security,
    detail.priceHistory.at(-1)?.close ?? null,
    ulaanbaatarDay(new Date()),
  ).catch(() => null);

  return buildPrompt({
    security: detail.security,
    prices: detail.priceHistory,
    financials: detail.financials,
    recommendation: detail.recommendation,
    news: [],
    externalNews: [],
    analysis,
    budgetTokens: PROVIDER_TOKEN_BUDGET[provider],
    completionTokens: completionTokensFor(provider),
  });
}

function run(
  provider: ProviderName,
  apiKey: string,
  model: string | undefined,
  accountId: string | undefined,
  prompt: AnalystPrompt,
): Promise<ProviderResult> {
  switch (provider) {
    case "anthropic":
      return callAnthropic(apiKey, prompt, model);
    case "gemini":
      return callGemini(apiKey, prompt, model);
    case "groq":
      return callGroq(apiKey, prompt, model);
    case "openrouter":
      return callOpenRouter(apiKey, prompt, model);
    case "mistral":
      return callMistral(apiKey, prompt, model);
    case "zai":
      return callZai(apiKey, prompt, model);
    case "nvidia":
      return callNvidia(apiKey, prompt, model);
    case "cloudflare":
      return callCloudflare(apiKey, accountId!, prompt, model);
  }
}

/** Cyrillic against Latin, which is what "did it answer in Mongolian" means. */
function languageOf(text: string): { cyrillic: number; latin: number } {
  return {
    cyrillic: (text.match(/[Ѐ-ӿ]/g) ?? []).length,
    latin: (text.match(/[A-Za-z]/g) ?? []).length,
  };
}

/**
 * Try one model and report what came back.
 *
 * The model is taken from the request rather than from the settings, so a
 * candidate can be tried before it is saved — which is the whole point:
 * saving a model that turns out to answer in English, or not at all, means
 * the panel is broken until somebody notices.
 */
export async function POST(req: NextRequest) {
  const db = await getDb();
  if (!(await isSettingsRequestAuthorized(db, req.headers.get("cookie")))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const provider = body.provider;
  if (!isProviderName(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : undefined;

  const settings = await getSettings(db);
  const entry = PROVIDER_CATALOG[provider];
  const apiKey = resolveApiKey(
    settings,
    provider as keyof typeof settings.apiKeys,
    `${provider.toUpperCase()}_API_KEY`,
  );
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      message: `${entry.label}: API түлхүүр тохируулаагүй байна.`,
    });
  }
  const accountId =
    settings.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  if (entry.needsAccountId && !accountId) {
    return NextResponse.json({
      ok: false,
      message: `${entry.label}: Account ID шаардлагатай.`,
    });
  }

  // The symbol is settable so a model can be tried against the company the
  // operator cares about; APU because it is the most-traded and has every
  // section of the analysis filled in, which is the hardest prompt to answer.
  const symbol =
    typeof body.symbol === "string" && body.symbol.trim()
      ? body.symbol.trim().toUpperCase()
      : "APU";
  const prompt = await buildTestPrompt(db, symbol, provider);
  if (!prompt) {
    return NextResponse.json({ ok: false, message: `${symbol}: компани олдсонгүй.` });
  }

  const started = Date.now();
  const result = await run(provider, apiKey, model, accountId, prompt);
  const ms = Date.now() - started;

  if (!result.ok || !result.parsed) {
    return NextResponse.json({
      ok: false,
      ms,
      message: humanizeProviderError(provider, result.error ?? "Тодорхойгүй алдаа"),
    });
  }

  const summary = result.parsed.analysis_summary;
  const { cyrillic, latin } = languageOf(
    [summary.technical_reason, summary.fundamental_reason, summary.overall_logic].join(" "),
  );
  // Indicator names stay in Latin by design, so the test is which script the
  // prose is in rather than whether any Latin appears at all.
  const mongolian = cyrillic > latin;

  return NextResponse.json({
    ok: true,
    ms,
    signal: result.parsed.signal,
    confidence: result.parsed.signal_confidence,
    cyrillic,
    latin,
    mongolian,
    sample: summary.overall_logic.slice(0, 160),
    symbol,
    message: mongolian
      ? `${symbol}: ажиллаж байна — ${result.parsed.signal}, ${(ms / 1000).toFixed(1)}с.`
      : `${symbol}: хариу ирлээ ч монголоор бичээгүй (кирилл ${cyrillic}, латин ${latin}).`,
  });
}
