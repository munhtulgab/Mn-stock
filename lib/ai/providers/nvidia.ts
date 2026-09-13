import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";
import { resolveModel } from "./catalog";

/**
 * NVIDIA's hosted model catalogue, on the OpenAI shape.
 *
 * Free on signup credits that do not expire and need no card, and it is the
 * one provider here that is a catalogue rather than a house: eighty-two
 * models on this key, several of which are the flagships of other labs.
 *
 * `deepseek-v4-flash` was chosen by measurement, not by size. Four models
 * were run against this app's own prompt and the discriminator was not
 * speed — it was Mongolian:
 *
 *   deepseek-v4-flash    28-61s   443 Cyrillic  fluent, cites the figures
 *   deepseek-v4-pro      120s     1042 Cyrillic fluent, four times slower
 *   nemotron-3-super     15-18s   0 Cyrillic    a perfect English answer
 *   gpt-oss-20b          73s      0 Cyrillic    the same
 *
 * The two NVIDIA models are the fastest things on the panel by a wide margin
 * and both answer a page of Mongolian in English, which is a card nobody
 * reading this app can use. Between the two DeepSeeks, flash is the same
 * analysis at a third of the wait.
 *
 * Several well-known names in the catalogue — mistral-large-2,
 * palmyra-fin-70b, kimi-k2.6, the nemotron nanos — answer 404 "Not found for
 * account" on this key, so MODEL_PREFERENCES below lists only what was seen
 * to work.
 */
export async function callNvidia(
  apiKey: string,
  prompt: AnalystPrompt,
  /** Overrides the catalogue default; set on the settings page. */
  model?: string,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "nvidia",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKey,
    model: resolveModel("nvidia", model),
    prompt,
    // Eight thousand because this model reasons before it answers and that
    // is charged here: measured runs spent 3,683, 3,733 and 5,557 tokens to
    // produce the same eight-hundred-token verdict. At four thousand it hit
    // `finish_reason: "length"` with the answer unwritten — the ceiling was
    // stopping the thinking, not the reply. Headroom is close to free; a
    // completion is billed for what it generates, not for what it was
    // allowed.
    maxTokens: 8000,
    optionalBody: { response_format: { type: "json_object" } },
    // How long the thinking takes is not steady. Six measured runs of the
    // same prompt came back in 22.7s, 27.2s, 28.2s, 32.0s and 61.4s, and one
    // did not arrive inside 170. Ninety seconds covers every run that lands
    // and gives up on the one that does not, which matters because this
    // provider is not alone: the panel waits for the slowest of them and the
    // route has three minutes for all of it.
    //
    // A timeout is not retried. A second ninety-second wait is not one the
    // page can hold, and the reader is better told it timed out.
    //
    // Turning the reasoning off would be the real fix and there is no way to
    // ask for it here: both `chat_template_kwargs: {thinking: false}` and
    // `reasoning_effort: "low"` made the gateway hang for the full window
    // rather than refuse, so they are not sent.
    requestMs: 90_000,
    budgetMs: 100_000,
  });
}
