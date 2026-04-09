import type { PracticeLog, StudentSummary } from "@/types/database";

const STALL_MINUTES = 5;

/** Returns true when the log is critical OR was created more than 5 min ago */
export function isPinnedLog(log: PracticeLog): boolean {
  if (log.status === "critical") return true;
  const ageMs = Date.now() - new Date(log.created_at).getTime();
  return ageMs > STALL_MINUTES * 60 * 1000;
}

/**
 * Collapses a flat list of logs into one StudentSummary per student_id.
 * Sorts pinned students first, then by latest created_at desc.
 */
export function groupByStudent(logs: PracticeLog[]): StudentSummary[] {
  const map = new Map<string, PracticeLog[]>();

  for (const log of logs) {
    const arr = map.get(log.student_id) ?? [];
    arr.push(log);
    map.set(log.student_id, arr);
  }

  const summaries: StudentSummary[] = [];

  for (const [student_id, entries] of map) {
    // Sort history newest-first
    const sorted = [...entries].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const latest = sorted[0];
    summaries.push({
      student_id,
      latest,
      history: sorted,
      isPinned: isPinnedLog(latest),
    });
  }

  return summaries.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return (
      new Date(b.latest.created_at).getTime() -
      new Date(a.latest.created_at).getTime()
    );
  });
}

export function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
