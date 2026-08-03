import { z } from "zod";

export const AiSignalSchema = z.object({
  ticker: z.string(),
  company_name: z.string(),
  timestamp: z.string(),
  signal: z.enum(["BUY", "SELL", "HOLD"]),
  signal_confidence: z.number(),
  price_data: z.object({
    current_price: z.number(),
    target_price_1: z.number(),
    target_price_2: z.number(),
    stop_loss: z.number(),
  }),
  risk_assessment: z.object({
    risk_level: z.enum(["LOW", "MEDIUM", "HIGH"]),
    risk_reward_ratio: z.string(),
    liquidity_risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  }),
  analysis_summary: z.object({
    technical_reason: z.string(),
    fundamental_reason: z.string(),
    overall_logic: z.string(),
  }),
});

export type ParsedAiSignal = z.infer<typeof AiSignalSchema>;

export function extractJson(text: string): unknown {
  const fenced =
    text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1] : text;
  return JSON.parse(jsonText.trim());
}

export function parseAiSignal(text: string): ParsedAiSignal {
  return AiSignalSchema.parse(extractJson(text));
}
