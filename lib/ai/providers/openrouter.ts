import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";
import { resolveModel } from "./catalog";

export async function callOpenRouter(
  apiKey: string,
  prompt: AnalystPrompt,
  /** Overrides the catalogue default; set on the settings page. */
  model?: string,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey,
    model: resolveModel("openrouter", model),
    prompt,
    extraHeaders: {
      "HTTP-Referer": "https://mn-stock.vercel.app",
      "X-Title": "MSE Rate Advisor",
    },
  });
}
