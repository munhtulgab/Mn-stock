import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";

export async function callOpenRouter(
  apiKey: string,
  prompt: AnalystPrompt,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey,
    model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    prompt,
    extraHeaders: {
      "HTTP-Referer": "https://mn-stock.vercel.app",
      "X-Title": "MSE Rate Advisor",
    },
  });
}
