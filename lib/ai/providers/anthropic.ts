import Anthropic from "@anthropic-ai/sdk";
import { MSE_ANALYST_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { parseAiSignal } from "@/lib/ai/schema";
import type { ProviderResult } from "./types";

export async function callAnthropic(
  apiKey: string,
  userMessage: string,
): Promise<ProviderResult> {
  try {
    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

    const response = await client.messages.create({
      model,
      max_tokens: 1200,
      system: MSE_ANALYST_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && "text" in textBlock ? textBlock.text : "";
    const parsed = parseAiSignal(raw);
    return { provider: "anthropic", ok: true, raw, parsed };
  } catch (err) {
    return {
      provider: "anthropic",
      ok: false,
      error: (err as Error).message,
    };
  }
}
