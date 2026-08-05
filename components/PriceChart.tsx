"use client";

import { useMemo, useState } from "react";
import { CalendarIcon } from "./icons";
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

function thin(points: ChartPoint[]): ChartPoint[] {
  if (points.length <= MAX_PLOTTED) return points;
  const step = Math.ceil(points.length / MAX_PLOTTED);
  const kept = points.filter((_, i) => i % step === 0);
  // Never drop the most recent point: it is the one the header quotes.
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

export default function PriceChart({ data }: { data: ChartPoint[] }) {
  const [rangeIndex, setRangeIndex] = useState(0);
  const range = RANGES[rangeIndex];

  const plotted = useMemo(() => {
    if (range.days === null) return thin(data);
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - range.days);
    const from = cutoff.toISOString().slice(0, 10);
    const windowed = data.filter((p) => p.date >= from);
    // A thinly traded name can have no prints inside a short window.
    return thin(windowed.length >= 2 ? windowed : data.slice(-30));
  }, [data, range]);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        {/* One marker for the group: repeating it on all four chips would
            add four glyphs and no information. */}
        <span className="text-app-muted shrink-0 mr-0.5">
          <CalendarIcon size={14} />
        </span>
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIndex(i)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              i === rangeIndex
                ? "bg-brand text-black"
                : "bg-app-bg text-app-muted border border-app-border"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plotted} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
              domain={["auto", "auto"]}
              width={60}
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
              itemStyle={{ color: "#00d16c" }}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke="#ffffff"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              name="Хаалтын ханш"
            />
            <Line
              type="monotone"
              dataKey="sma20"
              stroke="#00d16c"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
              name="SMA20"
            />
            <Line
              type="monotone"
              dataKey="sma50"
              stroke="#ffb020"
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
