import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";
import { resolveModel } from "./catalog";

/**
 * Z.AI's GLM models, on the OpenAI shape.
 *
 * Here for the reason Cerebras is not any more: the flash models are free
 * outright — no card, no trial credits, no expiry — and they carry a
 * 200,000-token context, so this is the one addition to the panel that takes
 * the whole prompt without the composer having to give anything up for it.
 *
 * `glm-4.7-flash` rather than anything in the catalogue. Checked against the
 * live API with this app's own Mongolian prompt: it answers in Mongolian and
 * returns the object the schema asks for. The paid models on the same key
 * answer `{"code":"1113","message":"Insufficient balance"}`, which is why the
 * default is named here rather than discovered — see MODEL_PREFERENCES, where
 * the substitution is kept to flash names for the same reason.
 *
 * Note it is not in `/models`. The listing returns the billed catalogue only
 * (glm-4.5 through glm-5.3), so a free model can never be found by asking;
 * it has to be known.
 */
export async function callZai(
  apiKey: string,
  prompt: AnalystPrompt,
  /** Overrides the catalogue default; set on the settings page. */
  model?: string,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "zai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    apiKey,
    model: resolveModel("zai", model),
    prompt,
    // Both measured on the live API rather than assumed.
    //
    // `thinking` is the one that matters. GLM reasons before it answers and
    // charges that to the completion allowance: asked for fifty tokens it
    // spent all fifty on `reasoning_content` and returned an empty string
    // with `finish_reason: "length"` — the same way Cerebras's gpt-oss-120b
    // truncated before `reasoning_effort` was turned down. Disabled, the
    // same call reports `reasoning_tokens: 0` and answers in 435.
    //
    // `json_object` drops the fence and the preamble, as it does everywhere
    // else here.
    //
    // Optional rather than required: `thinking` is GLM's own field and a
    // ZAI_MODEL pointed somewhere else may not know it, and a request that
    // is merely improved by these must not become one that fails without
    // them.
    optionalBody: {
      thinking: { type: "disabled" },
      response_format: { type: "json_object" },
    },
    // The free tier turns requests away, and calls it a 429.
    //
    // Measured against the live API: a twenty-eight-token question and this
    // app's whole thirteen-thousand-token prompt were both refused with
    // `1305 The service may be temporarily overloaded` on some attempts and
    // answered on others, minutes apart, with nothing else changed. It is
    // not a size limit and it is not a spent quota — it is capacity, and the
    // next attempt is usually the one that lands.
    //
    // 1302 is the account's own concurrency limit, which is reached by
    // asking too fast rather than by asking too much. Both clear by waiting,
    // and neither is what a 429 normally means, so they are named here
    // rather than left to `isTransientStatus`.
    retryOn: (status, body) => status === 429 && /"1302"|"1305"/.test(body),
    // More than the usual two. A provider this intermittent needs several
    // goes to be given a fair chance, and the refusals come back inside a
    // second — so the cost is almost entirely the backoff, and the panel is
    // waiting on five others in parallel anyway.
    transientRetries: 5,
    // A refusal comes back in about a second; an answer to this app's prompt
    // took fifty-three, measured. Forty was cutting off the successful calls
    // and reporting them as timeouts — the free tier queues a large prompt
    // rather than refusing it, and the queue is where the time goes.
    //
    // The ceiling keeps the whole thing inside the route's three minutes
    // with room to spare, and no retry is started unless a full attempt
    // still fits under it.
    requestMs: 75_000,
    budgetMs: 120_000,
  });
}
