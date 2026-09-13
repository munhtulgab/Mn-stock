import type { ParsedAiSignal } from "@/lib/ai/schema";

export type ProviderName =
  | "anthropic"
  | "gemini"
  | "groq"
  | "openrouter"
  | "mistral"
  | "cerebras"
  | "cloudflare"
  | "zai"
  | "nvidia";

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

/**
 * Room for the answer, in tokens — both what is asked for and what is set
 * aside for it.
 *
 * One number, because it is two sides of one subtraction: a provider that
 * meters the whole exchange refuses a request whose reply would take it past
 * the ceiling, so the room reserved when the question is built has to be the
 * room the answer is actually allowed. It lived in two files at 1,500 apiece
 * and drifting them apart would have been a 413 nobody could see the cause of.
 *
 * Raised from that 1,500 because the answer is written in Mongolian. The
 * three reasons the schema asks for are prose, and Cyrillic costs about a
 * token a character against five for English — so an answer that reads as
 * three short paragraphs is well over a thousand tokens before the JSON
 * around it, and a verbose one ran past the ceiling and was cut off
 * mid-string. Groq reported `finish_reason: "length"` on a run whose answer
 * was fine; there was no room to finish it.
 *
 * Headroom is close to free: a completion is billed for what it generates,
 * not for what it was allowed — so the default is set where no answer this
 * schema asks for can reach it.
 */
export const COMPLETION_TOKENS = 4_000;

/**
 * Where the answer has to be smaller than that.
 *
 * Only where a provider meters the whole exchange, because there the room
 * for the answer is room taken from the question. Groq allows twelve
 * thousand tokens a minute; the system prompt and the three criteria a
 * verdict must rest on are about nine thousand seven hundred of that and
 * cannot be trimmed further, so what is left for an answer is a little over
 * two thousand however generous one would like to be. Asking for four
 * thousand there does not buy a longer answer — it makes the whole request
 * too large and Groq refuses it with a 413.
 *
 * So Groq is given what fits, and asked for a shorter answer instead: see
 * `brief` in the system prompt.
 */
export const PROVIDER_COMPLETION_TOKENS: Partial<Record<ProviderName, number>> = {
  // Fifteen hundred, and it stays there because there is nowhere to go.
  //
  // Measured, not chosen. Composed down to its last step — the three
  // criteria a verdict must rest on and nothing else — the question still
  // costs about 10,400 tokens of the 12,000, so under 1,600 is the most any
  // answer could ever be allowed here. Raising this was tried first and the
  // test "every metered provider's whole exchange fits its ceiling" refused
  // it, which is what that test is for.
  //
  // So when Groq reported `finish_reason: "length"` the answer had to get
  // smaller rather than the allowance bigger: BREVITY_RULE now bounds each
  // reason by characters instead of by sentences, and `response_format:
  // json_object` on the request drops the fence and the preamble that were
  // being paid for out of this same 1,500.
  groq: 1_500,
};

export function completionTokensFor(provider: ProviderName): number {
  return PROVIDER_COMPLETION_TOKENS[provider] ?? COMPLETION_TOKENS;
}

/**
 * Below this the three reasons have to be written short, or the answer runs
 * past its allowance and is cut off mid-string.
 *
 * Above Groq's 2,000 on purpose. That allowance is the most its per-minute
 * ceiling can spare rather than a comfortable one, so the answer sent into
 * it still has to be a short answer — a threshold that let brevity lapse the
 * moment the allowance was raised would have spent the extra room on a
 * longer reply and truncated it in the same place.
 */
export const BRIEF_BELOW_TOKENS = 2_500;

export interface ProviderResult {
  provider: ProviderName;
  ok: boolean;
  raw?: string;
  parsed?: ParsedAiSignal;
  error?: string;
}
