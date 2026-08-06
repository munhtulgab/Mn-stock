import type { RiskMetrics } from "@/lib/analysis/risk";

/**
 * What holding this share has actually cost in volatility.
 *
 * Each figure carries a word on how to read it, because these are the
 * numbers on the page most likely to be recognised without being understood
 * — a Sharpe of 0.9 means nothing to someone who does not already know that
 * above 1 is good.
 */

interface Metric {
  label: string;
  value: string;
  hint: string;
  tone?: "good" | "bad" | null;
}

function fmt(value: number | null, digits: number, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}${suffix}`;
}

function betaHint(beta: number | null): string {
  if (beta === null) return "Тооцох хангалттай арилжаа алга";
  if (beta > 1.2) return "Зах зээлээс хүчтэй хэлбэлздэг";
  if (beta < 0.8) return "Зах зээлээс тогтвортой";
  return "Зах зээлтэй ойролцоо";
}

export default function RiskPanel({
  risk,
  years,
}: {
  risk: RiskMetrics;
  years: number;
}) {
  const metrics: Metric[] = [
    {
      label: `Бета ${years}Ж`,
      value: fmt(risk.beta, 2),
      hint: betaHint(risk.beta),
      tone: risk.beta === null ? null : risk.beta > 1.3 ? "bad" : null,
    },
    {
      label: "Хэлбэлзэл",
      value: fmt(risk.volatility, 1, "%"),
      hint: "Жилийн стандарт хазайлт",
      tone: risk.volatility === null ? null : risk.volatility > 60 ? "bad" : null,
    },
    {
      label: "Sharpe",
      value: fmt(risk.sharpe, 2),
      hint: "Эрсдэлд тохируулсан өгөөж — 1-ээс дээш бол сайн",
      tone: risk.sharpe === null ? null : risk.sharpe > 1 ? "good" : risk.sharpe < 0 ? "bad" : null,
    },
    {
      label: "Sortino",
      value: fmt(risk.sortino, 2),
      hint: "Зөвхөн уналтын эрсдэлээр хэмжсэн",
      tone:
        risk.sortino === null ? null : risk.sortino > 1 ? "good" : risk.sortino < 0 ? "bad" : null,
    },
    {
      label: "VaR 95%",
      value: fmt(risk.var95, 2, "%"),
      hint: "20 өдрийн 1-д үүнээс их алддаг",
    },
    {
      label: "Хамгийн их уналт",
      value: fmt(risk.maxDrawdown, 1, "%"),
      hint: "Оргилоосоо ёроол хүртэл",
      tone: risk.maxDrawdown === null ? null : risk.maxDrawdown > 50 ? "bad" : null,
    },
  ];

  return (
    <div className="rounded-2xl border border-app-border bg-app-card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-app-text">Эрсдэлийн үзүүлэлт</h2>
        <span className="text-[10px] text-app-muted">
          Сүүлийн {years} жил
          {risk.annualReturn !== null &&
            ` · жилийн өгөөж ${fmt(risk.annualReturn, 1, "%")}`}
        </span>
      </div>

      {risk.overlap === 0 ? (
        <p className="text-xs text-app-muted">
          Эрсдэлийн үзүүлэлт тооцоход арилжааны түүх хүрэлцэхгүй байна.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl bg-app-bg p-2.5">
              <div className="text-[10px] text-app-muted">{metric.label}</div>
              <div
                className={`text-sm font-semibold tabular-nums ${
                  metric.tone === "good"
                    ? "text-app-positive"
                    : metric.tone === "bad"
                      ? "text-app-negative"
                      : "text-app-text"
                }`}
              >
                {metric.value}
              </div>
              <div className="text-[9px] leading-tight text-app-muted mt-0.5">
                {metric.hint}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] text-app-muted">
        Бета, хэлбэлзлийг TOP-20 индекстэй харьцуулж, хоёулаа арилжаалсан
        өдрүүдээр тооцов. Эрсдэлгүй өгөөжийг 10% гэж авав.
      </p>
    </div>
  );
}
