import Link from "next/link";
import Num, { Pct } from "./Num";
import type { MarketReview, ReviewMover } from "@/lib/marketReview";

/**
 * A period's market in one card: what the indices did, how much changed
 * hands, and the names at either end of it.
 *
 * The exchange publishes a weekly review as an article and nothing monthly,
 * so these are worked out from the same closes the rest of the app shows —
 * which is why every figure here can be checked against the company's own
 * page rather than being a number from somewhere else.
 */
export default function MarketReviewCard({
  title,
  review,
}: {
  title: string;
  review: MarketReview;
}) {
  return (
    <section className="rounded-2xl border border-app-border bg-app-card p-4 h-full space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-app-text">{title}</h2>
        <span className="text-[11px] text-app-muted tabular-nums whitespace-nowrap">
          {/* A single session is one date, not a range from itself to itself. */}
          {review.from === review.to
            ? review.to
            : `${review.from} – ${review.to}`}
        </span>
      </div>

      {review.indices.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {review.indices.map((index) => (
            <div key={index.label} className="rounded-xl bg-app-bg px-2.5 py-2">
              <div className="text-[10px] text-app-muted truncate">{index.label}</div>
              <div className="text-sm tabular-nums text-app-text">
                <Num value={index.to} digits={2} />
              </div>
              <div className="text-xs">
                <Pct value={index.changePct} />
              </div>
            </div>
          ))}
        </div>
      )}

      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Fact label="Арилжааны өдөр" value={String(review.sessions)} />
        <Fact label="Арилжаалагдсан" value={String(review.traded)} />
        <Fact label="Нийт гүйлгээ, ₮" value={<Turnover value={review.turnover} />} />
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <Movers title="Хамгийн их өссөн" movers={review.gainers} />
        <Movers title="Хамгийн их буурсан" movers={review.losers} />
      </div>
    </section>
  );
}

/**
 * A week's turnover spelled out is 1,463,960,243, which does not fit a third
 * of a phone's width and gets clipped at the tile's edge. Rounded to billions
 * it fits, and nobody reads a market review for the last tugrik. The unit is
 * on the tile's label rather than here, where it would cost the room the
 * rounding just bought.
 */
function Turnover({ value }: { value: number }) {
  if (value >= 1_000_000_000) {
    return <Num value={value / 1_000_000_000} digits={2} suffix="тэрбум" />;
  }
  if (value >= 1_000_000) {
    return <Num value={value / 1_000_000} digits={1} suffix="сая" />;
  }
  return <Num value={value} digits={0} />;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-app-bg px-2.5 py-2">
      <dt className="text-[10px] text-app-muted">{label}</dt>
      <dd className="text-sm tabular-nums text-app-text">{value}</dd>
    </div>
  );
}

function Movers({ title, movers }: { title: string; movers: ReviewMover[] }) {
  if (movers.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-medium text-app-muted mb-1.5">{title}</div>
      <ul className="space-y-1">
        {movers.map((mover) => (
          <li key={mover.symbol}>
            <Link
              href={`/stock/${mover.symbol}`}
              className="flex items-baseline justify-between gap-2 text-xs active:opacity-70"
            >
              <span className="min-w-0">
                <span className="font-semibold text-app-text">{mover.symbol}</span>
                {mover.name && (
                  <span className="text-app-muted"> · {mover.name}</span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">
                <Pct value={mover.changePct} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
