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
 * What one whole request may cost each provider, in tokens.
 *
 * The whole request: the instructions, the message, and the room the answer
 * needs. That is what the providers imposing a ceiling actually meter — Groq's
 * free tier counts tokens a minute rather than a context window, and a single
 * request counted against that allowance is refused whole with a 413.
 *
 * This used to be the room left for the user message alone, with the system
 * prompt's cost written into the comment as "~4,100 measured". It was 6,901
 * by the time anyone looked. Two numbers that have to be subtracted from each
 * other cannot live in two places, one of them a comment, so the figures below
 * are now the ceilings themselves and the builder does the subtraction.
 *
 * The others are left out on purpose. Gemini and the models behind OpenRouter
 * take hundreds of thousands of tokens of context; giving them a ceiling would
 * trim a prompt they were perfectly happy with, and they are answering well on
 * the full one.
 */
export const PROVIDER_TOKEN_BUDGET: Partial<Record<ProviderName, number>> = {
  // llama-3.3-70b-versatile on the free tier: twelve thousand a minute.
  //
  // Stated as the provider states it, with no margin subtracted here. The
  // margin is already in `estimateTokens`, which charges a whole token for
  // every Cyrillic character against a measured 1.33 characters per token —
  // roughly a third high on a prompt that is almost all Cyrillic. Taking a
  // second margin on top of that was costing this provider a section of the
  // analysis it had room for.
  groq: 12_000,
  // Workers AI's Llama models carry a 24k context.
  cloudflare: 24_000,
  // Cerebras advertises a wide context on gpt-oss-120b, but this one could
  // not be measured — inference is refused until the account has billing —
  // so it gets a bound rather than the benefit of the doubt. Raise it once
  // a real run has been seen.
  cerebras: 20_000,
};

export interface ProviderResult {
  provider: ProviderName;
  ok: boolean;
  raw?: string;
  parsed?: ParsedAiSignal;
  error?: string;
}
