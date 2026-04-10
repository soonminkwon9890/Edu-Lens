"use client";

import { History } from "lucide-react";
import { CATEGORIES } from "./CategoryGrid";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolvedSession {
  id:           string;
  category:     string;
  status:       string;
  updated_at:   string;
  error_type:   string | null;  // from latest practice_log
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ERROR_TYPE_LABELS: Record<string, string> = {
  syntax:     "구문 오류",
  tool_usage: "도구 사용법",
  config:     "설정 오류",
  unknown:    "기타 오류",
};

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins < 1)   return "방금 전";
  if (mins < 60)  return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return `${days}일 전`;
}

function getCategoryMeta(categoryId: string) {
  return CATEGORIES.find((c) => c.id === categoryId) ?? {
    label: categoryId,
    icon:  "📁",
    badge: "bg-muted text-muted-foreground border-border",
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RecentActivityProps {
  recentSessions: ResolvedSession[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecentActivity({
  recentSessions,
}: RecentActivityProps): JSX.Element {
  return (
    <div className="space-y-4">
      {/* ── Section header ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-lens-400" />
        <h2 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
          최근 학습 기록
        </h2>
        <span className="ml-auto text-xs text-muted-foreground/50">
          최근 5개
        </span>
      </div>

      {/* ── List ──────────────────────────────────────────────────────── */}
      {recentSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2
                         rounded-2xl border border-dashed border-border
                         py-10 text-center">
          <span className="text-3xl" role="img" aria-label="없음">📭</span>
          <p className="text-sm text-muted-foreground">아직 해결된 학습 기록이 없습니다.</p>
          <p className="text-xs text-muted-foreground/60">
            카테고리를 선택해 첫 학습을 시작해 보세요!
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {recentSessions.map((session) => {
            const cat   = getCategoryMeta(session.category);
            const label = session.error_type
              ? (ERROR_TYPE_LABELS[session.error_type] ?? session.error_type)
              : null;

            return (
              <li
                key={session.id}
                className={cn(
                  "flex items-center gap-4 rounded-xl border border-border",
                  "bg-card px-4 py-3 transition-colors hover:bg-accent/30",
                )}
              >
                {/* Icon */}
                <span className="text-2xl select-none shrink-0" role="img" aria-label={cat.label}>
                  {cat.icon}
                </span>

                {/* Category + error type */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {cat.label}
                  </p>
                  {label && (
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  )}
                </div>

                {/* Right side */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
                                   text-[10px] font-semibold
                                   bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    ✓ 해결됨
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {formatRelativeTime(session.updated_at)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
