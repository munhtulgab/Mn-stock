"use client";

import { useMemo, useState } from "react";
import { ulaanbaatarDaysAgo } from "@/lib/day";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export interface ChartPoint {
  date: string;
  close: number;
  sma20?: number | null;
  sma50?: number | null;
}

/** Null spans the whole stored history. */
const RANGES: { label: string; days: number | null }[] = [
  { label: "Бүх цаг үе", days: null },
  { label: "1 жил", days: 365 },
  { label: "6 сар", days: 182 },
  { label: "1 сар", days: 30 },
];

/**
 * Above this the line is drawn from more points than the chart has pixels,
 * so thinning it costs nothing visible and keeps a decade of daily closes
 * from stalling the render.
 */
const MAX_PLOTTED = 600;

/*
 * Taken from the theme rather than named here, exactly as the pro chart
 * takes them.
 *
 * SVG attributes read custom properties like any other, so the drawing
 * follows whichever palette is in force. Written out as hex, this chart was
 * the dark theme's: a white close line, a near-black grid and a near-black
 * tooltip. On a white card the line was invisible — the axes, the grid and
 * the scale all drew, so the card looked like a chart whose price had gone
 * missing. What was left showing was the green SMA20, which is why a fund
 * with a month of history appeared to have three days of it.
 */
const GRID = "var(--app-divider)";
const AXIS = "var(--app-muted)";
const INK = "var(--app-text)";
const SMA20 = "var(--app-positive)";
const SMA50 = "var(--app-warn)";

/**
 * Width of the price scale, and of the matching margin on the other side.
 * Wide enough for a short tick label — "100мя" — and no wider, since every
 * pixel of it is spent twice.
 */
const Y_GUTTER = 40;

function thin(points: ChartPoint[]): ChartPoint[] {
  if (points.length <= MAX_PLOTTED) return points;
  const step = Math.ceil(points.length / MAX_PLOTTED);
  const kept = points.filter((_, i) => i % step === 0);
  // Never drop the most recent point: it is the one the header quotes.
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

/**
 * Y ticks in short form. A close of 100,000₮ spelled out needs a 60px gutter
 * on the left while the right edge sits against the card, which leaves the
 * drawing looking shoved sideways; "100мя" needs less than half of that.
 */
function shortNumber(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude >= 1_000_000) return `${round(value / 1_000_000)}сая`;
  // Four figures fit the gutter as they are. Shortening them turned a scale
  // running 1,114 to 1,471 into the same "1.1мя" at every tick.
  if (magnitude >= 10_000) return `${round(value / 1_000)}мя`;
  return round(value);
}

function round(value: number): string {
  return value.toFixed(Math.abs(value) < 10 && value % 1 !== 0 ? 1 : 0);
}

export default function PriceChart({
  data,
  title,
}: {
  data: ChartPoint[];
  /** Rendered on the same line as the range chips. */
  title: string;
}) {
  const [rangeIndex, setRangeIndex] = useState(0);
  const range = RANGES[rangeIndex];

  const plotted = useMemo(() => {
    if (range.days === null) return thin(data);
    const from = ulaanbaatarDaysAgo(range.days);
    const windowed = data.filter((p) => p.date >= from);
    // A thinly traded name can have no prints inside a short window.
    return thin(windowed.length >= 2 ? windowed : data.slice(-30));
  }, [data, range]);

  return (
    <div>
      {/* Title and ranges share one line, each flush with a side of the card,
          so the row is inset exactly as much as the chart below it. */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold text-app-text truncate">{title}</h2>
        <div className="flex items-center gap-1 shrink-0">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIndex(i)}
              className={`rounded-full px-1.5 py-1 text-[10px] font-medium transition-colors ${
                i === rangeIndex
                  ? "bg-brand text-black"
                  : "bg-app-bg text-app-muted border border-app-border"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plotted} margin={{ top: 8, right: Y_GUTTER, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: AXIS }}
              minTickGap={40}
              axisLine={{ stroke: GRID }}
              tickLine={{ stroke: GRID }}
            />
            {/* The price scale's gutter is matched by an equal margin on the
                right, so the drawing sits square in its card rather than
                shoved against one edge. Keeping the gutter narrow is what
                makes that affordable — hence the short tick labels. */}
            <YAxis
              tick={{ fontSize: 10, fill: AXIS }}
              domain={["auto", "auto"]}
              width={Y_GUTTER}
              tickMargin={4}
              tickFormatter={shortNumber}
              axisLine={{ stroke: GRID }}
              tickLine={{ stroke: GRID }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--app-card)",
                border: `1px solid ${GRID}`,
                borderRadius: 12,
                fontSize: 11,
              }}
              labelStyle={{ color: INK, fontWeight: 600 }}
              /* No item colour of its own: recharts takes each row's from
                 the line it belongs to, and this used to paint all three
                 green — the close, the SMA20 and the SMA50 alike. */
              /* Moving averages carry the full float they were divided into;
                 a tooltip reading 336.03049999999996 is noise, not precision. */
              formatter={(value) =>
                typeof value === "number" ? value.toFixed(2) : String(value)
              }
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke={INK}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="Хаалтын ханш"
            />
            <Line
              type="monotone"
              dataKey="sma20"
              stroke={SMA20}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
              name="SMA20"
            />
            <Line
              type="monotone"
              dataKey="sma50"
              stroke={SMA50}
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
              name="SMA50"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
