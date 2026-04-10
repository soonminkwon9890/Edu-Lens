import { timeAgo } from "@/lib/utils";
import type { StudentRecord } from "../_lib/types";
import { StatusBadge } from "./StatusBadge";

interface Props {
  record:  StudentRecord;
  isNew:   boolean;
  onClick: () => void;
}

export function StudentCard({ record, isNew, onClick }: Props) {
  const { session, latest_log, stall_count, isPinned } = record;

  // Border / pulse based on status
  const borderCls =
    session.status === "critical"
      ? "border-red-500/70 animate-pulse"
      : session.status === "stalled"
      ? "border-amber-500/50 hover:border-amber-500/80"
      : "border-border hover:border-edu-500/50";

  const ringCls = isNew
    ? "ring-2 ring-edu-500 ring-offset-2 ring-offset-background"
    : "";

  const dotCls =
    session.status === "critical"
      ? "bg-red-500 animate-pulse"
      : session.status === "stalled"
      ? "bg-amber-500"
      : "bg-green-500";

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-2xl border bg-card p-4
        transition-all duration-200 hover:bg-accent/20 cursor-pointer
        ${borderCls} ${ringCls}
      `}
    >
      {/* ── Top row ── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Avatar */}
          <div className="shrink-0 w-9 h-9 rounded-full bg-edu-500/15 border border-edu-500/25
                          flex items-center justify-center text-sm font-bold text-edu-400 select-none">
            {session.student_id.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate text-sm leading-tight">
              {session.student_id}
            </p>
            <p className="text-xs text-muted-foreground truncate">{session.category}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={session.status} />
          {stall_count > 0 && (
            <span className="text-[10px] text-muted-foreground">
              막힘 {stall_count}회
            </span>
          )}
        </div>
      </div>

      {/* ── Latest hint preview ── */}
      {latest_log?.ai_hint ? (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {latest_log.ai_hint}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground/40 mb-3 italic">힌트 없음</p>
      )}

      {/* ── Screenshot thumbnail ── */}
      {latest_log?.screenshot_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={latest_log.screenshot_url}
          alt="latest screenshot"
          className="w-full h-20 object-cover rounded-lg border border-border mb-3 opacity-70"
        />
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
          {latest_log
            ? timeAgo(latest_log.created_at)
            : timeAgo(session.started_at)}
        </span>
        <span className="text-edu-500/50 group-hover:text-edu-500">자세히 보기 →</span>
      </div>
    </button>
  );
}
