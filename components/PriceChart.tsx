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
  );
}
