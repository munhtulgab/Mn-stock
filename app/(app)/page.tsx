import Link from "next/link";
import { after } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  applyLiveQuotes,
  getDashboardRows,
  pricedRecently,
  tradedSession,
  type DashboardRow,
} from "@/lib/data";
import type { ExchangeMover } from "@/lib/mse/movers";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioSummary, getWatchlist } from "@/lib/portfolio";
import { getMarketIndices } from "@/lib/indices";
import { checkSignalChangesIfDue } from "@/lib/signalHistory";
import { getMarketNews, refreshMarketNews } from "@/lib/marketNews";
import { getSettings } from "@/lib/settings";
import StockAvatar from "@/components/StockAvatar";
import SignalBadge from "@/components/SignalBadge";
import Sparkline from "@/components/Sparkline";
import Num, { Pct } from "@/components/Num";
import PortfolioValueCard from "@/components/PortfolioValueCard";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * How stale a security's last trade may be before its score stops meaning
 * anything. Many MSE listings trade a handful of times a month, so the bound
 * has to be generous enough to keep them — but not so generous that a
 * listing dormant since 2006 is offered as a pick.
 */
const TOP_PICK_MAX_AGE_DAYS = 45;

/**
 * How many gainers and how many losers to show. Also what makes a date worth
 * calling a session: a day that produced fewer trades than the two lists ask
 * for has not really opened yet, and yesterday's full board is the more
 * useful thing to show until it has.
 */
const MOVERS = 6;

export default async function HomePage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const settings = await getSettings(db);
  const [storedRows, portfolio, watchlist, indices] = await Promise.all([
    getDashboardRows(db),
    getPortfolioSummary(db, user!._id!),
    getWatchlist(db, user!._id!),
    getMarketIndices(db),
  ]);
  const { rows, session, board } = await applyLiveQuotes(storedRows, {
    extraCaCerts: settings.extraCaCerts,
  });

  // Both after the page has been sent. Signals turn during a session, not at
  // the hour the nightly cron happens to run, and news is published all day;
  // waiting for either would have meant hearing about it a day late, or only
  // if somebody happened to open the news tab. Each is gated — the signal
  // check to once a quarter of an hour, the news to its own half-hour cache
  // — so a busy morning does not run them over and over.
  after(async () => {
    await checkSignalChangesIfDue(db);
    const { stale } = await getMarketNews(db);
    if (stale) await refreshMarketNews(db);
  });

  const displayName = user?.fullName || user?.username || "";

  // Straight from the exchange's own board where it can be reached: those
  // are the securities moving in the session that is running, said by the
  // exchange, rather than a ranking of whatever closes happen to be stored.
  // The stored rows are still what draws each card — logo, trend line, the
  // link to the company — so the two are joined on the ticker.
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const fromBoard = (movers: ExchangeMover[]): DashboardRow[] =>
    movers.slice(0, MOVERS).map((m) => {
      const row = bySymbol.get(m.symbol);
      return {
        symbol: m.symbol,
        name: row?.name ?? m.name,
        classification: row?.classification ?? "unknown",
        companyCode: row?.companyCode ?? 0,
        lastPrice: m.price,
        lastDate: session,
        changePct: m.changePct,
        volume: row?.volume ?? null,
        // The board says what moved, not what to do about it. Where the
        // stored row has no verdict this has none either, rather than
        // inventing a HOLD that nothing computed.
        signal: row?.signal ?? null,
        score: row?.score ?? null,
        sparkline: row?.sparkline ?? [],
      };
    });

  // Only when the exchange cannot be asked: rank the stored session instead.
  const stored = tradedSession(rows, MOVERS * 2);
  const hasBoard = board.gainers.length > 0 || board.losers.length > 0;
  const gainers = hasBoard
    ? fromBoard(board.gainers)
    : stored.rows
        .filter((r) => r.changePct! > 0)
        .sort((a, b) => b.changePct! - a.changePct!)
        .slice(0, MOVERS);
  const losers = hasBoard
    ? fromBoard(board.losers)
    : stored.rows
        .filter((r) => r.changePct! < 0)
        .sort((a, b) => a.changePct! - b.changePct!)
        .slice(0, MOVERS);
  const moversSession = hasBoard ? session : stored.session;
  // Untraded listings score 0 across the board; ranking them as "top picks"
  // would just surface whatever sorts first alphabetically. A long-dormant
  // listing is excluded for the same reason its indicators are meaningless.
  const topPicks = pricedRecently(rows, TOP_PICK_MAX_AGE_DAYS)
    .filter(
      // A company with no verdict cannot be a pick: there is nothing to rank
      // it by and nothing to badge it with.
      (r): r is typeof r & { score: number; signal: NonNullable<typeof r.signal> } =>
        r.lastPrice !== null && r.score !== null && r.score !== 0 && r.signal !== null,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <PageHeader eyebrow="Сайн байна уу," title={`${displayName} 👋`} />

      {/* One column on a phone, two from a laptop up — and the same source
          order in both, so nothing has to be read in a different sequence
          depending on the screen. Sections that carry a row of cards or a
          full-width list keep both columns; the two short lists pair up. */}
      <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <PortfolioValueCard
        totalValue={portfolio.totalValue}
        todayGain={portfolio.todayGain}
        todayGainPct={portfolio.todayGainPct}
      />


      {indices.length > 0 && (
        <div className="lg:col-span-2 grid grid-cols-3 gap-2 lg:gap-4">
          {indices.map((idx) => (
            <div
              key={idx.key}
              className="rounded-2xl bg-app-card border border-app-border p-3 flex flex-col items-center gap-2"
            >
              <div className="flex items-center gap-1 text-xs font-semibold text-app-text leading-none">
                {idx.live && (
                  <span className="relative flex h-1 w-1 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-positive opacity-75" />
                    <span className="relative inline-flex h-1 w-1 rounded-full bg-app-positive" />
                  </span>
                )}
                <span className="truncate">{idx.label}</span>
              </div>
              {/* Full width of the card, so the trend line is inset the same
                  amount on both sides as the figures under it. */}
              <div className="w-full">
                <Sparkline
                  data={idx.sparkline}
                  positive={(idx.changePct ?? 0) >= 0}
                  width={92}
                  height={26}
                  fill
                />
              </div>
              <div className="flex items-baseline justify-between gap-1 w-full text-[11px] leading-none">
                <span className="text-app-muted">
                  <Num value={idx.value} digits={2} />
                </span>
                <span>
                  <Pct value={idx.changePct} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Section
        title="Миний хөрөнгө"
        action={{ href: "/portfolio", label: "Бүгдийг харах" }}
      >
        {portfolio.holdings.length === 0 ? (
          <Empty>Одоогоор хувьцаа худалдаж аваагүй байна.</Empty>
        ) : (
          <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
            {portfolio.holdings.slice(0, 4).map((h) => (
              <Link
                key={h.symbol}
                href={`/stock/${h.symbol}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-app-elevated"
              >
                <StockAvatar symbol={h.symbol} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-app-text text-sm">{h.symbol}</div>
                  <div className="text-xs text-app-muted">{h.quantity} ширхэг</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm text-app-text">
                    <Num value={h.marketValue} digits={2} suffix="₮" />
                  </div>
                  <div className="text-xs">
                    <Pct value={h.gainLossPct} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {watchlist.length > 0 && (
        <Section title="Хяналтын жагсаалт">
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-2 lg:overflow-visible">
            {watchlist.map((w) => (
              <Link
                key={w.symbol}
                href={`/stock/${w.symbol}`}
                className="shrink-0 w-60 lg:w-auto rounded-2xl border border-app-border bg-app-card px-4 py-3 active:bg-app-elevated"
              >
                <div className="flex items-center gap-3">
                  <StockAvatar symbol={w.symbol} size={40} />
                  <div className="min-w-0">
                    <div className="font-semibold text-app-text text-sm">{w.symbol}</div>
                    <div className="text-xs text-app-muted truncate">{w.name}</div>
                  </div>
                </div>
                <div className="flex items-baseline justify-between mt-2.5">
                  <span className="text-sm text-app-text">
                    <Num value={w.currentPrice ?? 0} digits={2} suffix="₮" />
                  </span>
                  <span className="text-sm">
                    <Pct value={w.changePct} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Өсөлттэй"
        note={moversSession}
        action={{ href: "/discover", label: "Зах зээл" }}
        className="lg:col-span-2"
      >
        <MoverList rows={gainers} />
      </Section>

      <Section title="Уналттай" note={moversSession} className="lg:col-span-2">
        <MoverList rows={losers} />
      </Section>

      {topPicks.length > 0 && (
      <Section
        title="Онооны шилдэг"
        action={{ href: "/discover", label: "Бүгд" }}
        className="lg:col-span-2"
      >
        <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-border overflow-hidden">
          {topPicks.map((r) => (
            <Link
              key={r.symbol}
              href={`/stock/${r.symbol}`}
              className="flex items-center gap-3 px-4 py-3 active:bg-app-elevated"
            >
              <StockAvatar symbol={r.symbol} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-app-text text-sm">{r.symbol}</div>
                <div className="text-xs text-app-muted truncate">{r.name}</div>
              </div>
              <span className="text-xs tabular-nums text-app-muted shrink-0">{r.score}</span>
              <SignalBadge signal={r.signal} />
            </Link>
          ))}
        </div>
      </Section>
      )}
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  action,
  className = "",
  children,
}: {
  title: string;
  /** Which session the figures belong to, when that isn't obvious. */
  note?: string | null;
  action?: { href: string; label: string };
  /** Placement in the wide-screen grid. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-app-text text-sm">
          {title}
          {note && <span className="text-app-muted font-normal ml-1.5">· {note}</span>}
        </h2>
        {action && (
          <Link href={action.href} className="text-xs text-brand font-medium">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-app-border p-5 text-center text-sm text-app-muted">
      {children}
    </div>
  );
}

function MoverList({ rows }: { rows: DashboardRow[] }) {
  if (rows.length === 0) {
    return <Empty>Арилжааны мэдээлэл алга.</Empty>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-6 lg:overflow-visible">
      {rows.map((r) => (
        <Link
          key={r.symbol}
          href={`/stock/${r.symbol}`}
          className="shrink-0 w-44 lg:w-auto rounded-2xl border border-app-border bg-app-card p-3"
        >
          <div className="flex items-center gap-1.5">
            <StockAvatar symbol={r.symbol} size={18} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-app-text truncate leading-tight">
                {r.symbol}
              </div>
              <div className="text-[10px] text-app-muted truncate leading-tight">
                {r.name}
              </div>
            </div>
          </div>
          <div className="my-1.5">
            <Sparkline
              data={r.sparkline}
              positive={(r.changePct ?? 0) >= 0}
              width={104}
              height={28}
              fill
            />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-app-text">
              <Num value={r.lastPrice ?? 0} digits={2} suffix="₮" />
            </span>
            <span className="text-xs">
              <Pct value={r.changePct} />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
