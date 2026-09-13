import Anthropic from "@anthropic-ai/sdk";
import { parseAiSignal } from "@/lib/ai/schema";
import type { AnalystPrompt } from "@/lib/ai/prompt";
import type { ProviderResult } from "./types";
import { resolveModel } from "./catalog";

export async function callAnthropic(
  apiKey: string,
  prompt: AnalystPrompt,
  /** Overrides the catalogue default; set on the settings page. */
  model?: string,
): Promise<ProviderResult> {
  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: resolveModel("anthropic", model),
      max_tokens: 1200,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
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
