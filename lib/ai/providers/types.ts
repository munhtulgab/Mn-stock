import type { ParsedAiSignal } from "@/lib/ai/schema";

export type ProviderName = "anthropic" | "gemini" | "groq" | "openrouter";

export interface ProviderResult {
  provider: ProviderName;
  ok: boolean;
  raw?: string;
  parsed?: ParsedAiSignal;
  error?: string;
}
