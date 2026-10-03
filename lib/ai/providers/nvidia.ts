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
 * The model is chosen by measurement, not by size, and the discriminator is
 * Mongolian. `deepseek-v4-flash` answered fluently in 28-61s until NVIDIA
 * retired it on 2026-09-21, after which every run came back `410 Gone`. Its
 * successors in the catalogue were measured against this app's own prompt on
 * 2026-10-03 and are listed with the figures beside MODEL_PREFERENCES.nvidia:
 * the reasoning models all think for longer than the panel can wait, and
 * `gemma-4-31b-it`, which does not reason first, answers in about twenty
 * seconds in Mongolian that cites the figures it was given.
 *
 * A retired or unreachable name — the default, or one pinned on the settings
 * page — is now recognised as such and substituted from that list, rather
 * than reported on every run.
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
    // Eight thousand for the substitutes that reason before they answer —
    // glm-5.3 and the DeepSeeks in MODEL_PREFERENCES.nvidia. The retired
    // deepseek-v4-flash did, and that
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
