"use client";

import { useState } from "react";
import type { Reading, Scorecard, Verdict } from "@/lib/analysis/indicators";
import { TIMEFRAMES, type Timeframe } from "@/lib/analysis/series";

/**
 * The eight oscillators and six moving averages, at a day, a week or a month.
 *
 * All three timeframes are computed on the server and sent together — they
 * come from the same candles, and re-fetching on every tap to recompute an
 * average of prices the page already has would be a round trip for nothing.
 * Switching is therefore instant, which is what makes comparing them useful.
 */

const VERDICT_LABELS: Record<Verdict, string> = {
  BUY: "Авах",
  NEUTRAL: "Төвийг сахисан",
  SELL: "Зарах",
};

const VERDICT_STYLES: Record<Verdict, string> = {
  BUY: "text-app-positive",
  SELL: "text-app-negative",
  NEUTRAL: "text-app-muted",
};

const SUMMARY_STYLES: Record<Verdict, string> = {
  BUY: "bg-app-positive-bg text-app-positive",
  SELL: "bg-app-negative-bg text-app-negative",
  NEUTRAL: "bg-app-elevated text-app-muted",
};

function formatValue(reading: Reading): string {
  if (reading.value === null) return "—";
  // OBV runs to nine figures where an RSI runs to two, so the grouping is
  // left to the locale rather than a fixed width.
  return reading.value.toLocaleString("mn-MN", { maximumFractionDigits: 2 });
}

function Row({ reading }: { reading: Reading }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-app-border/50 last:border-0">
      <div className="min-w-0">
        <div className="text-xs text-app-text truncate">{reading.label}</div>
        {reading.detail && (
          <div className="text-[10px] text-app-muted truncate">{reading.detail}</div>
        )}
      </div>
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="text-xs tabular-nums text-app-muted">
          {formatValue(reading)}
        </span>
        <span
          className={`text-[10px] font-semibold w-24 text-right ${
            reading.verdict ? VERDICT_STYLES[reading.verdict] : "text-app-muted"
          }`}
        >
          {reading.verdict ? VERDICT_LABELS[reading.verdict] : "—"}
        </span>
      </div>
    </div>
  );
}

export default function TechnicalScorecard({
  scorecards,
}: {
  scorecards: Record<Timeframe, Scorecard>;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const card = scorecards[timeframe];
  const { buy, sell, neutral } = card.counts;
  const total = buy + sell + neutral;

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-app-text">Техник шинжилгээ</h2>
        <div className="flex items-center gap-1 shrink-0">
          {TIMEFRAMES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTimeframe(key)}
              className={`rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${
                key === timeframe
                  ? "bg-brand text-black"
                  : "bg-app-bg text-app-muted border border-app-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="text-xs text-app-muted">
          Энэ хугацааны интервалд шинжилгээ хийхэд арилжааны түүх хүрэлцэхгүй
          байна.
        </p>
      ) : (
        <>
          {/* The tally first, because it is the answer and everything under it
              is the working. */}
          <div className="flex items-center gap-2 mb-3">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${SUMMARY_STYLES[card.summary]}`}
            >
              {VERDICT_LABELS[card.summary]}
            </span>
            <span className="text-[11px] text-app-muted">
              {buy} авах · {sell} зарах · {neutral} төвийг сахисан
            </span>
          </div>

          {/* One bar rather than three numbers again: the shape of the split
              is the thing, and a reader takes it in without counting. */}
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-app-bg mb-4">
            <div
              className="bg-app-positive"
              style={{ width: `${(buy / total) * 100}%` }}
            />
            <div
              className="bg-app-muted/40"
              style={{ width: `${(neutral / total) * 100}%` }}
            />
            <div
              className="bg-app-negative"
              style={{ width: `${(sell / total) * 100}%` }}
            />
          </div>

          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div>
              <h3 className="text-[11px] font-medium text-app-muted mb-1">
                Осцилляторууд
              </h3>
              {card.oscillators.map((reading) => (
                <Row key={reading.key} reading={reading} />
              ))}
            </div>
            <div>
              <h3 className="text-[11px] font-medium text-app-muted mb-1 mt-3 sm:mt-0">
                Хөдөлгөөнт дундаж
              </h3>
              {card.movingAverages.map((reading) => (
                <Row key={reading.key} reading={reading} />
              ))}
            </div>
          </div>

          <p className="mt-3 text-[10px] text-app-muted">
            {card.bars.toLocaleString("mn-MN")} лаанаас тооцов. Хөдөлгөөнт
            дунджийг ханштай харьцуулав; RSI, Stochastic-ийн хэт авалт/хэт
            зарагдалтын түвшин 70/30 ба 80/20.
          </p>
        </>
      )}
    </div>
  );
}
