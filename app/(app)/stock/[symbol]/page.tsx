import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ensurePricesCurrent, getStockDetail } from "@/lib/data";
import { sessionChangePct } from "@/lib/priceChange";
import { getPortfolioSummary, getWatchlist } from "@/lib/portfolio";
import { getSettings } from "@/lib/settings";
import {
  DETAIL_BUDGET_MS,
  fetchLiveQuotes,
  fetchMarketOpen,
  sessionEnd,
} from "@/lib/marketinfo/quotes";
import SignalBadge from "@/components/SignalBadge";
import PriceChart, { type ChartPoint } from "@/components/PriceChart";
import AiSignalPanel from "@/components/AiSignalPanel";
import CompanyNews from "@/components/CompanyNews";
import MarketInfoPanel from "@/components/MarketInfoPanel";
import LivePrice from "@/components/LivePrice";
import TradeModal from "@/components/TradeModal";
import WatchlistButton from "@/components/WatchlistButton";
import MetricInfo, { type MetricTerm } from "@/components/MetricInfo";
import TechnicalScorecard from "@/components/TechnicalScorecard";
import FundamentalPanel from "@/components/FundamentalPanel";
import RiskPanel from "@/components/RiskPanel";
import DividendHistory from "@/components/DividendHistory";
import PeerTable from "@/components/PeerTable";
import CombinedSignalCard from "@/components/CombinedSignalCard";
import CandleChart from "@/components/CandleChart";
import { buildAnalysis } from "@/lib/analysis/report";
import { getDividendsFor } from "@/lib/dividends";
import { ulaanbaatarDay } from "@/lib/day";

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
  // Prices first, and before anything is rendered. The number this page
  // leads with is the price; showing the session before last and correcting
  // it on the next visit is not an acceptable trade for a faster paint. It
  // costs one fetch per company per session and nothing on a repeat view.
  const settings = await getSettings(db);
  // Waited for properly: this page's headline is the price, and rendering a
  // stale close here is what the reader sees flip a second later.
  const liveQuotes = await fetchLiveQuotes({
    extraCaCerts: settings.extraCaCerts,
    budgetMs: DETAIL_BUDGET_MS,
  }).catch(() => new Map());
  await ensurePricesCurrent(db, symbol);

  const [detail, user] = await Promise.all([
    getStockDetail(db, symbol, liveQuotes),
    getCurrentUser(db),
  ]);
  if (!detail) notFound();

  const { security, financials, priceHistory, fullHistory, recommendation, marketMedianPe } =
    detail;

  // The price every derived figure is measured against: the running quote
  // where the market is open, the last close otherwise. Read once here so
  // the dividend yields and the P/B on the analysis are quoting the same
  // number the header is.
  const currentPrice =
    liveQuotes.get(security.companyCode)?.price ?? priceHistory.at(-1)?.close ?? null;
  const today = ulaanbaatarDay(new Date());

  // Resolved during render, not after: leaving it to the client meant the
  // page painted the stored close and visibly corrected itself a moment later.
  const [portfolio, watchlist, marketOpen, dividends, analysis] = await Promise.all([
    getPortfolioSummary(db, user!._id!),
    getWatchlist(db, user!._id!),
    fetchMarketOpen().catch(() => null),
    // Read from the exchange's own notices rather than a third party, so a
    // company that pays has its figure whether or not marketinfo knows it.
    getDividendsFor(
      db,
      security.companyCode,
      currentPrice,
      // The clock is read here, once, rather than inside a component: which
      // three years the card shows depends on today, and a render that reads
      // the time is not the same render twice.
      today,
    ).catch(() => []),
    // The scorecards, ratios, risk figures and peer ranking, all built from
    // the same candles on the server. It reads the whole market's latest
    // reports to rank this company against its sector, so it is awaited
    // alongside the rest rather than after them.
    buildAnalysis(db, security, currentPrice, today).catch((err) => {
      console.error(`analysis failed for ${security.symbol}`, err);
      return null;
    }),
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
  const changePct = sessionChangePct(last, prev);

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

      {/* From a tablet up the page becomes a board rather than a scroll: the
          chart runs the full width, and under it the company's news takes two
          thirds with every panel of figures stacked in the last third.

          A phone reads the figures before the news, which is the order they
          are written in; the board wants the news on the left, so the two
          swap with `order` rather than by writing them twice. It starts at
          768px so an iPad held upright gets it too, rather than only when it
          is turned on its side. */}
      <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-3 md:gap-4 md:items-stretch">
      {/* The verdict leads the page. When the full analysis could not be
          built — the market's reports are read to rank this company against
          its sector, and that can fail — the older single-company reading
          stands in rather than leaving the page with no conclusion at all. */}
      <div className="md:order-1 md:col-span-3">
        {analysis ? (
          <CombinedSignalCard combined={analysis.combined} />
        ) : (
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
        )}
      </div>

      {priceHistory.length > 0 && (
        <div className="md:order-2 md:col-span-3 rounded-2xl border border-app-border bg-app-card p-4">
          {/* Candles where the full OHLC is to hand, which is everywhere the
              analysis built; the closing line is the fallback because it can
              be drawn from the two fields the page already had. */}
          {analysis && analysis.enoughHistory ? (
            <CandleChart candles={analysis.candles} />
          ) : (
            <PriceChart data={chartData} title="Ханшийн график" />
          )}
        </div>
      )}

      {/* The three panels of figures, in the board's last third. Held to its
          own height rather than stretched: it is what sets the row, and the
          news beside it is cut to fit. */}
      <div className="md:order-4 md:self-start">
        {/* Mirrors the news heading opposite — same type, same margin — so the
            first card here starts level with the first card there rather than
            with the words above it, and stays level if the heading changes. */}
        <div aria-hidden className="hidden md:block text-sm font-semibold mb-3">
          &nbsp;
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
        {/* The old six-figure technical card stood here. It is gone rather
            than kept alongside the scorecard below: it computed its RSI as a
            plain average over a 400-day window where the scorecard uses
            Wilder's smoothing over the whole history, so the two printed
            different RSIs for the same company on the same screen. The
            52-week range it also carried is in the market panel underneath. */}
        <div className="rounded-2xl border border-app-border bg-app-card p-4">
          <h2 className="text-sm font-semibold text-app-text mb-3">
            Санхүүгийн үзүүлэлт {financials ? `· ${financials.period}` : ""}
          </h2>
          {financials ? (
            <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
              <Metric label="P/E" value={fmt(financials.pe, 2)} info="pe" />
              <Metric
                label="Захын дундаж P/E"
                value={marketMedianPe === null ? "—" : fmt(marketMedianPe, 2)}
                info="marketPe"
              />
              <Metric label="EPS" value={money(financials.eps)} info="eps" />
              <Metric label="ROE %" value={fmt(financials.roe)} info="roe" />
              <Metric label="ROA %" value={fmt(financials.roa)} info="roa" />
              <Metric
                label="Цэвэр ашиг"
                value={money(financials.netProfit, 0)}
                info="netProfit"
              />
            </dl>
          ) : (
            <p className="text-xs text-app-muted">Мэдээлэл олдсонгүй.</p>
          )}
        </div>

          <MarketInfoPanel
            symbol={security.symbol}
            weekHigh52={recommendation.indicators.weekHigh52}
            weekLow52={recommendation.indicators.weekLow52}
            dividends={dividends}
          />
        </div>
      </div>

      <div className="md:order-3 md:col-span-2">
        <CompanyNews symbol={security.symbol} />
      </div>

      {/* The analysis proper, below the fold on every screen: the price, the
          news and the headline verdict are what a page is opened for, and
          these are what is read once the reader has decided to look further.

          Laid out two-thirds/one-third so the wide tables — the ratios, the
          risk tiles — get the room they need while the narrow ones sit
          beside them instead of under them. */}
      {analysis && (
        <>
          <div className="md:order-5 md:col-span-3">
            <TechnicalScorecard scorecards={analysis.scorecards} />
          </div>

          <div className="md:order-6 md:col-span-2">
            <FundamentalPanel
              ratios={analysis.ratios}
              period={analysis.period}
              sectorLabel={analysis.sectorLabel}
              peerCount={analysis.peerCount}
              comparedToMarket={analysis.comparedToMarket}
            />
          </div>

          <div className="md:order-7 md:self-start">
            <DividendHistory dividends={analysis.dividends} />
          </div>

          <div className="md:order-8 md:col-span-2">
            <RiskPanel risk={analysis.risk} years={analysis.riskYears} />
          </div>

          <div className="md:order-9 md:self-start">
            <PeerTable
              peers={analysis.peers}
              sectorLabel={analysis.sectorLabel}
              comparedToMarket={analysis.comparedToMarket}
            />
          </div>
        </>
      )}

      <div className="md:order-10 md:col-span-3">
        <AiSignalPanel symbol={security.symbol} />
      </div>
      </div>

      {/* In the page, under the analyst panel, and staying where it is put.
          It used to follow the scroll — first sticky, then fixed — and either
          way it moved about the screen while everything else did. Full width,
          so the pair splits it in half rather than sitting in a narrow strip
          down the middle of a board. */}
      <div>
        <TradeModal
          symbol={security.symbol}
          initial={{
            price: live?.price ?? last?.close ?? null,
            changePct: live?.changePct ?? changePct,
            date: live?.at?.slice(0, 10) ?? last?.date ?? null,
            bid: live?.bid ?? null,
            ask: live?.ask ?? null,
          }}
          cashBalance={portfolio.cashBalance}
          ownedQuantity={holding?.quantity ?? 0}
        />
      </div>
    </div>
  );
}

/**
 * `info` puts an "i" beside the label that opens what the figure means. The
 * financial ratios carry one because they are the figures on this page that
 * assume you already know what a P/E is.
 */
function Metric({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: MetricTerm;
}) {
  return (
    <>
      <dt className="text-app-muted">
        {label}
        {info && <MetricInfo term={info} />}
      </dt>
      <dd className="text-right tabular-nums text-app-text">{value}</dd>
    </>
  );
}
