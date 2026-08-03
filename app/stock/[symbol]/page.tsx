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
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Жагсаалт руу буцах
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {security.symbol}{" "}
            <span className="text-neutral-400 text-lg font-normal">
              {security.name}
            </span>
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Ангилал: {security.classification} · Огноо: {last?.date ?? "—"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums">
            {fmt(last?.close ?? null)}₮
          </div>
          <div
            className={`text-sm tabular-nums ${
              changePct === null
                ? "text-neutral-500"
                : changePct > 0
                  ? "text-emerald-400"
                  : changePct < 0
                    ? "text-rose-400"
                    : "text-neutral-400"
            }`}
          >
            {changePct === null ? "—" : `${changePct > 0 ? "+" : ""}${fmt(changePct)}%`}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex items-center gap-3 mb-3">
          <SignalBadge signal={recommendation.signal} />
          <span className="text-sm text-neutral-400">
            Дундаж оноо: {recommendation.score} (Техник {recommendation.technicalScore}, Фундаментал {recommendation.fundamentalScore})
          </span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-sm text-neutral-300">
          {recommendation.reasons.map((reason, i) => (
            <li key={i}>{reason}</li>
          ))}
        </ul>
      </div>

      {priceHistory.length > 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="font-semibold text-sm mb-2">
            Ханшийн график (сүүлийн {chartData.length} арилжааны өдөр)
          </h2>
          <PriceChart data={chartData} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-6">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="font-semibold text-sm mb-3">Техник үзүүлэлт</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <Metric label="SMA20" value={fmt(recommendation.indicators.sma20)} />
            <Metric label="SMA50" value={fmt(recommendation.indicators.sma50)} />
            <Metric label="RSI(14)" value={fmt(recommendation.indicators.rsi14, 1)} />
            <Metric
              label="20 хоногийн момент"
              value={
                recommendation.indicators.momentum20 === null
                  ? "—"
                  : `${fmt(recommendation.indicators.momentum20)}%`
              }
            />
            <Metric label="52 долоо хоногийн дээд" value={fmt(recommendation.indicators.weekHigh52)} />
            <Metric label="52 долоо хоногийн доод" value={fmt(recommendation.indicators.weekLow52)} />
          </dl>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="font-semibold text-sm mb-3">
            Санхүүгийн үзүүлэлт {financials ? `(${financials.period})` : ""}
          </h2>
          {financials ? (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <Metric label="P/E" value={fmt(financials.pe, 2)} />
              <Metric
                label="Зах зээлийн дундаж P/E"
                value={marketMedianPe === null ? "—" : fmt(marketMedianPe, 2)}
              />
              <Metric label="EPS" value={fmt(financials.eps)} />
              <Metric label="ROE (%)" value={fmt(financials.roe)} />
              <Metric label="ROA (%)" value={fmt(financials.roa)} />
              <Metric label="Цэвэр ашиг" value={fmt(financials.netProfit, 0)} />
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">Мэдээлэл олдсонгүй.</p>
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
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </>
  );
}
