import type { ParsedAiSignal } from "@/lib/ai/schema";
import type { ProviderResult } from "@/lib/ai/providers/types";
import type { Signal } from "@/lib/types";

/**
 * What a model returns is a claim, not a result.
 *
 * A language model will happily answer BUY and then name a target below
 * today's price, put the stop above it, quote a confidence of 0.85 where the
 * scale is 0-100, or answer about a different company altogether. None of
 * that is visible in the JSON's shape — it parses cleanly — so it has to be
 * checked against the one thing we know independently: the price.
 *
 * A claim that fails is not repaired into a different claim. It is dropped,
 * with the reason shown next to that provider's name, and the consensus is
 * formed from whatever survived.
 */

/** How far a stated price may sit from the real one before it is nonsense. */
const MIN_PRICE_RATIO = 0.2;
const MAX_PRICE_RATIO = 5;

export type Validation =
  | { ok: true; value: ParsedAiSignal }
  | { ok: false; reason: string };

export function validateSignal(
  parsed: ParsedAiSignal,
  symbol: string,
  currentPrice: number | null,
): Validation {
  if (parsed.ticker && parsed.ticker.toUpperCase() !== symbol.toUpperCase()) {
    return {
      ok: false,
      reason: `Өөр компанийн хариу (${parsed.ticker}, хүссэн нь ${symbol}).`,
    };
  }

  // Some models answer on a 0-1 scale despite the instruction; that is a
  // stated confidence in a different unit, not a broken answer.
  let confidence = parsed.signal_confidence;
  if (confidence > 0 && confidence <= 1) confidence *= 100;
  if (!Number.isFinite(confidence)) {
    return { ok: false, reason: "Итгэлцлийн утга тоо биш байна." };
  }
  confidence = Math.round(Math.min(100, Math.max(0, confidence)));

  const { target_price_1, target_price_2, stop_loss } = parsed.price_data;
  const prices = [target_price_1, target_price_2, stop_loss];
  if (prices.some((p) => !Number.isFinite(p) || p <= 0)) {
    return { ok: false, reason: "Үнийн зорилт эсвэл зогсоох цэг эерэг тоо биш." };
  }

  if (currentPrice !== null && currentPrice > 0) {
    const off = prices.find(
      (p) =>
        p < currentPrice * MIN_PRICE_RATIO || p > currentPrice * MAX_PRICE_RATIO,
    );
    if (off !== undefined) {
      return {
        ok: false,
        reason: `Үнийн зорилт бодит ханшаас хэт хол (${off} ба ${currentPrice}).`,
      };
    }

    // The direction has to match the call it is attached to. A BUY whose
    // target is below today's price is not a weak BUY, it is a contradiction.
    if (parsed.signal === "BUY" && !(target_price_1 > currentPrice && stop_loss < currentPrice)) {
      return {
        ok: false,
        reason: "АВАХ дохионы зорилт/зогсоох цэг чиглэлдээ нийцэхгүй байна.",
      };
    }
    if (parsed.signal === "SELL" && !(target_price_1 < currentPrice && stop_loss > currentPrice)) {
      return {
        ok: false,
        reason: "ЗАРАХ дохионы зорилт/зогсоох цэг чиглэлдээ нийцэхгүй байна.",
      };
    }
  }

  // Which target is the further one is an ordering, not a claim — a swap is
  // worth straightening rather than throwing the whole answer away.
  const [near, far] =
    currentPrice !== null &&
    Math.abs(target_price_2 - currentPrice) < Math.abs(target_price_1 - currentPrice)
      ? [target_price_2, target_price_1]
      : [target_price_1, target_price_2];

  return {
    ok: true,
    value: {
      ...parsed,
      signal_confidence: confidence,
      price_data: {
        ...parsed.price_data,
        current_price: currentPrice ?? parsed.price_data.current_price,
        target_price_1: near,
        target_price_2: far,
        stop_loss,
      },
    },
  };
}

/** "1:2.4" from what the consensus actually says, not from one model's text. */
function riskRewardRatio(
  currentPrice: number,
  target: number,
  stop: number,
): string {
  const risk = Math.abs(currentPrice - stop);
  const reward = Math.abs(target - currentPrice);
  if (risk <= 0 || !Number.isFinite(risk) || !Number.isFinite(reward)) return "—";
  return `1:${(reward / risk).toFixed(1)}`;
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function pickMajoritySignal(parsed: ParsedAiSignal[]): Signal {
  const counts: Record<Signal, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  const confidenceSum: Record<Signal, number> = { BUY: 0, SELL: 0, HOLD: 0 };
  for (const p of parsed) {
    counts[p.signal]++;
    confidenceSum[p.signal] += p.signal_confidence;
  }
  let best: Signal = "HOLD";
  for (const s of ["BUY", "SELL", "HOLD"] as Signal[]) {
    if (
      counts[s] > counts[best] ||
      (counts[s] === counts[best] && confidenceSum[s] > confidenceSum[best])
    ) {
      best = s;
    }
  }
  return best;
}

/**
 * One answer from several. The majority call wins; its price levels are the
 * average of the models that made it, and every figure the reader sees is
 * derived from those averages — including the risk:reward ratio, which was
 * previously copied from one model's text and could contradict the numbers
 * printed beside it.
 */
export function buildConsensus(
  results: ProviderResult[],
  currentPrice: number | null,
): { consensus: ParsedAiSignal; agreement: number } {
  const successful = results
    .filter((r) => r.ok && r.parsed)
    .map((r) => r.parsed as ParsedAiSignal);
  const majority = pickMajoritySignal(successful);
  const agreeing = successful.filter((p) => p.signal === majority);
  const agreement = agreeing.length / successful.length;

  // Representative for the prose: the most confident of the agreeing models.
  const representative = [...agreeing].sort(
    (a, b) => b.signal_confidence - a.signal_confidence,
  )[0];

  const price = currentPrice ?? representative.price_data.current_price;
  const target1 = average(agreeing.map((p) => p.price_data.target_price_1));
  const target2 = average(agreeing.map((p) => p.price_data.target_price_2));
  const stop = average(agreeing.map((p) => p.price_data.stop_loss));

  const consensus: ParsedAiSignal = {
    ...representative,
    signal: majority,
    signal_confidence: Math.round(average(agreeing.map((p) => p.signal_confidence))),
    price_data: {
      current_price: price,
      target_price_1: target1,
      target_price_2: target2,
      stop_loss: stop,
    },
    risk_assessment: {
      ...representative.risk_assessment,
      risk_reward_ratio: riskRewardRatio(price, target1, stop),
    },
    analysis_summary: {
      ...representative.analysis_summary,
      overall_logic: `${agreeing.length}/${successful.length} үйлчилгээ ${majority} дохио өгсөн (тохиролцоо ${Math.round(agreement * 100)}%). ${representative.analysis_summary.overall_logic}`,
    },
  };

  return { consensus, agreement };
}

/** Just enough of a stored provider row to judge it. */
export interface LockstepInput {
  ok: boolean;
  signal?: Signal;
  confidence?: number;
}

/**
 * Whether the analysts have answered as one voice rather than several.
 *
 * Three or more models returning not just the same call but the same
 * confidence to the integer is not agreement — independent readings do not
 * land on the same number. It happened, and the cause was the prompt: every
 * model was handed this app's own verdict and confidence and asked whether it
 * agreed, so all five returned BUY at exactly 83%, and the agreement figure
 * beside them read 100%.
 *
 * The prompt no longer shows them the answer. This stays because the reader
 * had to catch that by eye, and a panel whose whole claim is independence
 * should be able to say when its own output stops looking independent.
 */
export function inLockstep(providers: LockstepInput[]): boolean {
  const answered = providers.filter((p) => p.ok && p.confidence !== undefined);
  if (answered.length < 3) return false;
  return answered.every(
    (p) => p.confidence === answered[0].confidence && p.signal === answered[0].signal,
  );
}
