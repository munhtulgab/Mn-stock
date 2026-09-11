import type { AppSettings } from "@/lib/settings";
import { resolveApiKey } from "@/lib/settings";
import { buildPrompt, type AnalystInput, type AnalystPrompt } from "@/lib/ai/prompt";
import { callAnthropic } from "@/lib/ai/providers/anthropic";
import { callGemini } from "@/lib/ai/providers/gemini";
import { callGroq } from "@/lib/ai/providers/groq";
import { callOpenRouter } from "@/lib/ai/providers/openrouter";
import { callMistral } from "@/lib/ai/providers/mistral";
import { callCerebras } from "@/lib/ai/providers/cerebras";
import { callCloudflare } from "@/lib/ai/providers/cloudflare";
import {
  PROVIDER_TOKEN_BUDGET,
  completionTokensFor,
  type ProviderName,
  type ProviderResult,
} from "@/lib/ai/providers/types";
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
  const mistralKey = resolveApiKey(settings, "mistral", "MISTRAL_API_KEY");
  const cerebrasKey = resolveApiKey(settings, "cerebras", "CEREBRAS_API_KEY");
  const cloudflareKey = resolveApiKey(settings, "cloudflare", "CLOUDFLARE_API_KEY");
  // Workers AI addresses the account in the URL, so a key on its own is not
  // enough to call it. Without the id the provider simply does not run,
  // rather than every request 404ing against a path with `undefined` in it.
  const cloudflareAccount =
    settings.cloudflareAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;

  if (
    !anthropicKey &&
    !geminiKey &&
    !groqKey &&
    !openrouterKey &&
    !mistralKey &&
    !cerebrasKey &&
    !(cloudflareKey && cloudflareAccount)
  ) {
    throw new NoProviderConfiguredError();
  }

  // One message per pair of ceilings rather than one for everybody. A
  // provider that meters tokens by the minute gets a prompt trimmed to fit
  // it; the rest get the whole thing, because trimming theirs would cost
  // them evidence they were happy to read.
  //
  // Both ceilings, not just the one on the question: a provider metering the
  // whole exchange takes its answer's room out of the question's, and is
  // asked for a shorter answer to fit — so two providers that agree on the
  // message ceiling can still need different messages.
  const prompts = new Map<string, AnalystPrompt>();
  const messageFor = (provider: ProviderName): AnalystPrompt => {
    const budget = PROVIDER_TOKEN_BUDGET[provider];
    const completionTokens = completionTokensFor(provider);
    const key = `${budget ?? "-"}:${completionTokens}`;
    const existing = prompts.get(key);
    if (existing !== undefined) return existing;
    const built = buildPrompt({ ...input, budgetTokens: budget, completionTokens });
    prompts.set(key, built);
    return built;
  };

  const calls: Promise<ProviderResult>[] = [];
  if (anthropicKey) calls.push(callAnthropic(anthropicKey, messageFor("anthropic")));
  if (geminiKey) calls.push(callGemini(geminiKey, messageFor("gemini")));
  if (groqKey) calls.push(callGroq(groqKey, messageFor("groq")));
  if (openrouterKey) calls.push(callOpenRouter(openrouterKey, messageFor("openrouter")));
  if (mistralKey) calls.push(callMistral(mistralKey, messageFor("mistral")));
  if (cerebrasKey) calls.push(callCerebras(cerebrasKey, messageFor("cerebras")));
  if (cloudflareKey && cloudflareAccount) {
    calls.push(
      callCloudflare(cloudflareKey, cloudflareAccount, messageFor("cloudflare")),
    );
  }

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
