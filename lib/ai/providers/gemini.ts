import { MSE_ANALYST_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { parseAiSignal } from "@/lib/ai/schema";
import { withRetryAfter } from "@/lib/ai/retryAfter";
import type { ProviderResult } from "./types";

interface GeminiErrorDetail {
  "@type"?: string;
  retryDelay?: string;
}

/** Gemini reports rate-limit backoff as e.g. {"retryDelay": "23s"} inside
 * error.details, alongside an ErrorInfo entry — pull the number out. */
function extractGeminiRetrySeconds(bodyText: string): number | null {
  try {
    const parsed = JSON.parse(bodyText);
    const details: GeminiErrorDetail[] = parsed?.error?.details ?? [];
    const retryInfo = details.find((d) => d.retryDelay);
    const match = retryInfo?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

export async function callGemini(
  apiKey: string,
  userMessage: string,
): Promise<ProviderResult> {
  try {
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: MSE_ANALYST_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.3,
            // Generous headroom: this model spends an unpredictable chunk of
            // this same budget on hidden "thinking" tokens before writing
            // any output (observed 800-1500+ tokens), so a tight limit here
            // silently truncates the JSON output mid-string on longer runs.
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      const retrySeconds = extractGeminiRetrySeconds(body);
      throw new Error(
        withRetryAfter(`Gemini API ${res.status}: ${body.slice(0, 300)}`, retrySeconds),
      );
    }

    const data = await res.json();
    const finishReason = data?.candidates?.[0]?.finishReason;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `Gemini хариу токений хязгаараас давж таслагдсан (thinking token их зарцуулсан байж магадгүй). ${raw ? `Хэсэгчилсэн хариу: ${raw.slice(0, 200)}` : ""}`,
      );
    }
    if (!raw) throw new Error(`Gemini returned no content (finishReason: ${finishReason})`);
    const parsed = parseAiSignal(raw);
    return { provider: "gemini", ok: true, raw, parsed };
  } catch (err) {
    return { provider: "gemini", ok: false, error: (err as Error).message };
  }
}
