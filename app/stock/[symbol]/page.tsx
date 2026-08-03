import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getStockDetail } from "@/lib/data";
import SignalBadge from "@/components/SignalBadge";
import PriceChart, { type ChartPoint } from "@/components/PriceChart";
import AiSignalPanel from "@/components/AiSignalPanel";

export const dynamic = "force-dynamic";

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function sma(values: number[], period: number, index: number): number | null {
  if (index + 1 < period) return null;
  const window = values.slice(index + 1 - period, index + 1);
  return window.reduce((a, b) => a + b, 0) / period;
}

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const db = await getDb();
  const detail = await getStockDetail(db, symbol);
  if (!detail) notFound();

  const { security, financials, priceHistory, recommendation, marketMedianPe } =
    detail;

  const closes = priceHistory.map((p) => p.close);
  const chartData: ChartPoint[] = priceHistory.slice(-180).map((p) => {
    const idx = priceHistory.indexOf(p);
    return {
      date: p.date,
      close: p.close,
      sma20: sma(closes, 20, idx),
      sma50: sma(closes, 50, idx),
    };
  });

  const last = priceHistory.at(-1) ?? null;
  const prev = priceHistory.length > 1 ? priceHistory[priceHistory.length - 2] : null;
  const changePct =
    last && prev && prev.close > 0
      ? ((last.close - prev.close) / prev.close) * 100
      : null;

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 space-y-4">
      <Link
        href="/"
        className="text-[11px] uppercase tracking-wider text-term-muted hover:text-term-amber"
      >
        ← Back to Monitor
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 border border-term-border bg-term-panel px-4 py-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-term-amber">{security.symbol}</span>{" "}
            <span className="text-term-text text-base font-normal">
              {security.name}
            </span>
          </h1>
          <p className="text-[11px] text-term-muted mt-1 uppercase tracking-wide">
            Class {security.classification} · {last?.date ?? "—"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums text-term-text">
            {fmt(last?.close ?? null)}
          </div>
          <div
            className={`text-sm tabular-nums font-semibold ${
              changePct === null
                ? "text-term-muted"
                : changePct > 0
                  ? "text-term-green"
                  : changePct < 0
                    ? "text-term-red"
                    : "text-term-muted"
            }`}
          >
            {changePct === null
              ? "—"
              : `${changePct > 0 ? "▲+" : changePct < 0 ? "▼" : ""}${fmt(changePct)}%`}
          </div>
        </div>
      </div>

      <div className="border border-term-border bg-term-panel p-4">
        <div className="flex items-center gap-3 mb-3">
          <SignalBadge signal={recommendation.signal} />
          <span className="text-xs text-term-muted uppercase tracking-wide">
            Score {recommendation.score} (Tech {recommendation.technicalScore} / Fund{" "}
            {recommendation.fundamentalScore})
          </span>
        </div>
        <ul className="space-y-1 text-xs text-term-text">
          {recommendation.reasons.map((reason, i) => (
            <li key={i} className="before:content-['›'] before:text-term-amber before:mr-2">
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {priceHistory.length > 0 && (
        <div className="border border-term-border bg-term-panel p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-term-amber mb-2">
            Price // last {chartData.length} sessions
          </h2>
          <PriceChart data={chartData} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-term-border bg-term-panel p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-term-amber mb-3">
            Technical
          </h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
            <Metric label="SMA20" value={fmt(recommendation.indicators.sma20)} />
            <Metric label="SMA50" value={fmt(recommendation.indicators.sma50)} />
            <Metric label="RSI(14)" value={fmt(recommendation.indicators.rsi14, 1)} />
            <Metric
              label="Momentum 20d"
              value={
                recommendation.indicators.momentum20 === null
                  ? "—"
                  : `${fmt(recommendation.indicators.momentum20)}%`
              }
            />
            <Metric label="52W High" value={fmt(recommendation.indicators.weekHigh52)} />
            <Metric label="52W Low" value={fmt(recommendation.indicators.weekLow52)} />
          </dl>
        </div>

        <div className="border border-term-border bg-term-panel p-4">
          <h2 className="text-[11px] uppercase tracking-wider text-term-amber mb-3">
            Fundamentals {financials ? `// ${financials.period}` : ""}
          </h2>
          {financials ? (
            <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
              <Metric label="P/E" value={fmt(financials.pe, 2)} />
              <Metric
                label="Market Median P/E"
                value={marketMedianPe === null ? "—" : fmt(marketMedianPe, 2)}
              />
              <Metric label="EPS" value={fmt(financials.eps)} />
              <Metric label="ROE %" value={fmt(financials.roe)} />
              <Metric label="ROA %" value={fmt(financials.roa)} />
              <Metric label="Net Profit" value={fmt(financials.netProfit, 0)} />
            </dl>
          ) : (
            <p className="text-xs text-term-muted">Мэдээлэл олдсонгүй.</p>
          )}
        </div>
      </div>

      <AiSignalPanel symbol={security.symbol} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-term-muted uppercase tracking-wide">{label}</dt>
      <dd className="text-right tabular-nums text-term-text">{value}</dd>
    </>
  );
}
