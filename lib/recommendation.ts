import type { Financials, PricePoint, Recommendation } from "@/lib/types";

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const window = values.slice(values.length - period);
  return window.reduce((a, b) => a + b, 0) / period;
}

function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  const recent = closes.slice(closes.length - period - 1);
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Combines technical (price history) and fundamental (latest quarterly
 * report) signals into a single BUY/SELL/HOLD recommendation.
 *
 * `marketMedianPe` lets the caller compare a security's valuation against
 * the rest of the exchange rather than an arbitrary fixed threshold.
 */
export function computeRecommendation(
  prices: PricePoint[],
  financials: Financials | null,
  marketMedianPe: number | null,
): Recommendation {
  const reasons: string[] = [];
  const sorted = [...prices].sort((a, b) => (a.date < b.date ? -1 : 1));
  const closes = sorted.map((p) => p.close);
  const lastPrice = closes.at(-1) ?? null;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);

  const last20 = sorted.slice(-20);
  const momentum20 =
    last20.length >= 2 && last20[0].close > 0
      ? ((last20.at(-1)!.close - last20[0].close) / last20[0].close) * 100
      : null;

  const last252 = sorted.slice(-252);
  const weekHigh52 = last252.length
    ? Math.max(...last252.map((p) => p.high))
    : null;
  const weekLow52 = last252.length
    ? Math.min(...last252.map((p) => p.low))
    : null;
  const pricePositionInRange =
    lastPrice !== null && weekHigh52 !== null && weekLow52 !== null && weekHigh52 > weekLow52
      ? ((lastPrice - weekLow52) / (weekHigh52 - weekLow52)) * 100
      : null;

  let technicalScore = 0;

  if (lastPrice !== null && sma20 !== null && sma50 !== null) {
    if (lastPrice > sma20 && sma20 > sma50) {
      technicalScore += 30;
      reasons.push("Үнэ SMA20, SMA50-аас дээгүүр буюу өсөх чиг хандлагатай.");
    } else if (lastPrice < sma20 && sma20 < sma50) {
      technicalScore -= 30;
      reasons.push("Үнэ SMA20, SMA50-аас доогуур буюу буурах чиг хандлагатай.");
    }
  }

  if (rsi14 !== null) {
    if (rsi14 < 30) {
      technicalScore += 25;
      reasons.push(
        `RSI(14) ${rsi14.toFixed(1)} түвшинд хэт худалдсан (oversold) бүсэд байна.`,
      );
    } else if (rsi14 > 70) {
      technicalScore -= 25;
      reasons.push(
        `RSI(14) ${rsi14.toFixed(1)} түвшинд хэт худалдаж авсан (overbought) бүсэд байна.`,
      );
    }
  }

  if (momentum20 !== null) {
    if (momentum20 > 5) {
      technicalScore += 15;
      reasons.push(
        `Сүүлийн 20 арилжааны өдөрт ${momentum20.toFixed(1)}% өссөн.`,
      );
    } else if (momentum20 < -5) {
      technicalScore -= 15;
      reasons.push(
        `Сүүлийн 20 арилжааны өдөрт ${momentum20.toFixed(1)}% буурсан.`,
      );
    }
  }

  if (pricePositionInRange !== null) {
    if (pricePositionInRange < 20) {
      technicalScore += 10;
      reasons.push("52 долоо хоногийн доод үнийн түвшинд ойрхон байна.");
    } else if (pricePositionInRange > 90) {
      technicalScore -= 10;
      reasons.push("52 долоо хоногийн дээд үнийн түвшинд ойрхон байна.");
    }
  }

  let fundamentalScore = 0;
  if (financials) {
    if (financials.pe !== null && financials.pe > 0) {
      if (marketMedianPe && marketMedianPe > 0) {
        const ratio = financials.pe / marketMedianPe;
        if (ratio < 0.7) {
          fundamentalScore += 20;
          reasons.push(
            `P/E харьцаа (${financials.pe.toFixed(1)}) зах зээлийн дундажаас (${marketMedianPe.toFixed(1)}) доогуур буюу хямд үнэлэгдсэн.`,
          );
        } else if (ratio > 1.5) {
          fundamentalScore -= 20;
          reasons.push(
            `P/E харьцаа (${financials.pe.toFixed(1)}) зах зээлийн дундажаас (${marketMedianPe.toFixed(1)}) өндөр буюу үнэтэй үнэлэгдсэн.`,
          );
        }
      }
    }

    if (financials.roe !== null) {
      if (financials.roe > 15) {
        fundamentalScore += 15;
        reasons.push(`Өмчийн өгөөж (ROE) ${financials.roe.toFixed(1)}% сайн түвшинд байна.`);
      } else if (financials.roe < 0) {
        fundamentalScore -= 15;
        reasons.push("Өмчийн өгөөж (ROE) сөрөг байна.");
      }
    }

    if (financials.eps !== null && financials.eps < 0) {
      fundamentalScore -= 10;
      reasons.push("Нэгж хувьцаанд ногдох ашиг (EPS) сөрөг байна.");
    }
  } else {
    reasons.push("Санхүүгийн тайлангийн мэдээлэл олдсонгүй.");
  }

  const score = Math.max(
    -100,
    Math.min(100, technicalScore + fundamentalScore),
  );

  let signal: Recommendation["signal"] = "HOLD";
  if (score >= 25) signal = "BUY";
  else if (score <= -25) signal = "SELL";

  if (reasons.length === 0) {
    reasons.push("Тодорхой дохио үзэхэд хангалттай өгөгдөл алга.");
  }

  return {
    signal,
    score,
    technicalScore,
    fundamentalScore,
    reasons,
    indicators: {
      sma20,
      sma50,
      rsi14,
      momentum20,
      weekHigh52,
      weekLow52,
      pricePositionInRange,
    },
  };
}
