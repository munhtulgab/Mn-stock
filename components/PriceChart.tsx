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
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#a3a3a3" }}
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#a3a3a3" }}
            domain={["auto", "auto"]}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: "#171717",
              border: "1px solid #404040",
              fontSize: 12,
            }}
            labelStyle={{ color: "#e5e5e5" }}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#38bdf8"
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
            name="Хаалтын ханш"
          />
          <Line
            type="monotone"
            dataKey="sma20"
            stroke="#facc15"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
            name="SMA20"
          />
          <Line
            type="monotone"
            dataKey="sma50"
            stroke="#a78bfa"
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
