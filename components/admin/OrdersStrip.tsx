import Num from "@/components/Num";
import type { DailyOrders } from "@/lib/adminOverview";

/**
 * A year of trading, one column a day, measured in tögrög.
 *
 * Counts were the wrong unit. Thirty small orders and one large one are the
 * same column when you count them and nothing like each other when you look
 * at what changed hands, and it is the second question an administrator has
 * about a day. So the height is turnover.
 *
 * A year rather than a fortnight, because that is the span in which this
 * shape says anything: an exchange is shut two days in seven and on every
 * public holiday, so a fortnight is mostly gaps and a year is a season. The
 * blanks are drawn as stubs rather than skipped — a strip that closes up its
 * empty days would space Monday next to Friday and quietly lie about rhythm.
 *
 * Deliberately not a charting library: one series, no axes, no legend, no
 * interaction past a title on hover. A library would ship more code than the
 * page it sits on. The busiest day sets the scale, so the shape is relative
 * and the figures underneath are where the quantities live.
 *
 * The narrow layout shows the last ninety days of the same array. At 390px a
 * year is a column a pixel wide, which is a smear rather than a chart.
 */
export default function OrdersStrip({ days }: { days: DailyOrders[] }) {
  const peak = Math.max(1, ...days.map((d) => d.turnover));
  const turnover = days.reduce((n, d) => n + d.turnover, 0);
  const orders = days.reduce((n, d) => n + d.count, 0);
  const traded = days.filter((d) => d.count > 0).length;
  const busiest = days.reduce((a, b) => (b.turnover > a.turnover ? b : a), days[0]);

  return (
    <div>
      <div className="hidden sm:block">
        <Columns days={days} peak={peak} />
        <MonthRule days={days} />
      </div>
      <div className="sm:hidden">
        <Columns days={days.slice(-90)} peak={peak} />
        <MonthRule days={days.slice(-90)} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-app-divider pt-4 sm:grid-cols-4">
        <Fact label="Нийт эргэлт">
          <Num value={turnover} digits={0} suffix="₮" />
        </Fact>
        <Fact label="Захиалга">{orders.toLocaleString("mn-MN")}</Fact>
        <Fact label="Арилжаатай өдөр">{traded.toLocaleString("mn-MN")}</Fact>
        <Fact label={`Хамгийн их · ${label(busiest.day)}`}>
          <Num value={busiest.turnover} digits={0} suffix="₮" />
        </Fact>
      </div>
    </div>
  );
}

function Columns({ days, peak }: { days: DailyOrders[]; peak: number }) {
  return (
    <div className="flex items-end gap-px" style={{ height: 168 }}>
      {days.map((d) => (
        <div
          key={d.day}
          className="flex h-full min-w-0 flex-1 flex-col justify-end"
          title={`${d.day} · ${d.count} захиалга · ${Math.round(d.turnover).toLocaleString("mn-MN")}₮`}
        >
          <span
            className="w-full rounded-[2px]"
            style={{
              // A floor of two pixels, so a shut market is a mark and not a
              // hole. Empty days keep the quiet fill; traded days take the
              // brand, deepening with the size of the day.
              height: `${Math.max(2, (d.turnover / peak) * 100)}%`,
              background:
                d.turnover > 0
                  ? "linear-gradient(180deg, var(--admin-fill-from), var(--admin-fill-to))"
                  : "var(--app-elevated)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * A label where a month begins, and nowhere else. Three hundred and
 * sixty-five dates do not fit under three hundred and sixty-five columns; the
 * twelve that mark the months do, and they are what the eye is looking for.
 */
function MonthRule({ days }: { days: DailyOrders[] }) {
  return (
    <div className="mt-2 flex gap-px">
      {days.map((d, i) => {
        const first = d.day.slice(8) === "01";
        return (
          <span
            key={d.day}
            className="relative min-w-0 flex-1 text-[10px] text-app-muted tabular-nums"
          >
            {first && i > 4 && (
              <span className="absolute top-0 left-0 whitespace-nowrap">{month(d.day)}</span>
            )}
            {" "}
          </span>
        );
      })}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-app-muted">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold tabular-nums text-app-text">
        {children}
      </div>
    </div>
  );
}

const MONTHS = ["1-р", "2-р", "3-р", "4-р", "5-р", "6-р", "7-р", "8-р", "9-р", "10-р", "11-р", "12-р"];

function month(day: string): string {
  return MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
}

function label(day: string): string {
  return day.slice(5).replace("-", ".");
}
