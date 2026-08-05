import type { AppSettings } from "@/lib/settings";
import { resolveApiKey } from "@/lib/settings";
import { buildUserMessage, type AnalystInput } from "@/lib/ai/prompt";
import { callAnthropic } from "@/lib/ai/providers/anthropic";
import { callGemini } from "@/lib/ai/providers/gemini";
import { callGroq } from "@/lib/ai/providers/groq";
import { callOpenRouter } from "@/lib/ai/providers/openrouter";
import type { ProviderResult } from "@/lib/ai/providers/types";
import type { ParsedAiSignal } from "@/lib/ai/schema";
import { buildConsensus, validateSignal } from "@/lib/ai/consensus";
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

  const currentPrice = input.prices.at(-1)?.close ?? null;

  // Every answer is checked against the price before it is allowed to vote:
  // a model that calls BUY and names a target below today's close has
  // contradicted itself, and averaging that in would carry the contradiction
  // into what the reader is shown.
  const results = (await Promise.all(calls)).map((r): ProviderResult => {
    if (!r.ok || !r.parsed) return r;
    const check = validateSignal(r.parsed, input.security.symbol, currentPrice);
    if (!check.ok) {
      return { ...r, ok: false, parsed: undefined, error: check.reason };
    }
    return { ...r, parsed: check.value };
  });

  const successful = results.filter((r) => r.ok && r.parsed);
  if (successful.length === 0) {
    throw new AllProvidersFailedError(results);
  }

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
