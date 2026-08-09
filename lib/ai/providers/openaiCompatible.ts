import { MSE_ANALYST_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { parseAiSignal } from "@/lib/ai/schema";
import { withRetryAfter } from "@/lib/ai/retryAfter";
import type { ProviderName, ProviderResult } from "./types";

/** Standard `Retry-After` header (seconds, or a delay per some providers),
 * falling back to the "try again in 1.23s" phrasing Groq/OpenAI-style APIs
 * often embed directly in the error body when the header isn't set. */
function extractRetrySeconds(res: Response, bodyText: string): number | null {
  const header = res.headers.get("retry-after");
  if (header && Number.isFinite(Number(header))) return Number(header);
  const inBody = bodyText.match(/try again in (\d+(?:\.\d+)?)s/i);
  return inBody ? Number(inBody[1]) : null;
}

/**
 * Room for the answer.
 *
 * Enough for the JSON these prompts ask for, which measures under a thousand
 * tokens. A reasoning model needs far more than the answer is long — see
 * `maxTokens` on the call — because its thinking is charged to this same
 * allowance.
 */
const DEFAULT_MAX_TOKENS = 1500;

export async function callOpenAiCompatible(opts: {
  provider: ProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  userMessage: string;
  extraHeaders?: Record<string, string>;
  /**
   * The completion allowance. Raise it for a model that reasons before it
   * answers: those tokens come out of this budget and never reach the reply,
   * so a limit sized for the answer alone truncates the answer.
   */
  maxTokens?: number;
  /** Provider-specific request fields, sent only where they are understood. */
  extraBody?: Record<string, unknown>;
}): Promise<ProviderResult> {
  const {
    provider,
    baseUrl,
    apiKey,
    model,
    userMessage,
    extraHeaders,
    maxTokens,
    extraBody,
  } = opts;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
        messages: [
          { role: "system", content: MSE_ANALYST_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        ...extraBody,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      const retrySeconds = extractRetrySeconds(res, body);
      throw new Error(
        withRetryAfter(`${provider} API ${res.status}: ${body.slice(0, 300)}`, retrySeconds),
      );
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const raw = choice?.message?.content ?? "";
    if (!raw) throw new Error(`${provider} returned no content`);
    // Said plainly rather than left to the parser, which would report a
    // half-written object as a syntax error and send the reader looking for
    // a formatting fault. The answer is fine; there was no room to finish it.
    if (choice?.finish_reason === "length") {
      const reasoning = data?.usage?.completion_tokens_details?.reasoning_tokens;
      throw new Error(
        `${provider} MAX_TOKENS: хариу дуусахаас өмнө токений хязгаарт хүрлээ` +
          (reasoning ? ` (үүнээс ${reasoning} нь дотоод бодолтод зарцуулагдсан)` : ""),
      );
    }
    const parsed = parseAiSignal(raw);
    return { provider, ok: true, raw, parsed };
  } catch (err) {
    return { provider, ok: false, error: (err as Error).message };
  }
}
