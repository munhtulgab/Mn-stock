import type { AppSettings } from "@/lib/settings";
import { resolveApiKey } from "@/lib/settings";
import { buildUserMessage, type AnalystInput } from "@/lib/ai/prompt";
import { callAnthropic } from "@/lib/ai/providers/anthropic";
import { callGemini } from "@/lib/ai/providers/gemini";
import { callGroq } from "@/lib/ai/providers/groq";
import { callOpenRouter } from "@/lib/ai/providers/openrouter";
import type { ProviderResult } from "@/lib/ai/providers/types";
import type { ParsedAiSignal } from "@/lib/ai/schema";
import type { Signal } from "@/lib/types";
import { humanizeProviderError } from "@/lib/ai/errorMessages";

export class NoProviderConfiguredError extends Error {
  constructor() {
    super(
      "No AI provider is configured. Set at least one API key on the Тохиргоо page.",
    );
    this.name = "NoProviderConfiguredError";
  }
}

export class AllProvidersFailedError extends Error {
  constructor(public results: ProviderResult[]) {
    super(
      results
        .map((r) => humanizeProviderError(r.provider, r.error ?? "Тодорхойгүй алдаа"))
        .join("; "),
    );
    this.name = "AllProvidersFailedError";
  }
}

export interface ProviderSummary {
  provider: ProviderResult["provider"];
  ok: boolean;
  signal?: Signal;
  confidence?: number;
  error?: string;
}

export interface MultiProviderSignal {
  consensus: ParsedAiSignal;
  agreement: number;
  providersUsed: number;
  providers: ProviderSummary[];
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pickMajoritySignal(results: ProviderResult[]): Signal {
  const counts: Record<Signal, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  const confidenceSum: Record<Signal, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  for (const r of results) {
    if (!r.parsed) continue;
    counts[r.parsed.signal]++;
    confidenceSum[r.parsed.signal] += r.parsed.signal_confidence;
  }
  let best: Signal = "HOLD";
  for (const s of ["BUY", "SELL", "HOLD"] as Signal[]) {
    if (
      counts[s] > counts[best] ||
      (counts[s] === counts[best] && confidenceSum[s] > confidenceSum[best])
    ) {
      best = s;
    }
  }
  return best;
}

function buildConsensus(
  results: ProviderResult[],
  currentPrice: number | null,
): { consensus: ParsedAiSignal; agreement: number } {
  const successful = results.filter(
    (r): r is ProviderResult & { parsed: ParsedAiSignal } => r.ok && !!r.parsed,
  );
  const majority = pickMajoritySignal(successful);
  const agreeing = successful.filter((r) => r.parsed.signal === majority);
  const agreement = agreeing.length / successful.length;

  // Representative provider for the qualitative fields: whichever agreeing
  // result has the highest confidence.
  const representative = [...agreeing].sort(
    (a, b) => b.parsed.signal_confidence - a.parsed.signal_confidence,
  )[0];

  const consensus: ParsedAiSignal = {
    ...representative.parsed,
    signal: majority,
    signal_confidence: Math.round(
      average(agreeing.map((r) => r.parsed.signal_confidence)),
    ),
    price_data: {
      current_price: currentPrice ?? representative.parsed.price_data.current_price,
      target_price_1: average(
        agreeing.map((r) => r.parsed.price_data.target_price_1),
      ),
      target_price_2: average(
        agreeing.map((r) => r.parsed.price_data.target_price_2),
      ),
      stop_loss: average(agreeing.map((r) => r.parsed.price_data.stop_loss)),
    },
    analysis_summary: {
      ...representative.parsed.analysis_summary,
      overall_logic: `${agreeing.length}/${successful.length} үйлчилгээ ${majority} дохио өгсөн (тохиролцоо ${Math.round((agreeing.length / successful.length) * 100)}%). ${representative.parsed.analysis_summary.overall_logic}`,
    },
  };

  return { consensus, agreement };
}

export async function generateMultiProviderSignal(
  settings: AppSettings,
  input: AnalystInput,
): Promise<MultiProviderSignal> {
  const anthropicKey = resolveApiKey(settings, "anthropic", "ANTHROPIC_API_KEY");
  const geminiKey = resolveApiKey(settings, "gemini", "GEMINI_API_KEY");
  const groqKey = resolveApiKey(settings, "groq", "GROQ_API_KEY");
  const openrouterKey = resolveApiKey(settings, "openrouter", "OPENROUTER_API_KEY");

  if (!anthropicKey && !geminiKey && !groqKey && !openrouterKey) {
    throw new NoProviderConfiguredError();
  }

  const userMessage = buildUserMessage(input);

  const calls: Promise<ProviderResult>[] = [];
  if (anthropicKey) calls.push(callAnthropic(anthropicKey, userMessage));
  if (geminiKey) calls.push(callGemini(geminiKey, userMessage));
  if (groqKey) calls.push(callGroq(groqKey, userMessage));
  if (openrouterKey) calls.push(callOpenRouter(openrouterKey, userMessage));

  const results = await Promise.all(calls);
  const successful = results.filter((r) => r.ok && r.parsed);

  if (successful.length === 0) {
    throw new AllProvidersFailedError(results);
  }

  const currentPrice = input.prices.at(-1)?.close ?? null;
  const { consensus, agreement } = buildConsensus(results, currentPrice);

  return {
    consensus,
    agreement,
    providersUsed: successful.length,
    providers: results.map((r) => ({
      provider: r.provider,
      ok: r.ok,
      signal: r.parsed?.signal,
      confidence: r.parsed?.signal_confidence,
      error: r.error ? humanizeProviderError(r.provider, r.error) : undefined,
    })),
  };
}
