import { MSE_ANALYST_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { parseAiSignal } from "@/lib/ai/schema";
import type { ProviderResult } from "./types";

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
            maxOutputTokens: 2000,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini API ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!raw) throw new Error("Gemini returned no content");
    const parsed = parseAiSignal(raw);
    return { provider: "gemini", ok: true, raw, parsed };
  } catch (err) {
    return { provider: "gemini", ok: false, error: (err as Error).message };
  }
}
