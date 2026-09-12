import Link from "next/link";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { ensurePricesCurrent, getStockDetail } from "@/lib/data";
import { sessionChangePct } from "@/lib/priceChange";
import { getPortfolioSummary, getWatchlist } from "@/lib/portfolio";
import { getSettings } from "@/lib/settings";
import { estimatedDividend } from "@/lib/dividends";
import {
  DETAIL_BUDGET_MS,
  fetchLiveQuotes,
  fetchFallbackQuote,
  fetchMarketOpen,
  sessionEnd,
} from "@/lib/marketinfo/quotes";
import SignalBadge from "@/components/SignalBadge";
import PriceChart, { type ChartPoint } from "@/components/PriceChart";
import AiSignalPanel from "@/components/AiSignalPanel";
import CompanyNews from "@/components/CompanyNews";
import LivePrice from "@/components/LivePrice";
import TradeModal from "@/components/TradeModal";
import WatchlistButton from "@/components/WatchlistButton";
import MetricInfo, { type MetricTerm } from "@/components/MetricInfo";
import TechnicalScorecard from "@/components/TechnicalScorecard";
import FundamentalPanel from "@/components/FundamentalPanel";
import RiskPanel from "@/components/RiskPanel";
import GoldFundamentals from "@/components/GoldFundamentals";
import ReturnDistribution from "@/components/ReturnDistribution";
import YearPanel from "@/components/YearPanel";
import DividendNotices from "@/components/DividendNotices";
import type { Financials } from "@/lib/types";
import DividendHistory from "@/components/DividendHistory";
import PeerTable from "@/components/PeerTable";
import CombinedSignalCard from "@/components/CombinedSignalCard";
import PriceChartPro from "@/components/PriceChartPro";
import { buildAnalysis } from "@/lib/analysis/report";
import { ulaanbaatarDay } from "@/lib/day";
import { refreshDividendsIfStale } from "@/lib/dividends";

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
  // Nothing in the live map means the primary feed is down and this company
  // is not one of the twenty on the exchange's movers board. Datalab knows
  // the session for any of them, so the page asks about this one rather than
  // quoting a close from before the weekend.
  const live =
    liveQuotes.get(security.companyCode) ??
    (await fetchFallbackQuote(security.companyCode).catch(() => null));
  const currentPrice = live?.price ?? priceHistory.at(-1)?.close ?? null;
  const today = ulaanbaatarDay(new Date());

  // Resolved during render, not after: leaving it to the client meant the
  // page painted the stored close and visibly corrected itself a moment later.
  const [portfolio, watchlist, marketOpen, analysis] = await Promise.all([
    getPortfolioSummary(db, user!._id!),
    getWatchlist(db, user!._id!),
    fetchMarketOpen().catch(() => null),
    // The scorecards, ratios, risk figures and peer ranking, all built from
    // the same candles on the server. It reads the whole market's latest
    // reports to rank this company against its sector, so it is awaited
    // alongside the rest rather than after them.
    buildAnalysis(db, security, currentPrice, today, live).catch((err) => {
      console.error(`analysis failed for ${security.symbol}`, err);
      return null;
    }),
  ]);
  // Behind the response. Rereading the exchange's news archive is eleven
  // pages plus an article apiece for the notices that bury their figure —
  // fifteen seconds measured. The card is served from what is stored and
  // picks the rebuild up on the next visit; putting it in front of the render
  // is what made this page sit on a skeleton.
  after(() => refreshDividendsIfStale(db));

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
            <span>
              ·{" "}
              {security.classification === "fund"
                ? "Хамтын сан"
                : `Ангилал ${security.classification}`}
            </span>
          </p>
        </div>
        {/* Centred against the price block rather than aligned to its first
            line: the price is two lines tall and the bookmark was sitting
            level with the top of the number, which read as hanging off it. */}
        <div className="flex items-center gap-2">
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
          <CombinedSignalCard
            combined={analysis.combined}
            basis={analysis.goldBasis ? "Алтны ханшаар" : undefined}
          />
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
            <PriceChartPro candles={analysis.candles} symbol={security.symbol} />
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
        {/* Everything the exchange files for the quarter, in the three
            groups it files them in — the balance sheet, the income
            statement, then the ratios it derives from both. The card used to
            show six of these and the other eight were stored and never
            drawn; a reader who wanted revenue or equity had to leave for
            open.mse.mn to read numbers this app already had. */}
        <div className="rounded-2xl border border-app-border bg-app-card p-4">
          <h2 className="text-sm font-semibold text-app-text mb-3">
            Санхүүгийн үзүүлэлт {financials ? `· ${financials.period}` : ""}
          </h2>
          {financials ? (
            <div className="space-y-3">
              <Group title="Санхүүгийн байдал">
                <Metric
                  label="Нийт хөрөнгө"
                  value={money(financials.totalAssets, 0)}
                  info="totalAssets"
                />
                <Metric
                  label="Өр төлбөрийн дүн"
                  value={money(financials.totalLiabilities, 0)}
                  info="totalLiabilities"
                />
                <Metric
                  label="Эзэмшигчдийн өмч"
                  value={money(financials.equity, 0)}
                  info="equity"
                />
                <Metric
                  label="Гаргасан хувьцаа"
                  value={`${fmt(financials.sharesOutstanding, 0)}\u00A0ш`}
                  info="sharesOutstanding"
                />
              </Group>

              <Group title="Орлого, үр дүн">
                <Metric
                  label={revenueLabel(financials.reportKind)}
                  value={money(financials.revenue, 0)}
                  info="revenue"
                />
                <Metric
                  label="Борлуулсаны өртөг"
                  value={money(financials.costOfSales, 0)}
                  info="costOfSales"
                />
                <Metric
                  label="Нийт ашиг"
                  value={money(financials.grossProfit, 0)}
                  info="grossProfit"
                />
                <Metric
                  label="Цэвэр ашиг"
                  value={money(financials.netProfit, 0)}
                  info="netProfit"
                />
                <Metric
                  label="Нэгж хувьцааны дансны үнэ"
                  value={money(financials.bookValuePerShare, 0)}
                  info="bookValuePerShare"
                />
              </Group>

              <Group title="Санхүүгийн харьцаа">
                <Metric
                  label="Нийт хөрөнгийн өгөөж /ROA/"
                  value={`${fmt(financials.roa)}\u00A0%`}
                  info="roa"
                />
                <Metric
                  label="Хувь нийлүүлсэн хөрөнгийн өгөөж /ROE/"
                  value={`${fmt(financials.roe)}\u00A0%`}
                  info="roe"
                />
                <Metric
                  label="Нийт хөрөнгийн эргэц /ROTA/"
                  value={fmt(financials.rota, 4)}
                  info="rota"
                />
                <Metric label="Нэгж хувьцааны өгөөж /EPS/" value={money(financials.eps)} info="eps" />
                <Metric
                  label="Үнэ ашгийн харьцаа (P/E Ratio)"
                  value={`${fmt(financials.pe, 2)}\u00A0х`}
                  info="pe"
                />
                <Metric
                  label="Захын дундаж P/E"
                  value={
                    marketMedianPe === null ? "—" : `${fmt(marketMedianPe, 2)}\u00A0х`
                  }
                  info="marketPe"
                />
              </Group>

              {/* Carried over from the market panel that stood beside this
                  one. A declared dividend is a fact about the company's
                  finances rather than about its market, and it was the one
                  thing on that card with nowhere else to go. Same source as
                  the dividend history table below, so the two never disagree. */}
              <DividendNotices
                years={analysis?.dividends ?? []}
                through={Number(today.slice(0, 4))}
                estimate={estimatedDividend(financials, currentPrice)}
              />
            </div>
          ) : (
            <p className="text-xs text-app-muted">Мэдээлэл олдсонгүй.</p>
          )}
        </div>
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
          {/* Read off the metal for a listing that is the metal. A fund
              three months old has no history to score and no accounts to
              rate, while what it holds has seventeen years of daily prices —
              so the panels take those, and each says so rather than letting
              the figures pass as the fund's own. */}
          <div className="md:order-5 md:col-span-3">
            <TechnicalScorecard
              scorecards={analysis.goldBasis?.scorecards ?? analysis.scorecards}
              basis={
                analysis.goldBasis
                  ? `Монголбанкны алт авах ханшаар (${analysis.goldBasis.from} – ${analysis.goldBasis.to}). Сан өөрөө ${analysis.candles.length} өдөр л арилжаалагдсан тул уншихад хүрэлцэхгүй.`
                  : undefined
              }
            />
          </div>

          <div className="md:order-6 md:col-span-2">
            {analysis.goldBasis ? (
              <GoldFundamentals basis={analysis.goldBasis} />
            ) : (
              <FundamentalPanel
                ratios={analysis.ratios}
                period={analysis.period}
                sectorLabel={analysis.sectorLabel}
                peerCount={analysis.peerCount}
                price={currentPrice}
                weekHigh52={recommendation.indicators.weekHigh52}
                weekLow52={recommendation.indicators.weekLow52}
                comparedToMarket={analysis.comparedToMarket}
              />
            )}
          </div>

          <div className="md:order-7 md:self-start">
            <DividendHistory dividends={analysis.dividends} />
          </div>

          {/* The year and the risk, side by side and half the board each.
              They are read against one another — a year's range and return
              beside the spread and the drawdown that produced them — and each
              was taking two of three columns on its own row, which left a
              column of nothing next to both and pushed them a screen apart.

              A pair inside one full-width cell rather than four columns in the
              outer grid: three does not divide in half, and the panels are
              wanted at equal width, not two-thirds and one-third. On a phone
              the wrapper is not a grid at all and they stack as before.

              Both panels are direct children of it so the row stretches them
              to a common height; a div around either one would take the
              stretch itself and leave the card inside it short.

              One column when there is no year profile, rather than the risk
              panel sitting in half a row with nothing beside it. Both class
              names are written out because Tailwind reads them from the
              source and a built-up one would compile to nothing. */}
          <div
            className={`md:order-7 md:col-span-3 space-y-4 md:space-y-0 md:grid md:gap-4 ${
              analysis.profile ? "md:grid-cols-2" : "md:grid-cols-1"
            }`}
          >
            {analysis.profile && (
              <YearPanel profile={analysis.profile} price={currentPrice} />
            )}
            <RiskPanel
              risk={analysis.goldBasis?.risk ?? analysis.risk}
              years={analysis.goldBasis?.riskYears ?? analysis.riskYears}
              basis={analysis.goldBasis ? "Алтны ханшаар" : undefined}
            />
          </div>

          {/* Directly under the risk figures, which state a spread where this
              draws its shape. */}
          {analysis.distribution && (
            <div className="md:order-8 md:col-span-2">
              <ReturnDistribution distribution={analysis.distribution} />
            </div>
          )}

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
/** A titled run of rows inside the financial card. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-app-muted mb-1">
        {title}
      </h3>
      <dl className="grid grid-cols-2 gap-y-1.5 text-xs">{children}</dl>
    </div>
  );
}

/**
 * One figure from the filing.
 *
 * `value` of "—" means the company does not file this line at all, and the
 * row is dropped rather than drawn: a bank files no cost of sales and no
 * gross profit, so a third of its income statement would otherwise be dashes
 * that read as an app which had failed to fetch them.
 */
/**
 * What a company calls its top line.
 *
 * The exchange publishes four report layouts and this app stores all four
 * under `revenue`, so a bank's interest income was appearing under
 * "Борлуулалтын орлого" — a heading no bank has.
 */
function revenueLabel(kind: Financials["reportKind"]): string {
  switch (kind) {
    case "bank":
    case "nbfi":
      return "Хүүгийн орлого";
    case "insurance":
      return "Даатгалын хураамжийн орлого";
    default:
      return "Борлуулалтын орлого";
  }
}

function Metric({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: MetricTerm;
}) {
  if (value === "—" || value.startsWith("—")) return null;
  return (
    <>
      <dt className="text-app-muted">
        <span className="inline-flex items-center gap-1">
          {label}
          {info && <MetricInfo term={info} />}
        </span>
      </dt>
      <dd className="text-right tabular-nums text-app-text">{value}</dd>
    </>
  );
}
