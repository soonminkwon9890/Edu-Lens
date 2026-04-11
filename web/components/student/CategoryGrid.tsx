"use client";

import { useState } from "react";
import { Loader2, Rocket, Square } from "lucide-react";
import { createSession, resolveSession } from "@/app/actions";
import { cn } from "@/lib/utils";
import WebEduLensCapture from "@/components/WebEduLensCapture";

// ── Category definitions ──────────────────────────────────────────────────────

export const CATEGORIES = [
  {
    id:          "dev-setup",
    label:       "개발 환경 설정",
    description: "IDE, 패키지, 환경변수 구성",
    icon:        "⚙️",
    accent:      "blue",
    gradient:    "from-blue-500/15 via-blue-500/5 to-transparent",
    border:      "border-blue-500/25 hover:border-blue-400/60",
    shadow:      "hover:shadow-blue-500/15",
    badge:       "bg-blue-500/20 text-blue-300 border-blue-500/30",
  },
  {
    id:          "uiux",
    label:       "UI/UX 디자인",
    description: "Figma, 디자인 시스템, 인터랙션",
    icon:        "🎨",
    accent:      "lens",
    gradient:    "from-lens-500/15 via-lens-500/5 to-transparent",
    border:      "border-lens-500/25 hover:border-lens-400/60",
    shadow:      "hover:shadow-lens-500/15",
    badge:       "bg-lens-500/20 text-lens-300 border-lens-500/30",
  },
  {
    id:          "product",
    label:       "제품 기획",
    description: "요구사항 분석, PRD, 로드맵",
    icon:        "📋",
    accent:      "amber",
    gradient:    "from-amber-500/15 via-amber-500/5 to-transparent",
    border:      "border-amber-500/25 hover:border-amber-400/60",
    shadow:      "hover:shadow-amber-500/15",
    badge:       "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  {
    id:          "data-analysis",
    label:       "데이터 분석",
    description: "Python, SQL, 시각화, 통계",
    icon:        "📊",
    accent:      "cyan",
    gradient:    "from-cyan-500/15 via-cyan-500/5 to-transparent",
    border:      "border-cyan-500/25 hover:border-cyan-400/60",
    shadow:      "hover:shadow-cyan-500/15",
    badge:       "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  },
  {
    id:          "security",
    label:       "보안 & 네트워크",
    description: "취약점 분석, HTTPS, 방화벽",
    icon:        "🔒",
    accent:      "red",
    gradient:    "from-red-500/15 via-red-500/5 to-transparent",
    border:      "border-red-500/25 hover:border-red-400/60",
    shadow:      "hover:shadow-red-500/15",
    badge:       "bg-red-500/20 text-red-300 border-red-500/30",
  },
  {
    id:          "general",
    label:       "일반 학습",
    description: "알고리즘, CS 기초, 코딩 연습",
    icon:        "📚",
    accent:      "emerald",
    gradient:    "from-emerald-500/15 via-emerald-500/5 to-transparent",
    border:      "border-emerald-500/25 hover:border-emerald-400/60",
    shadow:      "hover:shadow-emerald-500/15",
    badge:       "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface CaptureSession {
  categoryId:    string;
  sessionId:     string;
  categoryLabel: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CategoryGridProps {
  userId:   string;
  mentorId: string | null;
  onNoMentor: () => void;
  /** Category IDs that already have a non-resolved session (from server). */
  activeCategoryIds?: string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CategoryGrid({
  userId,
  mentorId,
  onNoMentor,
  activeCategoryIds = [],
}: CategoryGridProps): JSX.Element {
  const [loadingId,      setLoadingId]      = useState<string | null>(null);
  const [stoppingId,     setStoppingId]     = useState<string | null>(null);
  const [launchError,    setLaunchError]    = useState<string | null>(null);
  // The currently live capture session (at most one at a time)
  const [captureSession, setCaptureSession] = useState<CaptureSession | null>(null);
  // Badge set: categoryIds with an open DB session (server-persisted + newly started)
  const [activeBadges,   setActiveBadges]   = useState<Set<string>>(
    () => new Set(activeCategoryIds),
  );

  // ── Start a session + mount capture widget ─────────────────────────────────

  async function handleLaunch(categoryId: string, categoryLabel: string): Promise<void> {
    if (!mentorId) { onNoMentor(); return; }
    if (captureSession) return; // one session at a time

    setLoadingId(categoryId);
    setLaunchError(null);

    try {
      const { sessionId } = await createSession(categoryId);

      setActiveBadges((prev) => new Set(prev).add(categoryId));
      setCaptureSession({ categoryId, sessionId, categoryLabel });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "MENTOR_NOT_SET") {
        onNoMentor();
      } else {
        setLaunchError("세션 시작에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setLoadingId(null);
    }
  }

  // ── Stop: resolve session in DB + unmount widget ───────────────────────────

  async function handleStop(): Promise<void> {
    if (!captureSession) return;

    const { categoryId, sessionId } = captureSession;
    setStoppingId(categoryId);

    try {
      await resolveSession(sessionId);
    } catch (err) {
      // Non-fatal: DB resolve failed but we still unmount the widget
      console.error("[CategoryGrid] resolveSession error:", err);
    } finally {
      setActiveBadges((prev) => {
        const next = new Set(prev);
        next.delete(categoryId);
        return next;
      });
      setCaptureSession(null);
      setStoppingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Section header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Rocket className="h-4 w-4 text-lens-400" />
        <h2 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
          학습 카테고리
        </h2>
        <span className="ml-1 text-xs text-muted-foreground/60">
          — 카드를 클릭하면 AI 화면 감지가 시작됩니다
        </span>
      </div>

      {/* ── Category cards grid ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map((cat) => {
          const isLoading   = loadingId      === cat.id;
          const isStopping  = stoppingId     === cat.id;
          const isCapturing = captureSession?.categoryId === cat.id;
          const isActive    = activeBadges.has(cat.id);
          // Disable cards while another session is loading/capturing,
          // but keep the capturing card itself clickable (to stop it).
          const isDisabled  = (!!loadingId || (!!captureSession && !isCapturing)) && !isCapturing;

          function handleClick() {
            if (isDisabled) return;
            if (isCapturing) {
              void handleStop();
            } else {
              void handleLaunch(cat.id, cat.label);
            }
          }

          return (
            <button
              key={cat.id}
              type="button"
              disabled={isDisabled || isStopping}
              onClick={handleClick}
              className={cn(
                "group relative text-left rounded-2xl border bg-card",
                "p-5 transition-all duration-200",
                "hover:-translate-y-0.5 hover:shadow-xl",
                "active:scale-[0.98] active:translate-y-0",
                "disabled:pointer-events-none disabled:opacity-50",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
                cat.border,
                cat.shadow,
                isCapturing && "ring-2 ring-emerald-500/50 border-emerald-500/50",
                isActive && !isCapturing && "ring-1 ring-emerald-500/30 border-emerald-500/30 opacity-75",
              )}
            >
              {/* Gradient overlay */}
              <div
                className={cn(
                  "absolute inset-0 rounded-2xl bg-gradient-to-br opacity-0",
                  "group-hover:opacity-100 transition-opacity duration-300",
                  cat.gradient,
                )}
                aria-hidden
              />

              <div className="relative z-10 flex flex-col gap-3 h-full">
                {/* Top row: icon + status badge */}
                <div className="flex items-start justify-between">
                  <span className="text-3xl select-none" role="img" aria-label={cat.label}>
                    {cat.icon}
                  </span>

                  {/* State badge */}
                  {isLoading || isStopping ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : isCapturing ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5
                                     text-[10px] font-semibold text-emerald-400
                                     bg-emerald-500/20 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      감지 중
                    </span>
                  ) : isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
                                     text-[10px] font-semibold text-emerald-400/70
                                     bg-emerald-500/10 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" />
                      실행됨
                    </span>
                  ) : (
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5",
                      "text-[10px] font-semibold border",
                      "opacity-0 group-hover:opacity-100 transition-opacity",
                      cat.badge,
                    )}>
                      시작하기 →
                    </span>
                  )}
                </div>

                {/* Label + description */}
                <div>
                  <p className="font-semibold text-foreground text-[15px] leading-tight mb-1">
                    {cat.label}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {cat.description}
                  </p>
                </div>

                {/* Stop hint — shown on hover when capturing */}
                {isCapturing && (
                  <div className="flex items-center gap-1.5 text-[11px] text-red-400/80
                                   opacity-0 group-hover:opacity-100 transition-opacity">
                    <Square className="h-3 w-3 fill-current" />
                    클릭하여 감지 중지
                  </div>
                )}

                {/* Loading bar */}
                {isLoading && (
                  <div className="h-0.5 w-full rounded-full bg-border overflow-hidden">
                    <div className="h-full w-1/2 rounded-full bg-lens-500 animate-[shimmer_1s_linear_infinite]" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Launch error ─────────────────────────────────────────────────── */}
      {launchError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30
                         bg-destructive/10 px-4 py-3">
          <span className="text-lg mt-0.5" role="img" aria-label="오류">⚠️</span>
          <div>
            <p className="text-sm font-medium text-destructive">세션 시작 오류</p>
            <p className="text-xs text-muted-foreground mt-0.5">{launchError}</p>
          </div>
          <button
            type="button"
            onClick={() => setLaunchError(null)}
            className="ml-auto shrink-0 text-muted-foreground hover:text-foreground
                       transition-colors text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── WebEduLensCapture widget (fixed position, renders globally) ── */}
      {captureSession && (
        <WebEduLensCapture
          studentId={userId}
          sessionId={captureSession.sessionId}
          category={captureSession.categoryId}
          categoryLabel={captureSession.categoryLabel}
          onStop={handleStop}
        />
      )}
    </div>
  );
}
