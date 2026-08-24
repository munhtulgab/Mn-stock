import Link from "next/link";
import { after } from "next/server";
import { getDb } from "@/lib/mongodb";
import {
  applyLiveQuotes,
  getDashboardRows,
  refreshDashboardSnapshotIfIdle,
  tradedSession,
  tradedThisMonth,
  type DashboardRow,
} from "@/lib/data";
import type { ExchangeMover } from "@/lib/mse/movers";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioSummary, getWatchlist } from "@/lib/portfolio";
import { getMarketIndices } from "@/lib/indices";
import { fetchMarketOpen } from "@/lib/marketinfo/quotes";
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

/** How many of them there are, and the reason the box is the height it is. */
const TOP_PICKS = 5;

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
  const [snapshot, portfolio, watchlist, indices, marketOpen] = await Promise.all([
    getDashboardRows(db),
    getPortfolioSummary(db, user!._id!),
    getWatchlist(db, user!._id!),
    getMarketIndices(db),
    // Alongside the rest rather than after it: it is one short request behind
    // its own cache, and the page should not wait a second time for it.
    fetchMarketOpen().catch(() => null),
  ]);
  const { rows, session, board } = await applyLiveQuotes(snapshot.rows, {
    extraCaCerts: settings.extraCaCerts,
  });

  // Both after the page has been sent. Signals turn during a session, not at
  // the hour the nightly cron happens to run, and news is published all day;
  // waiting for either would have meant hearing about it a day late, or only
  // if somebody happened to open the news tab. Each is gated — the signal
  // check to once a quarter of an hour, the news to its own half-hour cache
  // — so a busy morning does not run them over and over.
  after(async () => {
    // First, because everything below reads the rows it produces — and
    // because a reader who arrived on a stale snapshot is the reason it is
    // being rebuilt at all. It used to be rebuilt in front of them: four
    // hundred companies' worth of indicators before the page painted.
    if (snapshot.stale) await refreshDashboardSnapshotIfIdle(db);
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
  // would just surface whatever sorts first alphabetically. A listing that has
  // not traded this month is excluded for the same reason its indicators are
  // meaningless — and because a pick nobody can act on is not one.
  const topPicks = tradedThisMonth(rows, session)
    .filter(
      // A company with no verdict cannot be a pick: there is nothing to rank
      // it by and nothing to badge it with.
      (r): r is typeof r & { score: number; signal: NonNullable<typeof r.signal> } =>
        r.lastPrice !== null && r.score !== null && r.score !== 0 && r.signal !== null,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_PICKS);

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
              {/* The pulse means the level is moving, so it is shown only
                  while the exchange says it is in session.

                  `live` on its own does not mean that. It says the running
                  level was fetched rather than read out of the stored series,
                  and the exchange's front page answers with the last close
                  all evening and all weekend — so the dot pulsed around the
                  clock over a figure that had not changed since Friday. The
                  exchange's own status settles it; guessing from the clock
                  would be wrong on a holiday or a half-day.

                  Shown only on a plain `true`. Unknown — the status endpoint
                  unreachable — is not a session, and a claim the app cannot
                  back is worse than a missing dot.

                  8px rather than 4. At four it was a speck beside a label
                  half its own weight, which is not enough to read as the one
                  thing on the card that is moving. */}
              <div className="flex items-center gap-1.5 text-xs font-semibold text-app-text leading-none">
                {idx.live && marketOpen === true && (
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-positive opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-app-positive" />
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
        fill
      >
        {portfolio.holdings.length === 0 ? (
          <Empty>Одоогоор хувьцаа худалдаж аваагүй байна.</Empty>
        ) : (
          /* Every holding, not the first four — five rows of box and the rest
             behind them, on a phone as much as on a laptop.

             Five and no part of a sixth. Measured: a row is 65px and the
             fifth ends 326px below the box's top edge, so 327 with the bottom
             border is where the box closes — exactly five, cleanly. It was
             344 before, which left the sixth cut across its middle.

             The cap used to be `lg:` only, so a phone with eleven holdings
             gave eleven rows and a card half a screen tall. The rows are the
             same 65px at every width — same padding, same type — so one
             figure serves both and the phone scrolls inside the card the way
             the wide layout already did.

             No `overflow-hidden`: `.pane-scroll` sets overflow-y and the two
             would fight over one property — a scroll container clips to its
             own border radius anyway. */
          <div className="pane-scroll overflow-x-hidden rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider max-h-[20.4375rem] lg:flex-1 lg:min-h-0">
            {portfolio.holdings.map((h) => (
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
        <Section title="Хяналтын жагсаалт" fill>
          {/* Six at a time on the wide layout, and sideways for the rest.
              Cards fill downward in threes and then start a new column, so
              two columns of three are on screen and the next two arrive by
              scrolling right — the same gesture the phone layout already
              uses, rather than a second scroll direction to learn.

              The columns are 47% rather than half, so the pair does not fill
              the width exactly and the next column shows an edge. Without
              that there is nothing to say a seventh card exists: scrollbars
              are hidden throughout this app and some browsers draw them as an
              overlay that takes no layout space at all.

              The three rows are `1fr` each and nothing pins them to the top,
              so they divide whatever height the row settles at. That is what
              makes the two panels exactly the same height rather than
              approximately: five holding rows come to 327px and three cards
              of their own accord to 312, and the cards take the difference
              instead of leaving fifteen pixels of nothing under the last
              one. */}
          <div className="pane-scroll flex gap-3 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:grid lg:grid-flow-col lg:grid-rows-3 lg:auto-cols-[47%] lg:flex-1 lg:min-h-0">
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
        {/* Built like a row on the Зах зээл page, because it is one: the same
            company, ranked by the same score, and a reader who taps through
            should not have to re-read a different arrangement of the same
            figures. The verdict moves up beside the ticker where that page
            keeps it, and the price, the day's move and the trend line come
            with it — a pick with no price attached says nothing about whether
            it can be acted on.

            No trade date, unlike that page. It carries one because it lists
            the whole board, dormant listings included, where a price with no
            date on it reads as today's. Nothing dormant reaches this list —
            every row here traded in the current month or it would not have
            been ranked — so the date was a line of small print under five
            prices that are all recent, and it cost the trend line its place
            on a phone.

            So the trend line is on every row at every width now: 358px of
            phone carries an avatar, a name, a score, 56px of chart and a
            price, and every row is the same shape as the one above it. */}
        <div className="rounded-2xl border border-app-border bg-app-card divide-y divide-app-divider overflow-hidden">
          {topPicks.map((r) => (
            <Link
              key={r.symbol}
              href={`/stock/${r.symbol}`}
              className="flex items-center gap-3 px-4 py-3 active:bg-app-elevated"
            >
              <StockAvatar symbol={r.symbol} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-app-text text-sm">{r.symbol}</span>
                  <SignalBadge signal={r.signal} size="sm" />
                </div>
                <div className="text-xs text-app-muted truncate">{r.name}</div>
              </div>
              <span className="shrink-0 w-8 text-right text-sm tabular-nums text-app-text">
                {r.score}
              </span>
              <div className="shrink-0 w-14 lg:w-32">
                <Sparkline
                  data={r.sparkline}
                  positive={(r.changePct ?? 0) >= 0}
                  width={56}
                  height={24}
                  fill
                />
              </div>
              <div className="text-right shrink-0 lg:w-28">
                <div className="text-sm text-app-text">
                  {r.lastPrice === null ? (
                    <span className="text-app-muted">—</span>
                  ) : (
                    <Num value={r.lastPrice} digits={2} />
                  )}
                </div>
                <div className="text-xs">
                  <Pct value={r.changePct} suffix="" />
                </div>
              </div>
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
  fill = false,
  children,
}: {
  title: string;
  /** Which session the figures belong to, when that isn't obvious. */
  note?: string | null;
  action?: { href: string; label: string };
  /** Placement in the wide-screen grid. */
  className?: string;
  /**
   * Stretch to the height of whatever shares this grid row, and give the body
   * the leftover space.
   *
   * For the two side-by-side panels on the wide layout. The grid is
   * `items-start`, so each section is otherwise as tall as its own contents
   * and the two columns end at different places — which looks like one of
   * them failed to load. Stretching both makes the taller one set the height
   * and the shorter one fill it, rather than either being given a fixed
   * figure that is wrong whenever the lists are short.
   */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`${fill ? "lg:self-stretch lg:flex lg:flex-col" : ""} ${className}`}
    >
      <div className="flex items-center justify-between mb-3 lg:shrink-0">
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
      {/* min-h-0 or the body refuses to shrink below its content and the
          scroll never engages — a flex item's default minimum is its content. */}
      {fill ? (
        <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">{children}</div>
      ) : (
        children
      )}
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
