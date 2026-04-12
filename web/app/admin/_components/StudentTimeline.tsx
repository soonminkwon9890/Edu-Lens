"use client";

import { useEffect, useState } from "react";
import { fetchStudentLogs } from "@/app/actions";
import { formatTime } from "@/lib/utils";
import type { PracticeLogWithCategory } from "../_lib/types";

// ── Display maps ──────────────────────────────────────────────────────────────

interface BadgeInfo { label: string; cls: string }

const INTERACTION_BADGE: Record<string, BadgeInfo> = {
  "선제적 조언": { label: "선제적 조언", cls: "bg-blue-500/15 text-blue-400 border-blue-500/25"    },
  "질의응답":    { label: "질의응답",    cls: "bg-violet-500/15 text-violet-400 border-violet-500/25" },
  syntax:       { label: "구문 오류",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/25"   },
  tool_usage:   { label: "도구 사용법", cls: "bg-amber-500/15 text-amber-400 border-amber-500/25"   },
  config:       { label: "설정 오류",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/25"   },
  unknown:      { label: "알 수 없음",  cls: "bg-muted/20 text-muted-foreground border-border"       },
};

const INTERACTION_DOT: Record<string, string> = {
  "선제적 조언": "bg-blue-500",
  "질의응답":    "bg-violet-500",
  syntax:       "bg-amber-500",
  tool_usage:   "bg-amber-500",
  config:       "bg-amber-500",
};

const CATEGORY_LABEL: Record<string, string> = {
  "dev-setup":     "개발 환경 설정",
  uiux:            "UI/UX 디자인",
  product:         "제품 기획",
  "data-analysis": "데이터 분석",
  security:        "보안 & 네트워크",
  general:         "일반 학습",
};

const CATEGORY_CLS: Record<string, string> = {
  "dev-setup":     "bg-blue-500/15 text-blue-300 border-blue-500/25",
  uiux:            "bg-purple-500/15 text-purple-300 border-purple-500/25",
  product:         "bg-amber-500/15 text-amber-300 border-amber-500/25",
  "data-analysis": "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  security:        "bg-red-500/15 text-red-300 border-red-500/25",
  general:         "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
};

function badgeFor(errorType: string | null): BadgeInfo {
  if (!errorType) return { label: "정상 감지", cls: "bg-green-500/15 text-green-400 border-green-500/25" };
  return (
    INTERACTION_BADGE[errorType] ?? {
      label: errorType,
      cls:   "bg-muted/20 text-muted-foreground border-border",
    }
  );
}

function dotFor(errorType: string | null): string {
  if (!errorType) return "bg-green-500";
  return INTERACTION_DOT[errorType] ?? "bg-muted-foreground";
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
  nickname:  string;
  onBack:    () => void;
}

export function StudentTimeline({ studentId, nickname, onBack }: Props) {
  const [logs,    setLogs]    = useState<PracticeLogWithCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchStudentLogs(studentId)
      .then((data) => setLogs(data as unknown as PracticeLogWithCategory[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [studentId]);

  const initial = (nickname || studentId).slice(0, 1).toUpperCase();

  return (
    <div>
      {/* ── Section header ── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5
                     text-xs text-muted-foreground border border-border
                     hover:text-foreground hover:border-edu-500/50 hover:bg-edu-500/5
                     transition-colors"
        >
          ← 수강생 목록으로
        </button>

        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full bg-edu-500/15 border border-edu-500/25
                       flex items-center justify-center text-xs font-bold text-edu-400 select-none"
          >
            {initial}
          </div>
          <span className="font-semibold text-foreground text-sm">{nickname}</span>
          {!loading && (
            <span className="text-xs text-muted-foreground">
              · 총 {logs.length}개 상호작용
            </span>
          )}
        </div>
      </div>

      {/* ── Timeline body ── */}
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-2.5"
            >
              <div className="flex gap-2">
                <div className="h-5 w-24 bg-muted/40 rounded-full" />
                <div className="h-5 w-16 bg-muted/30 rounded-full" />
                <div className="h-5 w-14 bg-muted/20 rounded-full ml-auto" />
              </div>
              <div className="h-3 bg-muted/30 rounded w-4/5" />
              <div className="h-3 bg-muted/20 rounded w-3/5" />
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <span className="text-4xl opacity-25">📭</span>
          <p className="text-sm">아직 기록된 상호작용이 없습니다.</p>
        </div>
      ) : (
        <ol className="relative border-l border-border ml-3 space-y-4">
          {logs.map((log) => {
            const badge    = badgeFor(log.error_type);
            const dot      = dotFor(log.error_type);
            const catCls   = CATEGORY_CLS[log.category]   ?? "bg-muted/15 text-muted-foreground border-border";
            const catLabel = CATEGORY_LABEL[log.category] ?? log.category;

            return (
              <li key={log.id} className="ml-5">
                {/* Timeline dot */}
                <span
                  className={`absolute -left-[7px] w-3.5 h-3.5 rounded-full border-2 border-card ${dot}`}
                />

                <div className="bg-background border border-border rounded-xl p-4">
                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap mb-2.5">
                    {/* Category pill */}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5
                                  text-[10px] font-semibold border ${catCls}`}
                    >
                      {catLabel}
                    </span>
                    {/* Interaction type badge */}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5
                                  text-[10px] font-semibold border ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    {/* Timestamp */}
                    <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                      {formatTime(log.created_at)}
                    </span>
                  </div>

                  {/* AI response */}
                  {log.ai_hint ? (
                    <p className="text-sm text-foreground leading-relaxed">{log.ai_hint}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground/50 italic">AI 응답 없음</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
