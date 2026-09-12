import type { DailyOrders } from "@/lib/adminOverview";

/**
 * A fortnight of orders, one column a day.
 *
 * The dashboard's four figures say where the installation stands; none of
 * them says whether it is picking up or going quiet, which is the question an
 * administrator actually opens a dashboard with. Fourteen columns answer it
 * without anybody reading a number.
 *
 * Deliberately not a charting library: this is one series of small integers
 * with no axes, no legend and no interaction beyond a title on hover, and a
 * library would ship more code than the page it sits on. The busiest day sets
 * the scale, so the shape is relative — the figures underneath are where the
 * quantities live.
 *
 * A day with no orders keeps its column as a two-pixel stub rather than
 * nothing at all, so a quiet Sunday reads as quiet and not as missing.
 */
export default function OrdersStrip({ days }: { days: DailyOrders[] }) {
  const peak = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((n, d) => n + d.count, 0);
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a), days[0]);

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 156 }}>
        {days.map((d) => {
          const share = d.count / peak;
          const top = d.count === peak && peak > 0;
          return (
            <div
              key={d.day}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${d.day} · ${d.count} захиалга`}
            >
              <span
                className="w-full rounded-md transition-colors"
                style={{
                  // A floor of 2px, so an empty day is a mark rather than a gap.
                  height: `${Math.max(2, share * 100)}%`,
                  background: top
                    ? "linear-gradient(180deg, var(--admin-fill-from), var(--admin-fill-to))"
                    : "var(--app-elevated)",
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex gap-1.5">
        {days.map((d, i) => (
          <span
            key={d.day}
            className="min-w-0 flex-1 text-center text-[10px] text-app-muted tabular-nums"
          >
            {/* Every other label: fourteen dates at this width overlap. */}
            {i % 2 === 0 ? d.day.slice(5).replace("-", ".") : " "}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-app-divider pt-4 text-[13px]">
        <span className="text-app-muted">
          14 хоногт{" "}
          <span className="font-semibold text-app-text tabular-nums">
            {total.toLocaleString("mn-MN")}
          </span>{" "}
          захиалга
        </span>
        <span className="text-app-muted">
          Хамгийн идэвхтэй{" "}
          <span className="font-semibold text-app-text tabular-nums">
            {busiest.day.slice(5).replace("-", ".")}
          </span>{" "}
          <span className="tabular-nums">({busiest.count})</span>
        </span>
      </div>
    </div>
  );
}
