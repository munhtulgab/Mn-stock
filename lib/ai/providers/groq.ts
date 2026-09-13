import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";
import { resolveModel } from "./catalog";

/**
 * Groq, on the tightest allowance of any provider here.
 *
 * The free tier meters twelve thousand tokens a minute across the whole
 * exchange, so the room the answer gets is room the question does not, and
 * both sides are near their floor: the three criteria a verdict must rest on
 * cost about nine thousand seven hundred tokens with nothing else attached,
 * which leaves a little over two thousand for a reply. See
 * PROVIDER_COMPLETION_TOKENS for what that is set to and why.
 *
 * Inside that, the answer is kept to the answer. `json_object` constrains
 * the reply to one object — no preamble, no ```json fence, no closing
 * remark — which is the same medicine that stopped Cerebras wandering past
 * its ceiling, and here it is the difference between a reply that fits and
 * one cut off mid-string. Sent as an optional field rather than a required
 * one: it is understood by the model configured today, and a request that is
 * merely improved by it must not become a request that fails without it.
 */
export async function callGroq(
  apiKey: string,
  prompt: AnalystPrompt,
  /** Overrides the catalogue default; set on the settings page. */
  model?: string,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey,
    model: resolveModel("groq", model),
    prompt,
    optionalBody: { response_format: { type: "json_object" } },
  });
}
