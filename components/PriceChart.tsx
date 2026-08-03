"use client";

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

export default function PriceChart({ data }: { data: ChartPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#6b6b6b", fontFamily: "monospace" }}
            minTickGap={40}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#6b6b6b", fontFamily: "monospace" }}
            domain={["auto", "auto"]}
            width={60}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={{ stroke: "#2a2a2a" }}
          />
          <Tooltip
            contentStyle={{
              background: "#000000",
              border: "1px solid #ff9f1c",
              fontSize: 11,
              fontFamily: "monospace",
            }}
            labelStyle={{ color: "#ff9f1c" }}
            itemStyle={{ color: "#d4d4d4" }}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#e5e5e5"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="Хаалтын ханш"
          />
          <Line
            type="monotone"
            dataKey="sma20"
            stroke="#ff9f1c"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
            name="SMA20"
          />
          <Line
            type="monotone"
            dataKey="sma50"
            stroke="#4dd8e6"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
            name="SMA50"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
