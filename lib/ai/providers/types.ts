import type { ParsedAiSignal } from "@/lib/ai/schema";

export type ProviderName =
  | "anthropic"
  | "gemini"
  | "groq"
  | "openrouter"
  | "mistral"
  | "cerebras"
  | "cloudflare";

/**
 * The room each provider leaves for one request, in tokens.
 *
 * Groq's free tier meters tokens a minute rather than a context window, and
 * a single request counted against that allowance is refused whole with a
 * 413 — which is what happened here: llama-3.3-70b-versatile allows twelve
 * thousand a minute, and the prompt carrying the full analysis came to
 * roughly fifteen. The figure below is what is left for the user message
 * after the system prompt (~4,100 measured) and the 1,500-token completion
 * are taken out, with a further margin because every provider counts
 * differently and the estimate is only an estimate.
 *
 * The others are left out on purpose. Gemini and the models behind
 * OpenRouter take hundreds of thousands of tokens of context; giving them a
 * ceiling would trim a prompt they were perfectly happy with, and they are
 * answering well on the full one.
 */
export const PROVIDER_TOKEN_BUDGET: Partial<Record<ProviderName, number>> = {
  groq: 5_000,
  // Workers AI's Llama models carry a 24k context. Comfortable for the
  // analysis, not for the analysis plus six sites' front pages.
  cloudflare: 8_000,
  // Cerebras advertises a wide context on gpt-oss-120b, but this one could
  // not be measured — inference is refused until the account has billing —
  // so it gets a bound rather than the benefit of the doubt. Raise it once
  // a real run has been seen.
  cerebras: 12_000,
};

export interface ProviderResult {
  provider: ProviderName;
  ok: boolean;
  raw?: string;
  parsed?: ParsedAiSignal;
  error?: string;
}
