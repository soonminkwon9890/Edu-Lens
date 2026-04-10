import type { ActiveSession, PracticeLog, StudentRecord, DayCount, TypeSlice } from "./types";

// ── Build StudentRecord list ──────────────────────────────────────────────────

export function buildRecords(
  sessions: ActiveSession[],
  logs:     PracticeLog[],
): StudentRecord[] {
  const records: StudentRecord[] = sessions.map((session) => {
    const sessionLogs = logs
      .filter((l) => l.session_id === session.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const stall_count = sessionLogs.filter((l) => l.error_type !== null).length;
    const isPinned    = session.status === "critical" || stall_count >= 3;

    return {
      session,
      logs:       sessionLogs,
      latest_log: sessionLogs[0] ?? null,
      stall_count,
      isPinned,
    };
  });

  // Sort: critical → other pinned → stalled → active → resolved
  return records.sort((a, b) => {
    const rank = (r: StudentRecord): number => {
      if (r.session.status === "critical")  return 0;
      if (r.isPinned)                        return 1;
      if (r.session.status === "stalled")   return 2;
      if (r.session.status === "active")    return 3;
      return 4; // resolved
    };
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    // Secondary: most recent activity first
    const aTime = a.latest_log?.created_at ?? a.session.started_at;
    const bTime = b.latest_log?.created_at ?? b.session.started_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

// ── Derive chart data ─────────────────────────────────────────────────────────

/** Error count per day for the last 7 days. */
export function buildLineData(logs: PracticeLog[]): DayCount[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key     = d.toISOString().slice(0, 10);
    const label   = d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
    const count   = logs.filter(
      (l) => l.created_at.startsWith(key) && l.error_type !== null,
    ).length;
    return { date: label, count };
  });
}

/** Distribution of error_type across all logs. */
export function buildPieData(logs: PracticeLog[]): TypeSlice[] {
  const counts: Record<string, number> = {};
  for (const log of logs) {
    if (log.error_type) {
      counts[log.error_type] = (counts[log.error_type] ?? 0) + 1;
    }
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}
