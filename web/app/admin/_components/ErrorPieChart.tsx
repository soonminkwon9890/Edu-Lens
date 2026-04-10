"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import type { TypeSlice } from "../_lib/types";

const PALETTE = ["#6366f1", "#f59e0b", "#ef4444", "#6b7280"] as const;

const TYPE_LABEL: Record<string, string> = {
  syntax:     "구문 오류",
  tool_usage: "도구 사용법",
  config:     "설정 오류",
  unknown:    "알 수 없음",
};

interface Props {
  data: TypeSlice[];
}

export function ErrorPieChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[170px] text-muted-foreground text-sm">
        데이터 없음
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={170}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={42}
          outerRadius={65}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} strokeWidth={0} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background:   "hsl(240 10% 5.5%)",
            border:       "1px solid hsl(240 5% 14%)",
            borderRadius: "10px",
            fontSize:     11,
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [
            `${value}건`,
            TYPE_LABEL[String(name)] ?? String(name),
          ]}
          itemStyle={{ color: "hsl(0 0% 80%)" }}
        />
        <Legend
          iconType="circle"
          iconSize={7}
          formatter={(v) => TYPE_LABEL[v] ?? v}
          wrapperStyle={{ fontSize: 10, color: "hsl(240 5% 55%)" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
