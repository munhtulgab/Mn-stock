import { z } from "zod";

const AiSignalSchema = z.object({
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

function extractJson(text: string): unknown {
  const fenced =
    text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const jsonText = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `Хариуг JSON болгож задлахад алдаа гарлаа (${(err as Error).message}). ` +
        `Урт: ${jsonText.length} тэмдэгт. Төгсгөл: "...${jsonText.slice(-120)}"`,
    );
  }
}

export function parseAiSignal(text: string): ParsedAiSignal {
  const json = extractJson(text);
  const result = AiSignalSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Хариу тохирох бүтэцтэй биш байна — ${issues}`);
  }
  return result.data;
}
