import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { MSE_ANALYST_SYSTEM_PROMPT } from "./systemPrompt";
import type { Financials, PricePoint, Recommendation, Security } from "@/lib/types";
import type { CompanyNewsItem } from "@/lib/mse/news";

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

export class AiNotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not configured");
    this.name = "AiNotConfiguredError";
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function buildUserMessage(input: {
  security: Security;
  prices: PricePoint[];
  financials: Financials | null;
  recommendation: Recommendation;
  news: CompanyNewsItem[];
}): string {
  const { security, prices, financials, recommendation, news } = input;
  const last = prices.at(-1) ?? null;
  const recent20Volume = average(prices.slice(-20).map((p) => p.volume));
  const dailyLimitUp = last ? last.close * 1.15 : null;
  const dailyLimitDown = last ? last.close * 0.85 : null;

  const recentCandles = prices.slice(-30).map((p) => ({
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }));

  const payload = {
    now: new Date().toISOString(),
    security: {
      symbol: security.symbol,
      name: security.name,
      classification: security.classification,
    },
    current_price: last?.close ?? null,
    daily_price_limit: {
      up: dailyLimitUp,
      down: dailyLimitDown,
      note: "MSE-д нэг өдөрт ханш өмнөх хаалтын үнээс ±15%-иас хэтэрч хэлбэлзэх боломжгүй.",
    },
    technical_indicators: {
      sma20: recommendation.indicators.sma20,
      sma50: recommendation.indicators.sma50,
      rsi14: recommendation.indicators.rsi14,
      momentum20_pct: recommendation.indicators.momentum20,
      week52_high: recommendation.indicators.weekHigh52,
      week52_low: recommendation.indicators.weekLow52,
      price_position_in_52w_range_pct: recommendation.indicators.pricePositionInRange,
      avg_volume_last_20d: recent20Volume,
      last_volume: last?.volume ?? null,
    },
    rule_based_score: {
      signal: recommendation.signal,
      score: recommendation.score,
      technical_score: recommendation.technicalScore,
      fundamental_score: recommendation.fundamentalScore,
      reasons: recommendation.reasons,
    },
    fundamentals: financials
      ? {
          period: financials.period,
          pe: financials.pe,
          eps: financials.eps,
          roe: financials.roe,
          roa: financials.roa,
          net_profit: financials.netProfit,
          revenue: financials.revenue,
          shares_outstanding: financials.sharesOutstanding,
        }
      : null,
    recent_news: news.map((n) => ({ title: n.title, date: n.date })),
    recent_daily_candles_oldest_to_newest: recentCandles,
  };

  return [
    `Дараах МХБ-д бүртгэлтэй "${security.symbol}" (${security.name}) компанийн бодит арилжааны болон санхүүгийн дата өгөгдлийг дүн шинжилгээ хийж, зааврын дагуу зөвхөн JSON гаргана.`,
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n");
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1] : text;
  return JSON.parse(jsonText.trim());
}

export async function generateAiSignal(input: {
  security: Security;
  prices: PricePoint[];
  financials: Financials | null;
  recommendation: Recommendation;
  news: CompanyNewsItem[];
}): Promise<{ raw: string; parsed: ParsedAiSignal }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const response = await client.messages.create({
    model,
    max_tokens: 1200,
    system: MSE_ANALYST_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";
  const parsed = AiSignalSchema.parse(extractJson(raw));

  return { raw, parsed };
}
