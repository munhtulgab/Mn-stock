/**
 * What a provider will actually answer to today.
 *
 * Model names are not stable. Groq retired `llama-3.3-70b-versatile` from
 * under a working key and the panel lost an analyst to
 * `{"code":"model_not_found"}` — a configured name that was correct when it
 * was written and is not any more. Guessing the replacement from memory only
 * moves the expiry date, so the provider is asked instead: every
 * OpenAI-compatible API lists what the key can reach at `/models`, and that
 * list is the only current answer there is.
 */

/**
 * Whether an id names something that can hold a conversation.
 *
 * The listing is everything the key can reach, which on these providers
 * includes speech, embeddings and safety classifiers. Sending an analyst
 * prompt to a transcription model fails in a way that reads like a bug.
 */
const NOT_CHAT =
  /whisper|tts|text-to-speech|embed|rerank|moderation|guard|playai|stable-diffusion|flux|dall-e|image|sdxl|bge-/i;

export function isChatModel(id: string): boolean {
  return !NOT_CHAT.test(id);
}

/**
 * Picks the best of what is on offer.
 *
 * `prefer` is matched as substrings, in order, so a preference survives the
 * suffixes these names collect — "llama-3.3-70b" still finds
 * "llama-3.3-70b-versatile" after it comes back under a new tail. Nothing
 * preferred and still listed means the catalogue has moved on entirely, and
 * the first chat model beats refusing to answer.
 */
export function pickModel(
  available: string[],
  prefer: string[],
  /**
   * Names already tried and refused. A listing is the catalogue rather than
   * what this key may call — Mistral lists `mistral-large-latest` to an
   * account that is told it cannot have it — so without this the pick lands
   * on the refused name again and the substitution goes in a circle.
   */
  refused: ReadonlySet<string> = new Set(),
): string | null {
  const chat = available.filter((id) => isChatModel(id) && !refused.has(id));
  if (chat.length === 0) return null;
  for (const wanted of prefer) {
    const match = chat.find((id) => id.includes(wanted));
    if (match) return match;
  }
  return chat[0];
}

/** The ids a key can reach, or an empty list if the listing itself fails. */
export async function listModels(
  baseUrl: string,
  apiKey: string,
  extraHeaders?: Record<string, string>,
): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}`, ...extraHeaders },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rows: unknown[] = Array.isArray(data?.data) ? data.data : [];
    return rows
      .map((row) => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/** Whether a refusal is "that model is gone" rather than anything else. */
export function isModelNotFound(status: number, body: string): boolean {
  if (status !== 404 && status !== 400) return false;
  return /model_not_found|model .*(does not exist|not found|is not available|decommissioned)/i.test(
    body,
  );
}

/**
 * Whether a refusal is "that model is not for this account".
 *
 * The model exists and is listed; the key's plan may not call it. Mistral
 * answers `403 {"type":"tier_not_allowed","message":"This model is not
 * available in your subscription tier"}` to `mistral-large-latest` on a free
 * account, and that is a different sentence from every other 403 a provider
 * sends — a key with no permissions at all, an account-level block — so the
 * body decides, not the status.
 *
 * It matters because the answer is the same as a retired model's: ask what
 * this key can reach and take the best of it. Read only as a status it was
 * a hard failure, and the panel lost an analyst to a model nobody had to be
 * using.
 */
export function isModelNotAllowed(status: number, body: string): boolean {
  if (status !== 403) return false;
  return /tier_not_allowed|not available in your (subscription|tier|plan)|requires? a paid|upgrade your (plan|subscription|tier)/i.test(
    body,
  );
}

/** Either way of being told to use a different model. */
export function isModelUnusable(status: number, body: string): boolean {
  return isModelNotFound(status, body) || isModelNotAllowed(status, body);
}

/**
 * Preferred models per provider, best first.
 *
 * Ordered by what makes a better analyst — a large instruction-tuned model
 * over a small fast one — not by what is cheapest. These are hints for
 * choosing among models the key actually has, never a list of what to send:
 * an entry that no longer exists simply does not match anything.
 */
export const MODEL_PREFERENCES: Record<string, string[]> = {
  groq: [
    "llama-3.3-70b",
    "llama-4-maverick",
    "llama-4-scout",
    "gpt-oss-120b",
    "kimi-k2",
    "qwen3-32b",
    "llama-3.1-70b",
    "llama3-70b",
    "llama-3.1-8b",
    "gemma2-9b",
  ],
  cerebras: ["llama-3.3-70b", "llama3.3-70b", "llama-4-scout", "qwen-3-32b", "llama3.1-8b"],
  // Largest first, as everywhere here. A free account is refused the first
  // two and lands on `mistral-small-latest`, which is the substitution above
  // walking down rather than a list that has to be kept in step with a plan.
  mistral: [
    "mistral-large",
    "mistral-medium",
    "mistral-small",
    "open-mixtral",
    "open-mistral",
    "ministral",
  ],
  openrouter: [],
};
