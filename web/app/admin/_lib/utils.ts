import type { PracticeLog, DayCount, TypeSlice } from "./types";

// ── Derive chart data ─────────────────────────────────────────────────────────

/** Interaction count per day for the last 7 days (all log types). */
export function buildLineData(logs: PracticeLog[]): DayCount[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key     = d.toISOString().slice(0, 10);
    const label   = d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
    const count   = logs.filter((l) => l.created_at.startsWith(key)).length;
    return { date: label, count };
  });
}

/** Distribution of interaction types across all logs. */
export function buildPieData(logs: PracticeLog[]): TypeSlice[] {
  const counts: Record<string, number> = {};
  for (const log of logs) {
    const key = log.error_type ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}
