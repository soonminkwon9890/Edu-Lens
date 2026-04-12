import { timeAgo } from "@/lib/utils";
import type { StudentProfile } from "../_lib/types";

interface Props {
  profile:          StudentProfile;
  interactionCount: number;
  lastActiveAt:     string | null;
  isNew:            boolean;
  onClick:          () => void;
}

export function StudentDirectoryCard({
  profile,
  interactionCount,
  lastActiveAt,
  isNew,
  onClick,
}: Props) {
  const initial = (profile.nickname || profile.id).slice(0, 1).toUpperCase();

  return (
    <button
      onClick={onClick}
      className={`
        group w-full text-left rounded-2xl border bg-card p-4
        transition-all duration-200 hover:bg-accent/20 hover:border-edu-500/50
        hover:-translate-y-0.5 hover:shadow-lg hover:shadow-edu-500/10
        active:scale-[0.99] active:translate-y-0
        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
        ${isNew
          ? "ring-2 ring-edu-500 ring-offset-2 ring-offset-background border-edu-500/50"
          : "border-border"
        }
      `}
    >
      {/* Avatar + name row */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className="shrink-0 w-10 h-10 rounded-full bg-edu-500/15 border border-edu-500/25
                     flex items-center justify-center text-sm font-bold text-edu-400 select-none"
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground text-sm leading-tight truncate">
            {profile.nickname || "이름 없음"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">수강생</p>
        </div>
        {/* Interaction count pill */}
        <span
          className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1
                     text-[10px] font-semibold bg-edu-500/10 text-edu-400 border border-edu-500/20"
        >
          {interactionCount}회
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {lastActiveAt
            ? `최근 활동: ${timeAgo(lastActiveAt)}`
            : "아직 활동 없음"}
        </span>
        <span className="text-edu-500/40 group-hover:text-edu-500 transition-colors">
          타임라인 보기 →
        </span>
      </div>
    </button>
  );
}
