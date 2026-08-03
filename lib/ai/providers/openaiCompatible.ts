import { MSE_ANALYST_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { parseAiSignal } from "@/lib/ai/schema";
import { withRetryAfter } from "@/lib/ai/retryAfter";
import type { ProviderName, ProviderResult } from "./types";

/** Standard `Retry-After` header (seconds, or a delay per some providers),
 * falling back to the "try again in 1.23s" phrasing Groq/OpenAI-style APIs
 * often embed directly in the error body when the header isn't set. */
function extractRetrySeconds(res: Response, bodyText: string): number | null {
  const header = res.headers.get("retry-after");
  if (header && Number.isFinite(Number(header))) return Number(header);
  const inBody = bodyText.match(/try again in (\d+(?:\.\d+)?)s/i);
  return inBody ? Number(inBody[1]) : null;
}

export async function callOpenAiCompatible(opts: {
  provider: ProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  userMessage: string;
  extraHeaders?: Record<string, string>;
}): Promise<ProviderResult> {
  const { provider, baseUrl, apiKey, model, userMessage, extraHeaders } = opts;
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          { role: "system", content: MSE_ANALYST_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const body = await res.text();
      const retrySeconds = extractRetrySeconds(res, body);
      throw new Error(
        withRetryAfter(`${provider} API ${res.status}: ${body.slice(0, 300)}`, retrySeconds),
      );
    }

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    if (!raw) throw new Error(`${provider} returned no content`);
    const parsed = parseAiSignal(raw);
    return { provider, ok: true, raw, parsed };
  } catch (err) {
    return { provider, ok: false, error: (err as Error).message };
  }
}
