import { useEffect, useRef } from "react";
import type { StudentSummary } from "@/types/database";
import StatusBadge from "./StatusBadge";
import { formatTime } from "@/lib/utils";

interface Props {
  summary: StudentSummary;
  onClose: () => void;
}

export default function StudentModal({ summary, onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const { latest, history } = summary;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4
                 bg-black/70 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto
                   bg-radar-card border border-radar-border rounded-3xl
                   shadow-2xl shadow-black/60 animate-slide-up"
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-radar-card border-b border-radar-border
                        rounded-t-3xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-radar-accent/20 border border-radar-accent/30
                            flex items-center justify-center font-bold text-radar-accent">
              {summary.student_id.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="font-bold text-radar-text text-lg leading-tight">
                {summary.student_id}
              </h2>
              <p className="text-xs text-radar-subtext">{latest.tool_name}</p>
            </div>
            <StatusBadge status={latest.status} className="ml-2" />
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-radar-border bg-radar-bg
                       text-radar-muted hover:border-red-500/60 hover:text-red-400
                       transition-colors flex items-center justify-center text-sm"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── Latest screenshot ── */}
          <section>
            <h3 className="text-xs font-semibold tracking-widest text-radar-subtext uppercase mb-3">
              최근 스크린샷
            </h3>
            {latest.screenshot_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={latest.screenshot_url}
                alt="student screenshot"
                className="w-full rounded-xl border border-radar-border object-contain
                           max-h-72 bg-black/30"
              />
            ) : (
              <div className="w-full h-32 rounded-xl border border-radar-border
                              flex items-center justify-center text-radar-muted text-sm">
                스크린샷 없음
              </div>
            )}
          </section>

          {/* ── AI Hint history ── */}
          <section>
            <h3 className="text-xs font-semibold tracking-widest text-radar-subtext uppercase mb-3">
              AI 힌트 기록
              <span className="ml-2 text-radar-accent font-normal normal-case tracking-normal">
                ({history.length}개 이벤트)
              </span>
            </h3>

            <ol className="relative border-l border-radar-border ml-3 space-y-5">
              {history.map((log, idx) => (
                <li key={log.id} className="ml-5">
                  {/* Timeline dot */}
                  <span
                    className={`absolute -left-[7px] w-3.5 h-3.5 rounded-full border-2
                                border-radar-bg
                                ${
                                  log.status === "critical"
                                    ? "bg-red-500"
                                    : "bg-amber-500"
                                }`}
                  />

                  <div className="bg-radar-bg border border-radar-border rounded-xl p-3.5">
                    {/* Row: index + time + badge */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold text-radar-muted">
                        #{history.length - idx}
                      </span>
                      <span className="text-[11px] text-radar-subtext">
                        {formatTime(log.created_at)}
                      </span>
                      <StatusBadge status={log.status} />
                    </div>

                    {/* Hint text */}
                    <p className="text-sm text-radar-text leading-relaxed">
                      {log.ai_hint}
                    </p>

                    {/* Thumbnail */}
                    {log.screenshot_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={log.screenshot_url}
                        alt={`screenshot #${history.length - idx}`}
                        className="mt-2.5 w-full h-20 object-cover rounded-lg
                                   border border-radar-border opacity-70"
                      />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
