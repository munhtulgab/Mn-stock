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
import { PROVIDER_CATALOG } from "./catalog";

/** Standard `Retry-After` header (seconds, or a delay per some providers),
 * falling back to the "try again in 1.23s" phrasing Groq/OpenAI-style APIs
 * often embed directly in the error body when the header isn't set. */
function extractRetrySeconds(res: Response, bodyText: string): number | null {
  const header = res.headers.get("retry-after");
  if (header && Number.isFinite(Number(header))) return Number(header);
  return retrySecondsInBody(bodyText);
}

/**
 * "try again in 7.2s", "in 1m19.5s", "in 2h3m" — read whole.
 *
 * Groq writes a wait over a minute with its minutes in front, and reading
 * only the seconds took "1m19s" for nineteen: the panel told the reader to
 * come back in nineteen seconds, and the retry below waited nineteen seconds
 * for a meter that would not refill for eighty.
 */
export function retrySecondsInBody(bodyText: string): number | null {
  const match = /try again in ((?:\d+(?:\.\d+)?[hms]\s*)+)/i.exec(bodyText);
  if (!match) return null;
  let seconds = 0;
  for (const [, value, unit] of match[1].matchAll(/(\d+(?:\.\d+)?)([hms])/gi)) {
    seconds += Number(value) * (unit.toLowerCase() === "h" ? 3600 : unit.toLowerCase() === "m" ? 60 : 1);
  }
  return seconds > 0 ? seconds : null;
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

/** One wait-and-retry for a rate limit; see where it is used. */
const RATE_LIMIT_RETRIES = 1;
/** What a 429 without a stated wait is given before the one retry. */
const RATE_LIMIT_WAIT_MS = 2_000;
/** Longer than this and the reader is told the wait instead. */
const MAX_RATE_LIMIT_WAIT_MS = 20_000;
/**
 * 429s that are not about the minute: Z.AI's empty balance (code 1113) and
 * the monthly allowances. Waiting does not refill those.
 */
const NOT_A_WAIT = /Insufficient balance|no resource package|\b1113\b|per month|monthly|billing/i;

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
  /**
   * A smaller prompt, for a provider that refuses this one as too large.
   *
   * Groq meters tokens a minute, and its 413 states both the ceiling and what
   * was asked: "Limit 12000, Requested 13042". The builder's own estimate is
   * deliberately high, but it is an estimate, and a model swapped on the
   * settings page can carry a lower ceiling than the one the prompt was
   * built for. Given this, the refusal is answered with a prompt trimmed to
   * the stated ceiling instead of being reported. Asked once per call.
   */
  resize?: (limitTokens: number, requestedTokens: number) => AnalystPrompt | null;
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
    resize,
  } = opts;
  let current = prompt;
  let resized = false;
  let rateLimitRetries = 0;

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
  /** Models that answered "busy" on this call; not held beyond it. */
  const busy = new Set<string>();
  let substitutedForBusy = false;
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
            { role: "system", content: current.system },
            { role: "user", content: current.user },
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

        // Still busy after every retry: the provider's other model, once.
        // Z.AI's free glm-4.7-flash answered "temporarily overloaded" six
        // times running on 3 October while glm-4.5-flash, free on the same
        // key, was there to ask. Not remembered — being busy is about the
        // moment, and the better model is the one to start on next time.
        if (temporary && substitutions < MODEL_SUBSTITUTIONS && Date.now() + requestMs <= deadline) {
          busy.add(using);
          available ??= await listModels(baseUrl, apiKey, extraHeaders);
          const pool = [...new Set([...available, ...(PROVIDER_CATALOG[provider].extraModels ?? [])])];
          const other = pickModel(
            pool,
            MODEL_PREFERENCES[provider] ?? [],
            new Set([...refused, ...busy]),
          );
          if (other) {
            substitutions++;
            substitutedForBusy = true;
            console.warn(`${provider}: ${using} still busy (${res.status}), trying ${other}`);
            using = other;
            continue;
          }
        }

        const retrySeconds = extractRetrySeconds(res, body);

        // Too large for the ceiling the provider states: trimmed to it and
        // sent once more. See `resize`.
        if (!resized && resize && (res.status === 413 || /request too large/i.test(body))) {
          const stated = /Limit (\d+), Requested (\d+)/i.exec(body);
          const smaller = stated ? resize(Number(stated[1]), Number(stated[2])) : null;
          resized = true;
          if (smaller) {
            console.warn(`${provider}: ${res.status} too large, retrying trimmed`);
            current = smaller;
            continue;
          }
        }

        // A rate limit that clears in seconds is waited out, once. Groq's
        // per-minute token meter says "try again in 7.2s" when an earlier
        // request in the same minute used part of it, and a free Mistral
        // account allows one request a second — which the model substitution
        // above can exceed on its own. Reported straight away, either cost
        // an analyst a run for a wait shorter than the slowest provider on
        // the panel. A long wait, or a quota that waiting does not refill,
        // is still reported with the wait attached.
        // Not a 429 the provider's own rule already called temporary: those
        // have had their retries above.
        if (
          res.status === 429 &&
          !temporary &&
          rateLimitRetries < RATE_LIMIT_RETRIES &&
          !NOT_A_WAIT.test(body)
        ) {
          const wait =
            retrySeconds !== null ? Math.ceil(retrySeconds * 1000) + 250 : RATE_LIMIT_WAIT_MS;
          if (wait <= MAX_RATE_LIMIT_WAIT_MS && Date.now() + wait + requestMs <= deadline) {
            rateLimitRetries++;
            await sleep(wait);
            continue;
          }
        }

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
      if (using !== model && !substitutedForBusy) resolvedModels.set(cacheKey, using);
      return { provider, ok: true, raw, parsed };
    }
  } catch (err) {
    return { provider, ok: false, error: (err as Error).message };
  }
}
