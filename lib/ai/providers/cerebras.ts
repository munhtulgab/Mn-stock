import { callOpenAiCompatible } from "./openaiCompatible";
import type { ProviderResult } from "./types";
import type { AnalystPrompt } from "@/lib/ai/prompt";

/**
 * Cerebras Cloud, also the OpenAI shape.
 *
 * The model list is read from the account rather than assumed: this
 * workspace offers gpt-oss-120b, zai-glm-4.7 and gemma-4-31b, and the
 * largest of those is the default.
 *
 * gpt-oss-120b thinks before it answers, and that thinking is charged to the
 * completion allowance — so the shared 1,500 was not a limit on the answer
 * but on the thinking plus the answer, and the answer is what got cut. It
 * was maddening rather than broken: measured over repeated runs the model
 * spent 1,152 reasoning tokens on one and 1,294 on the next, so the same
 * request parsed one minute and returned a JSON object with no closing brace
 * the next.
 *
 * Both halves of the fix are needed. `reasoning_effort: "low"` takes the
 * thinking from ~1,290 tokens to ~110 — this prompt already carries a worked
 * analysis, so there is little left to reason out from scratch — and the
 * raised ceiling means even a model that ignores the hint has room to
 * finish. Measured after: 490 completion tokens against 3,000 allowed.
 *
 * zai-glm-4.7 was tried and rejected: it spent 3,874 reasoning tokens and
 * still ran out mid-answer.
 */
export async function callCerebras(
  apiKey: string,
  prompt: AnalystPrompt,
): Promise<ProviderResult> {
  return callOpenAiCompatible({
    provider: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    apiKey,
    model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    prompt,
    // Typical answers measure 430–800 tokens. The ceiling is this far above
    // them for the runs that wander: one in six went on past three thousand
    // with barely any of it reasoning, and headroom is free — a completion
    // is billed for what it generates, not for what it was allowed.
    maxTokens: 6000,
    // `json_object` stops the wandering at its source by constraining the
    // output to one object, and has the side effect of dropping the
    // ```json fences the parser would otherwise have to strip.
    //
    // Both fields are accepted by every model this account offers —
    // gpt-oss-120b, zai-glm-4.7 and gemma-4-31b were each checked rather
    // than assumed — so switching CEREBRAS_MODEL cannot turn this into a 400.
    extraBody: {
      reasoning_effort: "low",
      response_format: { type: "json_object" },
    },
  });
}
