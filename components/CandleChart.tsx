"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { aggregate, type Candle, type Timeframe } from "@/lib/analysis/series";

/**
 * Open, high, low and close per bar, over the whole stored history.
 *
 * Recharts has no candlestick, so the bodies are drawn as a custom shape on
 * a bar whose value is the bar's own low-to-high range: within that bar the
 * top edge is the high and the bottom edge the low, which is all the scale
 * needed to place the open and close inside it. That keeps the axes, grid
 * and tooltip rather than hand-rolling a chart to get one missing mark.
 *
 * The interval follows the range instead of being a second control. Ten
 * years of daily candles is four thousand marks on a phone-width axis —
 * illegible, and slow to draw — so a long range is shown in weekly or
 * monthly bars, and the header says which.
 */

const RANGES: { label: string; days: number | null; timeframe: Timeframe }[] = [
  { label: "Бүх цаг үе", days: null, timeframe: "1M" },
  { label: "3 жил", days: 1095, timeframe: "1W" },
  { label: "1 жил", days: 365, timeframe: "1D" },
  { label: "3 сар", days: 92, timeframe: "1D" },
];

const INTERVAL_LABELS: Record<Timeframe, string> = {
  "1D": "өдрийн лаа",
  "1W": "долоо хоногийн лаа",
  "1M": "сарын лаа",
};

const UP = "#00d16c";
const DOWN = "#ff5a5f";
const Y_GUTTER = 44;

/** Beyond this even weekly bars are too many to tell apart; step up again. */
const MAX_BARS = 320;

interface Row extends Candle {
  /** Low-to-high, which is what the bar is scaled against. */
  range: [number, number];
}

/**
 * Y ticks short enough for a 44px gutter and still precise enough to read.
 *
 * Abbreviating everything over a thousand is what made a bank trading
 * between 1,114₮ and 1,471₮ show an axis reading "1мя" at every tick, top to
 * bottom. Four figures fit the gutter as they are, so they are left alone
 * and only five-figure prices are shortened.
 */
function shortNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(magnitude >= 10_000_000 ? 0 : 1)}сая`;
  }
  if (magnitude >= 10_000) return `${(value / 1_000).toFixed(0)}мя`;
  // A penny share priced under ten needs its decimal; nothing else does.
  return value.toFixed(magnitude < 10 && value % 1 !== 0 ? 1 : 0);
}

/**
 * One candle: a wick from low to high, and a body from open to close.
 *
 * A bar with no height at all — a session that opened, closed, peaked and
 * bottomed at one price, which on this exchange is most sessions for most
 * listings — would otherwise draw nothing, so the body is floored at a
 * single pixel and reads as the doji it is.
 */
function CandleShape(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: Row;
}) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (!payload) return null;

  const { open, close, high, low } = payload;
  const span = high - low;
  // Where a price sits inside the bar's own pixel box.
  const at = (price: number) =>
    span === 0 ? y + height / 2 : y + ((high - price) / span) * height;

  const rising = close >= open;
  const colour = rising ? UP : DOWN;
  const bodyTop = at(Math.max(open, close));
  const bodyHeight = Math.max(1, Math.abs(at(close) - at(open)));

  // Narrow bars need a whole pixel of gap or the candles merge into a block.
  const bodyWidth = Math.max(1, width * 0.7);
  const bodyX = x + (width - bodyWidth) / 2;
  const centre = x + width / 2;

  return (
    <g>
      <line
        x1={centre}
        x2={centre}
        y1={y}
        y2={y + height}
        stroke={colour}
        strokeWidth={1}
      />
      <rect
        x={bodyX}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={rising ? "transparent" : colour}
        stroke={colour}
        strokeWidth={1}
      />
    </g>
  );
}

export default function CandleChart({ candles }: { candles: Candle[] }) {
  const [rangeIndex, setRangeIndex] = useState(0);
  const range = RANGES[rangeIndex];

  const { rows, timeframe } = useMemo(() => {
    let windowed = candles;
    if (range.days !== null) {
      const from = new Date();
      from.setUTCDate(from.getUTCDate() - range.days);
      const key = from.toISOString().slice(0, 10);
      const inRange = candles.filter((c) => c.date >= key);
      // A thinly traded listing can have almost nothing inside a short
      // window; showing its last few dozen prints beats showing an empty box.
      windowed = inRange.length >= 5 ? inRange : candles.slice(-60);
    }

    // Step the interval up until the bars are far enough apart to read.
    let chosen: Timeframe = range.timeframe;
    const order: Timeframe[] = ["1D", "1W", "1M"];
    let bars = aggregate(windowed, chosen);
    for (
      let i = order.indexOf(chosen) + 1;
      i < order.length && bars.length > MAX_BARS;
      i++
    ) {
      chosen = order[i];
      bars = aggregate(windowed, chosen);
    }

    return {
      timeframe: chosen,
      rows: bars.map<Row>((c) => ({ ...c, range: [c.low, c.high] })),
    };
  }, [candles, range]);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-app-muted">Арилжааны түүх алга.</p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-sm font-semibold text-app-text truncate">
          Лааны график
        </h2>
        <div className="flex items-center gap-1 shrink-0">
          {RANGES.map((option, i) => (
            <button
              key={option.label}
              onClick={() => setRangeIndex(i)}
              className={`rounded-full px-1.5 py-1 text-[10px] font-medium transition-colors ${
                i === rangeIndex
                  ? "bg-brand text-black"
                  : "bg-app-bg text-app-muted border border-app-border"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Which bar the reader is looking at, since the range chose it. */}
      <p className="text-[10px] text-app-muted mb-2">
        {rows.length.toLocaleString("mn-MN")} {INTERVAL_LABELS[timeframe]}
        {" · "}
        {rows[0].date} – {rows[rows.length - 1].date}
      </p>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 8, right: Y_GUTTER, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="2 4" stroke="#252932" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#8b90a0" }}
              minTickGap={40}
              axisLine={{ stroke: "#252932" }}
              tickLine={{ stroke: "#252932" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#8b90a0" }}
              domain={["dataMin", "dataMax"]}
              width={Y_GUTTER}
              tickMargin={4}
              tickFormatter={shortNumber}
              axisLine={{ stroke: "#252932" }}
              tickLine={{ stroke: "#252932" }}
            />
            <Tooltip
              contentStyle={{
                background: "#171a21",
                border: "1px solid #252932",
                borderRadius: 12,
                fontSize: 11,
              }}
              labelStyle={{ color: "#ffffff", fontWeight: 600 }}
              // The range array would otherwise print as "low,high"; the four
              // prices are what a candle is, so they are named individually.
              formatter={(_value, _name, item) => {
                const row = item?.payload as Row | undefined;
                if (!row) return null;
                return [
                  `Н ${row.open.toLocaleString("mn-MN")} · Ө ${row.high.toLocaleString("mn-MN")} · Д ${row.low.toLocaleString("mn-MN")} · Х ${row.close.toLocaleString("mn-MN")}`,
                  "Ханш",
                ];
              }}
            />
            <Bar
              dataKey="range"
              shape={<CandleShape />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
