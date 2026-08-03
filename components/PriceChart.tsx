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
          <CartesianGrid strokeDasharray="2 4" stroke="#ecf0f7" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#8a8fa3" }}
            minTickGap={40}
            axisLine={{ stroke: "#ecf0f7" }}
            tickLine={{ stroke: "#ecf0f7" }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#8a8fa3" }}
            domain={["auto", "auto"]}
            width={60}
            axisLine={{ stroke: "#ecf0f7" }}
            tickLine={{ stroke: "#ecf0f7" }}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #ecf0f7",
              borderRadius: 12,
              fontSize: 11,
            }}
            labelStyle={{ color: "#12142b", fontWeight: 600 }}
            itemStyle={{ color: "#4c6fff" }}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#12142b"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="Хаалтын ханш"
          />
          <Line
            type="monotone"
            dataKey="sma20"
            stroke="#4c6fff"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
            name="SMA20"
          />
          <Line
            type="monotone"
            dataKey="sma50"
            stroke="#17c674"
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
