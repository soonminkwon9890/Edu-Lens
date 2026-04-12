"use client";

import { useState } from "react";
import { History, ChevronDown, ChevronUp } from "lucide-react";
import { CATEGORIES } from "./CategoryGrid";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResolvedSession {
  id:          string;
  category:    string;
  status:      string;
  updated_at:  string;
  error_type:  string | null;
  ai_hint:     string | null;  // snippet of what the AI taught
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ERROR_TYPE_LABELS: Record<string, string> = {
  syntax:     "구문 오류",
  tool_usage: "도구 사용법",
  config:     "설정 오류",
  unknown:    "기타 오류",
};

function formatRelativeTime(isoString: string): string {
  const diff  = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "방금 전";
  if (mins < 60)  return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return `${days}일 전`;
}

function getCategoryMeta(categoryId: string) {
  return (
    CATEGORIES.find((c) => c.id === categoryId) ?? {
      id:    categoryId,
      label: categoryId,
      icon:  "📁",
      badge: "bg-muted text-muted-foreground border-border",
    }
  );
}

// ── Category section ──────────────────────────────────────────────────────────

interface CategorySectionProps {
  categoryId:  string;
  sessions:    ResolvedSession[];
}

function CategorySection({ categoryId, sessions }: CategorySectionProps) {
  const [expanded, setExpanded] = useState(true);
  const cat = getCategoryMeta(categoryId);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* ── Category header (clickable to collapse) ── */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3
                   hover:bg-accent/30 transition-colors text-left"
      >
        <span className="text-xl select-none shrink-0" role="img" aria-label={cat.label}>
          {cat.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{cat.label}</p>
          <p className="text-xs text-muted-foreground">{sessions.length}개 학습 기록</p>
        </div>
        {expanded
          ? <ChevronUp   className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {/* ── Session list ── */}
      {expanded && (
        <ul className="divide-y divide-border">
          {sessions.map((session) => {
            const errorLabel = session.error_type
              ? (ERROR_TYPE_LABELS[session.error_type] ?? session.error_type)
              : null;

            return (
              <li
                key={session.id}
                className="px-4 py-3 hover:bg-accent/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: error badge + AI hint */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {errorLabel && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5
                                         text-[10px] font-semibold border
                                         bg-amber-500/10 text-amber-400 border-amber-500/20">
                          {errorLabel}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
                                       text-[10px] font-semibold
                                       bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        ✓ 해결됨
                      </span>
                    </div>

                    {/* AI hint snippet */}
                    {session.ai_hint ? (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                        {session.ai_hint}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/50 italic">
                        (기록된 AI 힌트 없음)
                      </p>
                    )}
                  </div>

                  {/* Right: timestamp */}
                  <span className="text-[10px] text-muted-foreground/50 shrink-0 mt-0.5 whitespace-nowrap">
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface RecentActivityProps {
  recentSessions: ResolvedSession[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RecentActivity({
  recentSessions,
}: RecentActivityProps): JSX.Element {
  // Group sessions by category, preserving order of first appearance.
  const grouped = recentSessions.reduce<Map<string, ResolvedSession[]>>(
    (acc, s) => {
      const list = acc.get(s.category) ?? [];
      list.push(s);
      acc.set(s.category, list);
      return acc;
    },
    new Map(),
  );

  return (
    <div className="space-y-4">
      {/* ── Section header ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-lens-400" />
        <h2 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
          학습 기록
        </h2>
        {recentSessions.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground/50">
            총 {recentSessions.length}개 세션
          </span>
        )}
      </div>

      {/* ── Empty state ───────────────────────────────────────────────── */}
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
        /* Scrollable container — categories collapsed/expanded individually */
        <div className={cn(
          "space-y-3",
          recentSessions.length > 10 && "max-h-[640px] overflow-y-auto pr-1",
        )}>
          {Array.from(grouped.entries()).map(([categoryId, sessions]) => (
            <CategorySection
              key={categoryId}
              categoryId={categoryId}
              sessions={sessions}
            />
          ))}
        </div>
      )}
    </div>
  );
}
