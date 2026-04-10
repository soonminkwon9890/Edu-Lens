"use client";

import { useEffect, useRef } from "react";
import { formatTime } from "@/lib/utils";
import type { StudentRecord } from "../_lib/types";
import { StatusBadge } from "./StatusBadge";

const ERROR_LABEL: Record<string, string> = {
  syntax:     "구문 오류",
  tool_usage: "도구 사용법",
  config:     "설정 오류",
  unknown:    "알 수 없음",
};

interface Props {
  record:  StudentRecord;
  onClose: () => void;
}

export function StudentModal({ record, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Escape key
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const { session, logs, latest_log, stall_count } = record;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4
                 bg-black/70 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto
                   bg-card border border-border rounded-3xl
                   shadow-2xl shadow-black/60 animate-fade-in"
      >
        {/* ── Sticky header ── */}
        <div
          className="sticky top-0 z-10 bg-card border-b border-border
                     rounded-t-3xl px-6 py-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar */}
            <div
              className="shrink-0 w-10 h-10 rounded-full bg-edu-500/15 border border-edu-500/25
                         flex items-center justify-center font-bold text-edu-400 text-sm select-none"
            >
              {session.student_id.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-foreground text-base leading-tight truncate">
                {session.student_id}
              </h2>
              <p className="text-xs text-muted-foreground truncate">{session.category}</p>
            </div>
            <StatusBadge status={session.status} className="ml-1 shrink-0" />
          </div>

          {/* Stats pill */}
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground shrink-0">
            <span>
              막힘{" "}
              <span className="font-semibold text-amber-400">{stall_count}회</span>
            </span>
            <span>|</span>
            <span>
              이벤트{" "}
              <span className="font-semibold text-foreground">{logs.length}건</span>
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="모달 닫기"
            className="shrink-0 w-8 h-8 rounded-full border border-border bg-background
                       text-muted-foreground hover:border-destructive/60 hover:text-destructive
                       flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-6 space-y-8">

          {/* Latest screenshot */}
          <section>
            <h3 className="text-[11px] font-semibold tracking-widest uppercase
                           text-muted-foreground mb-3">
              최근 스크린샷
            </h3>
            {latest_log?.screenshot_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={latest_log.screenshot_url}
                alt="latest student screenshot"
                className="w-full rounded-xl border border-border object-contain
                           max-h-72 bg-black/30"
              />
            ) : (
              <div
                className="w-full h-32 rounded-xl border border-border border-dashed
                           flex items-center justify-center text-muted-foreground text-sm"
              >
                스크린샷 없음
              </div>
            )}
          </section>

          {/* AI hint timeline */}
          <section>
            <h3 className="text-[11px] font-semibold tracking-widest uppercase
                           text-muted-foreground mb-4">
              AI 힌트 타임라인
              <span className="ml-2 text-edu-400 font-normal normal-case tracking-normal">
                ({logs.length}개 이벤트)
              </span>
            </h3>

            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground/60 italic py-4">
                아직 기록된 이벤트가 없습니다.
              </p>
            ) : (
              <ol className="relative border-l border-border ml-3 space-y-5">
                {logs.map((log, idx) => (
                  <li key={log.id} className="ml-5">
                    {/* Timeline dot */}
                    <span
                      className={`absolute -left-[7px] w-3.5 h-3.5 rounded-full
                                  border-2 border-card
                                  ${log.error_type === null
                                    ? "bg-green-500"
                                    : "bg-amber-500"
                                  }`}
                    />

                    <div className="bg-background border border-border rounded-xl p-3.5">
                      {/* Row: index, time, error badge */}
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] font-bold text-muted-foreground">
                          #{logs.length - idx}
                        </span>
                        {log.error_type && (
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full
                                       bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          >
                            {ERROR_LABEL[log.error_type] ?? log.error_type}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground ml-auto">
                          {formatTime(log.created_at)}
                        </span>
                      </div>

                      {/* Hint text */}
                      {log.ai_hint ? (
                        <p className="text-sm text-foreground leading-relaxed">
                          {log.ai_hint}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground/50 italic">
                          힌트 없음
                        </p>
                      )}

                      {/* Screenshot thumbnail */}
                      {log.screenshot_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={log.screenshot_url}
                          alt={`스크린샷 #${logs.length - idx}`}
                          className="mt-2.5 w-full h-20 object-cover rounded-lg
                                     border border-border opacity-70"
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
