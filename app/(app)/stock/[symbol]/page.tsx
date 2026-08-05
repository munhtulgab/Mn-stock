import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { getStockDetailFresh } from "@/lib/data";
import { getPortfolioSummary, getWatchlist } from "@/lib/portfolio";
import { getSettings } from "@/lib/settings";
import { fetchLiveQuotes, fetchMarketOpen, sessionEnd } from "@/lib/marketinfo/quotes";
import SignalBadge from "@/components/SignalBadge";
import PriceChart, { type ChartPoint } from "@/components/PriceChart";
import AiSignalPanel from "@/components/AiSignalPanel";
import CompanyNews from "@/components/CompanyNews";
import MarketInfoPanel from "@/components/MarketInfoPanel";
import LivePrice from "@/components/LivePrice";
import TradeModal from "@/components/TradeModal";
import WatchlistButton from "@/components/WatchlistButton";

export const dynamic = "force-dynamic";

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("mn-MN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Same as fmt, with the currency mark appended for money-valued figures. */
function money(value: number | null | undefined, digits = 2): string {
  const text = fmt(value, digits);
  return text === "—" ? text : `${text}\u00A0₮`;
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
  const [detail, user] = await Promise.all([
    getStockDetailFresh(db, symbol),
    getCurrentUser(db),
  ]);
  if (!detail) notFound();

  const { security, financials, priceHistory, fullHistory, recommendation, marketMedianPe } =
    detail;

  // Resolved during render, not after: leaving it to the client meant the
  // page painted the stored close and visibly corrected itself a moment later.
  const settings = await getSettings(db);
  const [portfolio, watchlist, liveQuotes, marketOpen] = await Promise.all([
    getPortfolioSummary(db, user!._id!),
    getWatchlist(db, user!._id!),
    fetchLiveQuotes({ extraCaCerts: settings.extraCaCerts }).catch(
      () => new Map(),
    ),
    fetchMarketOpen().catch(() => null),
  ]);
  const live = liveQuotes.get(security.companyCode) ?? null;
  const closedAt = sessionEnd(liveQuotes);
  const holding = portfolio.holdings.find((h) => h.symbol === security.symbol);
  const inWatchlist = watchlist.some((w) => w.symbol === security.symbol);

  // The running price is a point on the chart like any other: without it the
  // line stops at the previous session while the header quotes today.
  const series = [...fullHistory];
  const liveDate = live?.at?.slice(0, 10);
  if (live?.price != null && liveDate) {
    if (series.at(-1)?.date === liveDate) {
      series[series.length - 1] = { date: liveDate, close: live.price };
    } else if (!series.at(-1) || series.at(-1)!.date < liveDate) {
      series.push({ date: liveDate, close: live.price });
    }
  }

  const closes = series.map((p) => p.close);
  const chartData: ChartPoint[] = series.map((p, idx) => ({
    date: p.date,
    close: p.close,
    sma20: sma(closes, 20, idx),
    sma50: sma(closes, 50, idx),
  }));

  const last = priceHistory.at(-1) ?? null;
  const prev = priceHistory.length > 1 ? priceHistory[priceHistory.length - 2] : null;
  const changePct =
    last && prev && prev.close > 0
      ? ((last.close - prev.close) / prev.close) * 100
      : null;

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <Link href="/" className="text-sm text-app-muted">
        ← Буцах
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-app-text">{security.symbol}</h1>
          <p className="text-sm text-app-muted">{security.name}</p>
          <p className="text-xs text-app-muted mt-1 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-app-positive font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-positive opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-app-positive" />
              </span>
              Идэвхтэй
            </span>
            <span>· Ангилал {security.classification}</span>
          </p>
        </div>
        <div className="flex items-start gap-2">
          <LivePrice
            symbol={security.symbol}
            initial={
              live?.price != null
                ? {
                    price: live.price,
                    lastTrade: live.lastTrade,
                    changePct: live.changePct,
                    date: live.at?.slice(0, 10) ?? last?.date ?? null,
                    at:
                      marketOpen === true
                        ? (live.at?.slice(11, 16) ?? null)
                        : (closedAt ?? live.at?.slice(11, 16) ?? null),
                    isLive: marketOpen === true,
                    marketOpen,
                  }
                : {
                    price: last?.close ?? null,
                    changePct,
                    date: last?.date ?? null,
                    isLive: false,
                  }
            }
          />
          <WatchlistButton symbol={security.symbol} initialActive={inWatchlist} />
        </div>
      </div>

      <div className="rounded-2xl border border-app-border bg-app-card p-4">
        <div className="flex items-center gap-3 mb-3">
          <SignalBadge signal={recommendation.signal} />
          <span className="text-xs text-app-muted">
            Score {recommendation.score} (Техник {recommendation.technicalScore} / Фундаментал{" "}
            {recommendation.fundamentalScore})
          </span>
        </div>
        <ul className="space-y-1 text-xs text-app-text">
          {recommendation.reasons.map((reason, i) => (
            <li key={i} className="before:content-['›'] before:text-brand before:mr-2">
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {priceHistory.length > 0 && (
        <div className="rounded-2xl border border-app-border bg-app-card p-4">
          <h2 className="text-sm font-semibold text-app-text mb-3">Ханшийн график</h2>
          <PriceChart data={chartData} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-app-border bg-app-card p-4">
          <h2 className="text-sm font-semibold text-app-text mb-3">Техник үзүүлэлт</h2>
          <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
            <Metric label="SMA20" value={money(recommendation.indicators.sma20)} />
            <Metric label="SMA50" value={money(recommendation.indicators.sma50)} />
            <Metric label="RSI(14)" value={fmt(recommendation.indicators.rsi14, 1)} />
            <Metric
              label="Момент 20х"
              value={
                recommendation.indicators.momentum20 === null
                  ? "—"
                  : `${fmt(recommendation.indicators.momentum20)}%`
              }
            />
            <Metric label="52 долоо хоногийн дээд" value={money(recommendation.indicators.weekHigh52)} />
            <Metric label="52 долоо хоногийн доод" value={money(recommendation.indicators.weekLow52)} />
          </dl>
        </div>

        <div className="rounded-2xl border border-app-border bg-app-card p-4">
          <h2 className="text-sm font-semibold text-app-text mb-3">
            Санхүүгийн үзүүлэлт {financials ? `· ${financials.period}` : ""}
          </h2>
          {financials ? (
            <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
              <Metric label="P/E" value={fmt(financials.pe, 2)} />
              <Metric
                label="Захын дундаж P/E"
                value={marketMedianPe === null ? "—" : fmt(marketMedianPe, 2)}
              />
              <Metric label="EPS" value={money(financials.eps)} />
              <Metric label="ROE %" value={fmt(financials.roe)} />
              <Metric label="ROA %" value={fmt(financials.roa)} />
              <Metric label="Цэвэр ашиг" value={money(financials.netProfit, 0)} />
            </dl>
          ) : (
            <p className="text-xs text-app-muted">Мэдээлэл олдсонгүй.</p>
          )}
        </div>
      </div>

      <MarketInfoPanel symbol={security.symbol} />

      <CompanyNews symbol={security.symbol} />

      <AiSignalPanel symbol={security.symbol} />

      <div className="sticky bottom-0 -mx-4 px-4 pt-3 pb-1 bg-linear-to-t from-app-bg via-app-bg to-transparent">
        <TradeModal
          symbol={security.symbol}
          currentPrice={last?.close ?? null}
          cashBalance={portfolio.cashBalance}
          ownedQuantity={holding?.quantity ?? 0}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-app-muted">{label}</dt>
      <dd className="text-right tabular-nums text-app-text">{value}</dd>
    </>
  );
}
