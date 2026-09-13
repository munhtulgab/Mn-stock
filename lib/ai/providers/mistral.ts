import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";
import { resolveModel } from "./catalog";

/**
 * Mistral's own console API, which speaks the OpenAI shape.
 *
 * `mistral-large-latest` rather than one of the small models: this prompt is
 * a page of Mongolian and a worked analysis, and the answer has to come back
 * as strict JSON. Checked against the live API with a Mongolian prompt —
 * it answers in Mongolian and returns the object asked for.
 */
export async function callMistral(
  apiKey: string,
  prompt: AnalystPrompt,
  /** Overrides the catalogue default; set on the settings page. */
  model?: string,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "mistral",
    baseUrl: "https://api.mistral.ai/v1",
    apiKey,
    model: resolveModel("mistral", model),
    prompt,
  });
}
