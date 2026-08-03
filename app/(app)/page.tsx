import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { getDashboardRows, type DashboardRow } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolioSummary, getWatchlist } from "@/lib/portfolio";
import { getUnreadCount } from "@/lib/notifications";
import StockAvatar from "@/components/StockAvatar";
import SignalBadge from "@/components/SignalBadge";
import Num, { Pct } from "@/components/Num";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  const [rows, portfolio, watchlist, unread] = await Promise.all([
    getDashboardRows(db),
    getPortfolioSummary(db, user!._id!),
    getWatchlist(db, user!._id!),
    getUnreadCount(db, user!),
  ]);

  const displayName = user?.fullName || user?.username || "";

  const traded = rows.filter((r) => r.changePct !== null);
  const gainers = traded
    .filter((r) => r.changePct! > 0)
    .sort((a, b) => b.changePct! - a.changePct!)
    .slice(0, 6);
  const losers = traded
    .filter((r) => r.changePct! < 0)
    .sort((a, b) => a.changePct! - b.changePct!)
    .slice(0, 6);
  // Untraded listings score 0 across the board; ranking them as "top picks"
  // would just surface whatever sorts first alphabetically.
  const topPicks = rows
    .filter((r) => r.lastPrice !== null && r.score !== 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-app-muted text-sm">Сайн байна уу,</p>
          <h1 className="text-xl font-bold text-app-text">{displayName} 👋</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/discover"
            aria-label="Хайх"
            className="w-10 h-10 rounded-full bg-app-card border border-app-border flex items-center justify-center text-app-muted active:scale-95 transition-transform"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Link>
          <Link
            href="/notifications"
            aria-label={`Мэдэгдэл${unread > 0 ? ` (${unread} шинэ)` : ""}`}
            className="relative w-10 h-10 rounded-full bg-app-card border border-app-border flex items-center justify-center text-app-muted active:scale-95 transition-transform"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M13.7 19a2 2 0 0 1-3.4 0"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-brand text-black text-[10px] font-bold flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="rounded-3xl bg-linear-to-br from-brand to-brand-dark p-5 text-black">
        <div className="text-xs font-medium opacity-70 mb-1">Багцын үнэ цэнэ</div>
        <div className="text-3xl">
          <Num value={portfolio.totalValue} digits={2} suffix="₮" />
        </div>
        <div className="flex items-center gap-2 mt-3 text-sm">
          <span className="rounded-full bg-black/15 px-2.5 py-1 text-xs">
            <Num value={portfolio.todayGain} digits={2} suffix="₮" showSign />
          </span>
          <span className="opacity-70 text-xs">өнөөдөр</span>
        </div>
      </div>

      {gainers.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {gainers.slice(0, 3).map((r) => (
            <Link
              key={r.symbol}
              href={`/stock/${r.symbol}`}
              className="rounded-2xl bg-app-card border border-app-border p-3"
            >
              <div className="text-xs font-semibold text-app-text truncate">{r.symbol}</div>
              <div className="text-[11px] text-app-muted truncate">
                <Num value={r.lastPrice ?? 0} digits={2} />
              </div>
              <div className="text-[11px] mt-0.5">
                <Pct value={r.changePct} />
              </div>
            </Link>
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
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
            {watchlist.map((w) => (
              <Link
                key={w.symbol}
                href={`/stock/${w.symbol}`}
                className="shrink-0 w-60 rounded-2xl border border-app-border bg-app-card px-4 py-3 active:bg-app-elevated"
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

      <Section title="Өсөлттэй" action={{ href: "/discover", label: "Зах зээл" }}>
        <MoverList rows={gainers} />
      </Section>

      <Section title="Уналттай">
        <MoverList rows={losers} />
      </Section>

      {topPicks.length > 0 && (
      <Section title="Онооны шилдэг" action={{ href: "/discover", label: "Бүгд" }}>
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
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-app-text text-sm">{title}</h2>
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
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4">
      {rows.map((r) => (
        <Link
          key={r.symbol}
          href={`/stock/${r.symbol}`}
          className="shrink-0 w-32 rounded-2xl border border-app-border bg-app-card p-3"
        >
          <div className="text-sm font-semibold text-app-text truncate">{r.symbol}</div>
          <div className="text-xs text-app-muted">
            <Num value={r.lastPrice ?? 0} digits={2} suffix="₮" />
          </div>
          <div className="text-xs mt-1">
            <Pct value={r.changePct} />
          </div>
        </Link>
      ))}
    </div>
  );
}
