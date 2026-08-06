import type { CombinedSignal } from "@/lib/analysis/signal";
import SignalBadge from "./SignalBadge";

/**
 * The one verdict the three readings come to, and how much of the evidence
 * was there to reach it.
 *
 * The confidence bar is the point of this card. A BUY at 82% and a BUY at
 * 31% are different statements, and showing the verdict without it invites
 * the reader to treat a thin, half-evidenced guess exactly as they would a
 * well-supported one.
 */

const PART_LABELS: { key: keyof CombinedSignal["parts"]; label: string }[] = [
  { key: "fundamental", label: "Фундаментал" },
  { key: "technical", label: "Техник" },
  { key: "risk", label: "Эрсдэл" },
];

function confidenceWord(confidence: number): string {
  if (confidence >= 75) return "Өндөр";
  if (confidence >= 50) return "Дунд";
  return "Бага";
}

export default function CombinedSignalCard({
  combined,
}: {
  combined: CombinedSignal;
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="text-sm font-semibold text-app-text">Нэгдсэн дүгнэлт</h2>
        <SignalBadge signal={combined.signal} />
        <span className="text-xs text-app-muted">Оноо {combined.score}</span>
      </div>

      <div className="mb-3">
        <div className="flex items-baseline justify-between text-[11px] mb-1">
          <span className="text-app-muted">
            Итгэлцлийн түвшин — {confidenceWord(combined.confidence)}
          </span>
          <span className="tabular-nums text-app-text font-semibold">
            {combined.confidence}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-bg">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${combined.confidence}%` }}
          />
        </div>
      </div>

      {/* What each reading contributed, so a verdict that rests on one leg is
          visibly resting on one leg. */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {PART_LABELS.map(({ key, label }) => {
          const value = combined.parts[key];
          return (
            <div key={key} className="rounded-xl bg-app-bg px-2 py-1.5 text-center">
              <div className="text-[10px] text-app-muted">{label}</div>
              <div
                className={`text-xs font-semibold tabular-nums ${
                  value === null
                    ? "text-app-muted"
                    : value > 0
                      ? "text-app-positive"
                      : value < 0
                        ? "text-app-negative"
                        : "text-app-text"
                }`}
              >
                {value === null ? "—" : value > 0 ? `+${value}` : value}
              </div>
            </div>
          );
        })}
      </div>

      <ul className="space-y-1 text-xs text-app-text">
        {combined.reasons.map((reason, i) => (
          <li key={i} className="before:content-['›'] before:text-brand before:mr-2">
            {reason}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[10px] text-app-muted">
        Фундаментал 45%, техник 35%, эрсдэл 20% жинтэй. Байхгүй хэсгийг
        орхиж, үлдсэнээр нь дахин жинлэв. Энэ нь хөрөнгө оруулалтын зөвлөгөө
        биш.
      </p>
    </div>
  );
}
