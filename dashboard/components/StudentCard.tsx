import type { StudentSummary } from "@/types/database";
import StatusBadge from "./StatusBadge";
import { timeAgo } from "@/lib/utils";

interface Props {
  summary: StudentSummary;
  onClick: () => void;
}

export default function StudentCard({ summary, onClick }: Props) {
  const { latest, history, isPinned } = summary;

  const borderCls = isPinned
    ? "border-red-500/70 animate-pulse-red"
    : "border-radar-border hover:border-radar-accent/60";

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left rounded-2xl border bg-radar-card p-4
        transition-all duration-200 hover:bg-[#1a1a35] hover:shadow-lg
        hover:shadow-radar-accent/10 cursor-pointer
        ${borderCls}
      `}
    >
      {/* ── Top row ── */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Avatar */}
          <div className="shrink-0 w-9 h-9 rounded-full bg-radar-accent/20 border border-radar-accent/30 flex items-center justify-center text-sm font-bold text-radar-accent select-none">
            {summary.student_id.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-radar-text truncate leading-tight">
              {summary.student_id}
            </p>
            <p className="text-xs text-radar-subtext truncate">{latest.tool_name}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={latest.status} />
          {history.length > 1 && (
            <span className="text-[10px] text-radar-subtext">
              이벤트 {history.length}회
            </span>
          )}
        </div>
      </div>

      {/* ── Hint preview ── */}
      <p className="text-sm text-radar-subtext line-clamp-2 mb-3 leading-relaxed">
        {latest.ai_hint}
      </p>

      {/* ── Screenshot thumbnail ── */}
      {latest.screenshot_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={latest.screenshot_url}
          alt="screenshot"
          className="w-full h-24 object-cover rounded-lg border border-radar-border mb-3 opacity-80"
        />
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between text-[11px] text-radar-muted">
        <span className="flex items-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isPinned ? "bg-red-500 animate-pulse" : "bg-amber-500"
            }`}
          />
          {timeAgo(latest.created_at)}
        </span>
        <span className="text-radar-accent/60">자세히 보기 →</span>
      </div>
    </button>
  );
}
