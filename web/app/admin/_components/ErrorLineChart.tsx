"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { DayCount } from "../_lib/types";

interface Props {
  data: DayCount[];
}

export function ErrorLineChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={170}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "hsl(240 5% 55%)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(240 5% 55%)" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background:   "hsl(240 10% 5.5%)",
            border:       "1px solid hsl(240 5% 14%)",
            borderRadius: "10px",
            fontSize:     11,
          }}
          labelStyle={{ color: "hsl(0 0% 70%)", marginBottom: 4 }}
          itemStyle={{ color: "#818cf8" }}
          cursor={{ stroke: "rgba(99,102,241,0.25)", strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="count"
          name="오류 수"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#818cf8", strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
