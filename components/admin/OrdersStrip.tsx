"use client";

import { useState } from "react";
import Num from "@/components/Num";
import type { DailyOrders } from "@/lib/adminOverview";

/**
 * A quarter of trading, one column a trading day, measured in tögrög.
 *
 * Counts were the wrong unit. Thirty small orders and one large one are the
 * same column when you count them and nothing like each other when you look
 * at what changed hands, and it is the second question an administrator has
 * about a day. So the height is turnover.
 *
 * Ninety days rather than a fortnight, because that is the span in which this
 * shape says anything: an exchange is shut two days in seven and on every
 * public holiday, so a fortnight is mostly gaps and a quarter is a season.
 * Not a year either — at a column a day a year is a column two pixels wide,
 * which is a texture rather than a chart.
 *
 * Quiet days are left out rather than drawn as stubs. Keeping them preserved
 * the calendar's rhythm, which is worth something; it also spent a third of
 * the chart's width on days there is nothing to say about, and made every
 * traded day narrower for the privilege. Sixty columns that each mean
 * something beat ninety where thirty are furniture.
 *
 * The amounts are on the chart, not only under it. A shape scaled to its own
 * busiest day says which day was busiest and nothing at all about whether
 * that was a good quarter: the axis puts two figures against the height, and
 * pointing at a column names its day and its turnover exactly.
 *
 * Deliberately not a charting library: one series, two gridlines, no legend.
 * A library would ship more code than the page it sits on.
 */
const PLOT = 168;
/** Left of the plot, wide enough for "12.4 тэрбум₮" at 10px. */
const AXIS = "w-[58px]";

export default function OrdersStrip({ days }: { days: DailyOrders[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const traded = days.filter((d) => d.count > 0);

  if (traded.length === 0) {
    return (
      <p className="text-sm text-app-muted">
        Сүүлийн {days.length} хоногт арилжаа бүртгэгдээгүй байна.
      </p>
    );
  }

  const peak = Math.max(1, ...traded.map((d) => d.turnover));
  const turnover = traded.reduce((n, d) => n + d.turnover, 0);
  const orders = traded.reduce((n, d) => n + d.count, 0);
  const busiest = traded.reduce((a, b) => (b.turnover > a.turnover ? b : a));
  const shown = traded.find((d) => d.day === hover);

  return (
    <div>
      {/* Its own line above the plot, always the same height. A readout that
          appears on hover and takes its space with it makes the chart jump
          under the pointer that is reading it. */}
      <div className="mb-2 flex h-[18px] min-w-0 items-baseline gap-2 text-[12px]">
        {shown ? (
          <>
            <span className="shrink-0 font-semibold text-app-text tabular-nums">
              <Num value={shown.turnover} digits={0} suffix="₮" />
            </span>
            <span className="truncate text-app-muted">
              {longDay(shown.day)} · {shown.count} захиалга
            </span>
          </>
        ) : (
          <span className="truncate text-app-muted">
            Өдрийн эргэлт — багана дээр очиж үзнэ
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className={`relative shrink-0 ${AXIS}`} style={{ height: PLOT }}>
          <Tick at={0} value={peak} />
          <Tick at={50} value={peak / 2} />
        </div>
        <div
          className="relative min-w-0 flex-1"
          style={{ height: PLOT }}
          onMouseLeave={() => setHover(null)}
        >
          <Rule at={0} />
          <Rule at={50} />
          <Rule at={100} />
          <div className="absolute inset-0 flex items-end gap-px">
            {traded.map((d) => (
              <div
                key={d.day}
                className="flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-[2px]"
                style={
                  d.day === hover ? { backgroundColor: "var(--app-elevated)" } : undefined
                }
                onMouseEnter={() => setHover(d.day)}
                onClick={() => setHover(d.day === hover ? null : d.day)}
                title={`${longDay(d.day)} · ${d.count} захиалга · ${Math.round(d.turnover).toLocaleString("mn-MN")}₮`}
              >
                <span
                  className="w-full rounded-[2px]"
                  style={{
                    // A floor of two pixels, so the smallest day is still a
                    // column rather than nothing.
                    height: `${Math.max(2, (d.turnover / peak) * 100)}%`,
                    background:
                      "linear-gradient(180deg, var(--admin-fill-from), var(--admin-fill-to))",
                    opacity: hover && d.day !== hover ? 0.45 : 1,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <span className={`shrink-0 ${AXIS}`} />
        <MonthRule days={traded} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-app-divider pt-4 sm:grid-cols-4">
        <Fact label="Нийт эргэлт">
          <Num value={turnover} digits={0} suffix="₮" />
        </Fact>
        <Fact label="Захиалга">{orders.toLocaleString("mn-MN")}</Fact>
        <Fact label="Арилжаатай өдөр">{traded.length.toLocaleString("mn-MN")}</Fact>
        <Fact label={`Хамгийн их · ${shortDay(busiest.day)}`}>
          <Num value={busiest.turnover} digits={0} suffix="₮" />
        </Fact>
      </div>
    </div>
  );
}

/** One figure against the height, so the shape has a size as well as a shape. */
function Tick({ at, value }: { at: number; value: number }) {
  return (
    <span
      data-tick
      className="absolute right-0 -translate-y-1/2 text-[10px] whitespace-nowrap text-app-muted tabular-nums"
      style={{ top: `${at}%` }}
    >
      {round(value)}
    </span>
  );
}

function Rule({ at }: { at: number }) {
  return (
    <span
      aria-hidden
      className="absolute right-0 left-0 border-t border-app-divider"
      style={{ top: `${at}%` }}
    />
  );
}

/**
 * A label where a month begins, and nowhere else. Sixty dates do not fit
 * under sixty columns; the three or four that mark the months do, and they
 * are what the eye is looking for.
 *
 * The first drawn day of the month, not the first of the month: with the
 * quiet days gone the 1st is often not on the chart at all, and a rule that
 * waited for it would skip whole months.
 *
 * Positioned along the row rather than inside its own column, because the
 * column is five pixels wide on a phone and the word is seventy. Each label
 * starts where its month does and is allowed the width of that month and no
 * more: anchored to its own cell it pushed the panel wide, and allowed to run
 * to the end of the row it printed the opening month straight through the one
 * after it at 390px. Now a month too narrow for its name truncates, which is
 * the one behaviour that neither lies about where the month starts nor
 * collides with its neighbour.
 */
function MonthRule({ days }: { days: DailyOrders[] }) {
  const starts = days
    .map((d, i) => ({ month: d.day.slice(0, 7), at: (i / days.length) * 100, day: d.day }))
    .filter((m, i, all) => i === 0 || m.month !== all[i - 1].month);

  return (
    <div className="relative mt-2 h-4 min-w-0 flex-1 text-[10px] text-app-muted">
      {starts.map((m, i) => {
        const until = starts[i + 1]?.at ?? 100;
        return (
          <span
            key={m.month}
            className="absolute top-0 truncate"
            title={`${monthName(m.day)} сар`}
            style={{ left: `${m.at}%`, maxWidth: `calc(${until - m.at}% - 6px)` }}
          >
            {monthName(m.day)} сар
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

const MONTHS = [
  "Нэгдүгээр",
  "Хоёрдугаар",
  "Гуравдугаар",
  "Дөрөвдүгээр",
  "Тавдугаар",
  "Зургаадугаар",
  "Долдугаар",
  "Наймдугаар",
  "Есдүгээр",
  "Аравдугаар",
  "Арван нэгдүгээр",
  "Арван хоёрдугаар",
];

function monthName(day: string): string {
  return MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
}

/** "Есдүгээр сарын 5", as a month is said rather than written. */
function longDay(day: string): string {
  return `${monthName(day)} сарын ${Number(day.slice(8))}`;
}

/** Compact, for a label that has to fit beside three others. */
function shortDay(day: string): string {
  return day.slice(5).replace("-", ".");
}

/**
 * An axis figure, short enough to sit in a gutter: сая at a million, тэрбум
 * at a thousand million. Written out rather than as "3.3M", because the
 * page it is on is in Mongolian and M is not a Mongolian abbreviation.
 */
function round(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)} тэрбум₮`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} сая₮`;
  if (value >= 1e3) return `${Math.round(value / 1e3)} мянга₮`;
  return `${Math.round(value)}₮`;
}
