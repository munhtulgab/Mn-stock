import type { AnalystPrompt } from "@/lib/ai/prompt";
import { parseAiSignal } from "@/lib/ai/schema";
import { withRetryAfter } from "@/lib/ai/retryAfter";
import {
  MODEL_PREFERENCES,
  isModelUnusable,
  listModels,
  pickModel,
} from "./models";
import { TRANSIENT_RETRIES, isTransientStatus, retryDelayMs, sleep } from "./transient";
import { completionTokensFor, type ProviderName, type ProviderResult } from "./types";

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
 * Models found by asking, keyed by the configured name that failed.
 *
 * Held for the life of the process rather than stored: it is a fact about
 * this afternoon at one provider, and a deployment restarting is exactly when
 * it should be looked up again.
 *
 * Written only once a substitute has actually answered. It used to be written
 * as soon as one was chosen, which on a plan that refuses more than one model
 * stored the second refusal as the answer: the next call started on a name
 * already known to be no good and, having "already asked", had no way back.
 */
const resolvedModels = new Map<string, string>();

/**
 * Models this key has been turned away from, keyed the same way.
 *
 * Held across calls, not just within one. Without it every request started
 * again at the configured name and walked the same refusals — on a free
 * Mistral account that is three rejected requests and a listing before the
 * one that answers, every time, against a plan that meters requests. The
 * tier refusal stopped being the error and the rate limit took its place.
 *
 * A refusal is about the plan rather than the moment, so remembering it for
 * the life of the process is right; a deployment restarting is when it is
 * worth finding out again, which is the same rule the resolved names follow.
 */
const refusedModels = new Map<string, Set<string>>();

/**
 * How many other models one call may try after being turned away.
 *
 * A free Mistral account refuses both `mistral-large-latest` and
 * `mistral-medium-latest` before `mistral-small-latest` answers, so one
 * substitution is not enough to get down to what the plan allows. Three is,
 * with room for a retired name on top — and the cost is paid once, because a
 * substitute that answers is remembered for the life of the process.
 */
const MODEL_SUBSTITUTIONS = 3;

/**
 * How long one completion request may take, and how long all its tries may.
 *
 * Forty seconds rather than thirty. Workers AI answered inside the old
 * window until the day it did not, and a provider that is merely slow should
 * not be reported as a failure on a page that is already waiting on five
 * others in parallel — the wall clock here is the slowest provider, not the
 * sum of them.
 *
 * Both are overridable, because "slow" is a fact about a provider rather
 * than about this function: a free tier that queues a large prompt for the
 * best part of a minute needs a longer window than one that answers in five
 * seconds, and giving everybody the longer one would turn a dead provider
 * into a minute of the reader's time.
 */
const REQUEST_MS = 40_000;

export async function callOpenAiCompatible(opts: {
  provider: ProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: AnalystPrompt;
  extraHeaders?: Record<string, string>;
  /**
   * The completion allowance. Raise it for a model that reasons before it
   * answers: those tokens come out of this budget and never reach the reply,
   * so a limit sized for the answer alone truncates the answer.
   */
  maxTokens?: number;
  /** Provider-specific request fields, sent only where they are understood. */
  extraBody?: Record<string, unknown>;
  /**
   * Fields worth asking for but not worth failing over.
   *
   * Sent like `extraBody`, and dropped for one more try if the provider
   * answers 400 — the same bargain Gemini strikes with `thinkingConfig`. A
   * field like `response_format` is understood by the model configured
   * today and may not be by whatever `*_MODEL` is pointed at tomorrow, and a
   * request that is merely improved by it must not become a request that
   * fails without it. One wasted call is the whole cost of being wrong.
   */
  optionalBody?: Record<string, unknown>;
  /**
   * Failures this provider calls temporary that the status alone does not.
   *
   * `isTransientStatus` deliberately leaves 429 out: a rate limit carries the
   * provider's own Retry-After and waiting it out inside a page render helps
   * nobody. But a provider is free to answer 429 to something that is not a
   * rate limit at all — Z.AI sends `{"code":"1305","message":"The service may
   * be temporarily overloaded"}` with that status — and reporting that as a
   * spent quota tells the reader to fix something that is not wrong.
   */
  retryOn?: (status: number, body: string) => boolean;
  /** How many further tries a temporary failure is worth here. */
  transientRetries?: number;
  /** How long one attempt may take. See REQUEST_MS. */
  requestMs?: number;
  /**
   * A ceiling on all of them together, so several fast refusals and one slow
   * answer cannot add up to more than the page can hold. A retry is only
   * started when there is room for a whole attempt inside what is left.
   */
  budgetMs?: number;
}): Promise<ProviderResult> {
  const {
    provider,
    baseUrl,
    apiKey,
    model,
    prompt,
    extraHeaders,
    maxTokens,
    extraBody,
    optionalBody,
    retryOn,
    transientRetries = TRANSIENT_RETRIES,
    requestMs = REQUEST_MS,
    budgetMs,
  } = opts;

  const deadline = budgetMs === undefined ? Infinity : Date.now() + budgetMs;

  const cacheKey = `${provider}:${model}`;
  // Everything this key has been turned away from, so the pick below cannot
  // land on one of them again — on this call or on any earlier one.
  const refused = refusedModels.get(cacheKey) ?? new Set<string>();
  refusedModels.set(cacheKey, refused);
  let using = resolvedModels.get(cacheKey) ?? model;
  let substitutions = 0;
  /** The listing, read at most once however many models get refused. */
  let available: string[] | null = null;
  /** Whether the hopeful fields above are still on the request. */
  let sendOptional = optionalBody !== undefined;

  try {
    // The name this call would start on is one an earlier call was already
    // turned away from. Reading the listing costs a request; sending a whole
    // prompt to be refused again costs a request and the answer's worth of
    // the plan's allowance, which is what put this provider over its rate
    // limit in the first place.
    if (refused.has(using)) {
      available = await listModels(baseUrl, apiKey, extraHeaders);
      const known = pickModel(available, MODEL_PREFERENCES[provider] ?? [], refused);
      if (known) using = known;
    }

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify({
          model: using,
          temperature: 0.3,
          max_tokens: maxTokens ?? completionTokensFor(provider),
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          ...extraBody,
          ...(sendOptional ? optionalBody : {}),
        }),
        signal: AbortSignal.timeout(requestMs),
      });

      if (!res.ok) {
        const body = await res.text();

        // This name is retired, or this plan may not call it. Either way the
        // answer is the same: ask what the key can reach and go again with
        // the best of what is left. Bounded, so a provider that turns down
        // everything it lists cannot loop.
        if (substitutions < MODEL_SUBSTITUTIONS && isModelUnusable(res.status, body)) {
          refused.add(using);
          available ??= await listModels(baseUrl, apiKey, extraHeaders);

          const substitute = pickModel(
            available,
            MODEL_PREFERENCES[provider] ?? [],
            refused,
          );
          if (substitute) {
            substitutions++;
            console.warn(
              `${provider}: ${using} refused (${res.status}), trying ${substitute}`,
            );
            using = substitute;
            continue;
          }
          throw new Error(
            `${provider} model "${using}" энэ түлхүүрээр ашиглах боломжгүй` +
              (available.length > 0
                ? `. Энэ түлхүүрээр боломжтой: ${available
                    .filter((id) => !refused.has(id))
                    .slice(0, 8)
                    .join(", ")}`
                : ` бөгөөд боломжит загваруудын жагсаалтыг ч уншиж чадсангүй`),
          );
        }

        // Not the model, then, and the only unusual thing left in the
        // request is what this provider was merely asked for. Send what it
        // has always accepted and let the real fault, if there is one, speak
        // for itself.
        //
        // After the substitution above rather than before it: a name that is
        // retired answers 400 too, and dropping a field first would spend a
        // whole prompt against a metered plan finding out that the field was
        // never the problem.
        if (sendOptional && res.status === 400) {
          console.warn(
            `${provider}: 400 with the optional fields, retrying without them`,
          );
          sendOptional = false;
          continue;
        }

        const temporary =
          isTransientStatus(res.status) || (retryOn?.(res.status, body) ?? false);
        if (temporary && attempt < transientRetries) {
          const wait = retryDelayMs(attempt + 1);
          // Only if a whole attempt still fits. Starting one that the budget
          // will cut off partway spends the wait and the request and reports
          // a timeout instead of the refusal that actually happened.
          if (Date.now() + wait + requestMs <= deadline) {
            await sleep(wait);
            continue;
          }
        }

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
      // Remembered now rather than when it was chosen: what makes a
      // substitute the answer is that it answered.
      if (using !== model) resolvedModels.set(cacheKey, using);
      return { provider, ok: true, raw, parsed };
    }
  } catch (err) {
    return { provider, ok: false, error: (err as Error).message };
  }
}
