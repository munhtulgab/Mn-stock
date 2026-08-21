import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";

export async function callGroq(
  apiKey: string,
  prompt: AnalystPrompt,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey,
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    prompt,
  });
}
