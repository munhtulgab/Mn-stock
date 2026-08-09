import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";

/**
 * Cerebras Cloud, also the OpenAI shape.
 *
 * The model list is read from the account rather than assumed: at the time
 * of writing this key's workspace offers gpt-oss-120b, zai-glm-4.7 and
 * gemma-4-31b, and the largest of those is the default here.
 *
 * Unverified end to end, unlike the others: the key authenticates and lists
 * models, but inference answers 402 until the Cerebras account has billing
 * enabled. That surfaces as its own message in the panel rather than as a
 * generic failure, so it is obvious what needs doing.
 */
export async function callCerebras(
  apiKey: string,
  userMessage: string,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    apiKey,
    model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    userMessage,
  });
}
