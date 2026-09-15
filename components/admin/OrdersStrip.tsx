"use client";

import { useState } from "react";
import Num from "@/components/Num";
import {
  CalendarMark,
  CoinMark,
  PeakMark,
  ReceiptMark,
} from "@/components/admin/lineIcons";
import type { DailyOrders } from "@/lib/adminOverview";

/**
 * A quarter of trading, one column a trading day, measured in orders.
 *
 * It measured tögrög until it was asked not to. The case for money was that
 * thirty small orders and one large one are the same column when you count
 * them; the case against is that on a page whose other figures are all counts
 * — the Захиалга tile, the digest's bars, the nav's tally — a chart in
 * tögrög is the one thing here that has to be converted before it can be
 * compared with anything beside it. The turnover has not gone: it is the
 * first figure under the chart, and pointing at any column still names what
 * that day came to.
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
 * The figures are on the chart, not only under it. A shape scaled to its own
 * busiest day says which day was busiest and nothing at all about how busy
 * that was: the axis puts two counts against the height, and pointing at a
 * column names its day, its orders and its turnover exactly.
 *
 * Each column is a filled part of a full-height track, the way the digest's
 * weekday bars are, rather than a bar standing on a rule. Sixty free-standing
 * bars of wildly different heights read as a ragged edge; the tracks give
 * every day the same frame, so what is compared is how full each one is — and
 * they are what the two axis figures are read against now that the gridlines
 * they used to be read against would be hidden behind them.
 *
 * Deliberately not a charting library: one series, two figures, no legend. A
 * library would ship more code than the page it sits on.
 */
const PLOT = 168;
/** Left of the plot, wide enough for a four-figure count at 10px. */
const AXIS = "w-[34px]";

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

  const peak = Math.max(1, ...traded.map((d) => d.count));
  const turnover = traded.reduce((n, d) => n + d.turnover, 0);
  const orders = traded.reduce((n, d) => n + d.count, 0);
  const busiest = traded.reduce((a, b) => (b.count > a.count ? b : a));
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
              {shown.count.toLocaleString("mn-MN")} захиалга
            </span>
            {/* The turnover stays on the readout even though the height is no
                longer it: it is the second question about a day, and this is
                the only place the two can be seen against each other. */}
            <span className="truncate text-app-muted">
              {longDay(shown.day)} · <Num value={shown.turnover} digits={0} suffix="₮" />
            </span>
          </>
        ) : (
          <span className="truncate text-app-muted">
            Өдрийн захиалга — багана дээр очиж үзнэ
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
          <div className="absolute inset-0 flex items-end gap-px">
            {traded.map((d) => (
              <div
                key={d.day}
                className="flex h-full min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-full"
                style={{
                  backgroundColor:
                    d.day === hover ? "var(--app-border)" : "var(--app-elevated)",
                }}
                onMouseEnter={() => setHover(d.day)}
                onClick={() => setHover(d.day === hover ? null : d.day)}
                title={`${longDay(d.day)} · ${d.count} захиалга · ${Math.round(d.turnover).toLocaleString("mn-MN")}₮`}
              >
                <span
                  className="w-full rounded-full"
                  style={{
                    // A floor of six percent, which at this plot height is
                    // about the width of a column: below it a pill is a
                    // squashed oval rather than a bar, and a day with one
                    // order still has to look different from a day with none.
                    // The exact figure is on the readout and the tooltip.
                    height: `${Math.max(6, (d.count / peak) * 100)}%`,
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
        <Fact label="Нийт эргэлт" icon={<CoinMark />}>
          <Num value={turnover} digits={0} suffix="₮" />
        </Fact>
        <Fact label="Захиалга" icon={<ReceiptMark />}>
          {orders.toLocaleString("mn-MN")}
        </Fact>
        <Fact label="Арилжаатай өдөр" icon={<CalendarMark />}>
          {traded.length.toLocaleString("mn-MN")}
        </Fact>
        {/* Counted the way the chart is, so this names the tallest column
            rather than some other day that happened to carry more money. */}
        <Fact label={`Хамгийн их · ${shortDay(busiest.day)}`} icon={<PeakMark />}>
          {busiest.count.toLocaleString("mn-MN")}
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
      {Math.round(value).toLocaleString("mn-MN")}
    </span>
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

function Fact({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      {/* The mark sits with the label rather than with the figure. Four of
          these read as one row of numbers; what a reader is looking for is
          which of the four, and that is the word, not the digits. */}
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-app-muted">
        {icon}
        <span className="truncate">{label}</span>
      </div>
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

