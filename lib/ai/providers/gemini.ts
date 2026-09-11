import type { AnalystPrompt } from "@/lib/ai/prompt";
import { parseAiSignal } from "@/lib/ai/schema";
import { withRetryAfter } from "@/lib/ai/retryAfter";
import { TRANSIENT_RETRIES, isTransientStatus, retryDelayMs, sleep } from "./transient";
import type { ProviderResult } from "./types";

interface GeminiErrorDetail {
  "@type"?: string;
  retryDelay?: string;
}

/** Gemini reports rate-limit backoff as e.g. {"retryDelay": "23s"} inside
 * error.details, alongside an ErrorInfo entry — pull the number out. */
function extractGeminiRetrySeconds(bodyText: string): number | null {
  try {
    const parsed = JSON.parse(bodyText);
    const details: GeminiErrorDetail[] = parsed?.error?.details ?? [];
    const retryInfo = details.find((d) => d.retryDelay);
    const match = retryInfo?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * What this provider may spend in total, and on any one attempt.
 *
 * It used to be one attempt of forty-five seconds, and a request that did not
 * come back in time was the end of it — the panel lost this analyst to
 * "timeout" with nothing tried twice. The same forty-five seconds buys two
 * attempts instead, because what was slow was usually the attempt rather than
 * the provider, and a second one lands.
 *
 * The whole panel runs inside one request that is holding a page, so this is
 * a ceiling and not a suggestion: attempts stop when the budget will not
 * cover another one, whether or not any were tried.
 */
const BUDGET_MS = 50_000;
const ATTEMPT_MS = 22_000;
/** Below this there is no room for an answer, so there is no point asking. */
const MIN_ATTEMPT_MS = 8_000;
const MAX_ATTEMPTS = 4;

/** A 400 that is about the key rather than anything in the request. */
function isKeyRefusal(body: string): boolean {
  return /API_KEY_INVALID|API key not valid/i.test(body);
}

function isTimeout(err: unknown): boolean {
  const name = (err as Error)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

export async function callGemini(
  apiKey: string,
  prompt: AnalystPrompt,
): Promise<ProviderResult> {
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const deadline = Date.now() + BUDGET_MS;
  /**
   * Whether to ask for the thinking to be skipped.
   *
   * This model spends an unpredictable chunk of its output allowance on
   * hidden reasoning before it writes anything — 800 to 1,500 tokens
   * measured — and that is time as well as tokens. There is little here for
   * it to reason out from scratch: the prompt already carries a worked
   * technical and fundamental analysis and asks for a JSON verdict on it,
   * which is the same reason Cerebras is asked for `reasoning_effort: "low"`.
   *
   * Dropped on a 400 rather than trusted. `thinkingConfig` is understood by
   * the 2.5 Flash models and not by everything `GEMINI_MODEL` could be
   * pointed at, and a field that makes the request invalid would turn a
   * provider that sometimes times out into one that never answers. One
   * wasted request is the whole cost of being wrong about it.
   */
  let skipThinking = true;
  let timedOut = false;

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const left = deadline - Date.now();
      if (left < MIN_ATTEMPT_MS) break;

      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: prompt.system }] },
              contents: [{ role: "user", parts: [{ text: prompt.user }] }],
              generationConfig: {
                temperature: 0.3,
                // Generous headroom: where the thinking above is not skipped
                // it is charged to this same budget, so a tight limit here
                // silently truncates the JSON mid-string on longer runs.
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
                ...(skipThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              },
            }),
            signal: AbortSignal.timeout(Math.min(ATTEMPT_MS, left)),
          },
        );
      } catch (err) {
        // Out of time rather than turned down. Worth another go while the
        // budget covers one; anything else is a real fault and is reported.
        if (!isTimeout(err)) throw err;
        timedOut = true;
        continue;
      }

      if (!res.ok) {
        const body = await res.text();

        // The request was rejected and the one unusual thing in it is the
        // thinking field, so send the request this provider has always sent
        // and let the real fault, if there is one, speak for itself.
        //
        // Not on a bad key, which this API also answers 400 to: checked
        // against the live endpoint, an unknown field is refused as
        // `Unknown name "x" at 'generation_config'` before the key is looked
        // at, while `thinkingConfig` gets past that check and reaches
        // API_KEY_INVALID — so the field is real and a key error here is
        // about the key. Retrying that one would only delay saying so.
        if (skipThinking && res.status === 400 && !isKeyRefusal(body)) {
          skipThinking = false;
          continue;
        }

        // Google answers 503 "The model is overloaded" often enough that
        // treating it as an answer cost the panel an analyst on a regular
        // basis. It clears in about a second; see `transient` for why 429 is
        // not retried here.
        if (isTransientStatus(res.status) && attempt < TRANSIENT_RETRIES) {
          await sleep(retryDelayMs(attempt + 1));
          continue;
        }

        const retrySeconds = extractGeminiRetrySeconds(body);
        throw new Error(
          withRetryAfter(`Gemini API ${res.status}: ${body.slice(0, 300)}`, retrySeconds),
        );
      }

      const data = await res.json();
      const finishReason = data?.candidates?.[0]?.finishReason;
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (finishReason === "MAX_TOKENS") {
        throw new Error(
          `Gemini хариу токений хязгаараас давж таслагдсан (thinking token их зарцуулсан байж магадгүй). ${raw ? `Хэсэгчилсэн хариу: ${raw.slice(0, 200)}` : ""}`,
        );
      }
      if (!raw) {
        throw new Error(`Gemini returned no content (finishReason: ${finishReason})`);
      }
      const parsed = parseAiSignal(raw);
      return { provider: "gemini", ok: true, raw, parsed };
    }

    throw new Error(
      timedOut
        ? "Gemini timed out: хүсэлт хугацаандаа багтсангүй."
        : "Gemini: хүсэлт илгээх хугацаа хүрэлцсэнгүй.",
    );
  } catch (err) {
    return { provider: "gemini", ok: false, error: (err as Error).message };
  }
}
