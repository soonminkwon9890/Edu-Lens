"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Monitor, StopCircle, ChevronDown, AlertTriangle, Minimize2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyzeResponse {
  success:    boolean;
  no_stall:   boolean;
  error_type: string | null;
  ai_hint:    string | null;
  ai_hint_2:  string | null;
  ai_hint_3:  string | null;
}

interface HintState {
  errorType: string;
  level1:    string;
  level2:    string;
  level3:    string;
  /** Which level is currently visible (1–3) */
  shown:     1 | 2 | 3;
}

type CaptureStatus =
  | "requesting"   // waiting for user to grant screen share
  | "active"       // capturing + analysing
  | "analysing"    // mid-request to the API
  | "denied"       // user rejected getDisplayMedia
  | "error";       // unexpected failure

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERVAL_MS      = 30_000;   // analyse every 30 s
const JPEG_QUALITY     = 0.85;

const ERROR_TYPE_LABELS: Record<string, string> = {
  syntax:     "구문 오류",
  tool_usage: "도구 사용법",
  config:     "설정 오류",
  unknown:    "알 수 없음",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WebEduLensCaptureProps {
  studentId:     string;
  sessionId:     string;
  category:      string;
  categoryLabel: string;
  /** Called after the user stops the session (parent cleans up state). */
  onStop: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WebEduLensCapture({
  studentId,
  sessionId,
  category,
  categoryLabel,
  onStop,
}: WebEduLensCaptureProps): JSX.Element {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status,     setStatus]     = useState<CaptureStatus>("requesting");
  const [countdown,  setCountdown]  = useState(INTERVAL_MS / 1000);
  const [analysedN,  setAnalysedN]  = useState(0);
  const [hint,       setHint]       = useState<HintState | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [minimised,  setMinimised]  = useState(false);

  // ── Cleanup helper ─────────────────────────────────────────────────────────

  const stopEverything = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (tickRef.current)     clearInterval(tickRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ── Capture one frame and send to the API ──────────────────────────────────

  const captureAndAnalyse = useCallback(async () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    setStatus("analysing");

    try {
      // Draw current video frame to canvas
      canvas.width  = video.videoWidth  || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to JPEG base64 (strip the data-URL prefix)
      const dataUrl  = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const b64      = dataUrl.split(",")[1];

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is not configured.");

      const res = await fetch(`${apiUrl}/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: b64,
          student_id:   studentId,
          session_id:   sessionId,
          category,
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);

      const data: AnalyzeResponse = await res.json();

      setAnalysedN((n) => n + 1);

      if (!data.no_stall && data.error_type && data.ai_hint) {
        setHint({
          errorType: data.error_type,
          level1:    data.ai_hint,
          level2:    data.ai_hint_2 ?? "",
          level3:    data.ai_hint_3 ?? "",
          shown:     1,
        });
      }
    } catch (err) {
      console.error("[WebEduLensCapture] analyse error:", err);
      setErrorMsg(err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.");
    } finally {
      setStatus("active");
      // Reset countdown
      setCountdown(INTERVAL_MS / 1000);
    }
  }, [studentId, sessionId, category]);

  // ── Start screen share on mount ────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 1, max: 5 } },
          audio: false,
        });

        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;

        // Attach stream to hidden video element so we can draw frames
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // If the user stops share via the browser's native stop button
        stream.getVideoTracks()[0].addEventListener("ended", () => {
          stopEverything();
          onStop();
        });

        setStatus("active");
        setCountdown(INTERVAL_MS / 1000);

        // Immediate first analysis
        await captureAndAnalyse();

        // Recurring analysis interval
        intervalRef.current = setInterval(captureAndAnalyse, INTERVAL_MS);

        // 1-second countdown tick
        tickRef.current = setInterval(() => {
          setCountdown((c) => (c <= 1 ? INTERVAL_MS / 1000 : c - 1));
        }, 1_000);
      } catch (err: unknown) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "AbortError") {
          setStatus("denied");
        } else {
          setStatus("error");
          setErrorMsg(err instanceof Error ? err.message : "화면 공유를 시작할 수 없습니다.");
        }
        // If we couldn't start capturing, tell parent immediately
        // so the session is resolved and the badge is cleared.
        onStop();
      }
    })();

    return () => {
      cancelled = true;
      stopEverything();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Hint helpers ───────────────────────────────────────────────────────────

  function revealNextHint() {
    setHint((prev) => {
      if (!prev || prev.shown >= 3) return prev;
      return { ...prev, shown: (prev.shown + 1) as 1 | 2 | 3 };
    });
  }

  const hintLabel = hint
    ? ERROR_TYPE_LABELS[hint.errorType] ?? hint.errorType
    : null;

  const canRevealMore = hint
    ? (hint.shown === 1 && !!hint.level2) || (hint.shown === 2 && !!hint.level3)
    : false;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden media elements — must be in DOM for capture to work */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Floating widget ── */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50",
          "w-80 rounded-2xl border border-border",
          "bg-[#111318] shadow-2xl shadow-black/60",
          "transition-all duration-200",
          minimised && "w-auto",
        )}
        role="complementary"
        aria-label="EduLens 학습 감지 위젯"
      >

        {/* ── Header ── */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
          {/* Live indicator */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {status === "active" || status === "analysing" ? (
              <>
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </>
            ) : (
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/40" />
            )}
          </span>

          {!minimised && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground leading-tight truncate">
                EduLens 감지 중
              </p>
              <p className="text-[10px] text-muted-foreground truncate">{categoryLabel}</p>
            </div>
          )}

          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setMinimised((m) => !m)}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground
                         hover:bg-white/5 transition-colors"
              aria-label={minimised ? "확장" : "최소화"}
            >
              {minimised ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onStop}
              className="p-1 rounded-lg text-muted-foreground hover:text-red-400
                         hover:bg-red-500/10 transition-colors"
              aria-label="세션 종료"
            >
              <StopCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Body (hidden when minimised) ── */}
        {!minimised && (
          <div className="p-4 space-y-3">

            {/* ── Status: requesting ── */}
            {status === "requesting" && (
              <div className="flex items-center gap-3 py-2">
                <Monitor className="h-5 w-5 text-lens-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">화면 공유 요청 중</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    브라우저 팝업에서 공유할 화면을 선택해 주세요.
                  </p>
                </div>
              </div>
            )}

            {/* ── Status: denied ── */}
            {status === "denied" && (
              <div className="flex items-start gap-3 py-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  화면 공유가 취소됐습니다. 다시 시작하려면 카테고리 카드를 클릭하세요.
                </p>
              </div>
            )}

            {/* ── Status: error ── */}
            {status === "error" && errorMsg && (
              <div className="flex items-start gap-3 py-2">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400 leading-relaxed">{errorMsg}</p>
              </div>
            )}

            {/* ── Status: active / analysing ── */}
            {(status === "active" || status === "analysing") && (
              <>
                {/* Stats row */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {status === "analysing" ? (
                      <span className="flex items-center gap-1.5 text-lens-400">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        분석 중…
                      </span>
                    ) : (
                      `다음 분석: ${countdown}초 후`
                    )}
                  </span>
                  <span className="tabular-nums">
                    분석 {analysedN}회
                  </span>
                </div>

                {/* Thin progress bar showing countdown */}
                {status === "active" && (
                  <div className="h-0.5 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-lens-500 transition-all duration-1000 ease-linear"
                      style={{ width: `${((INTERVAL_MS / 1000 - countdown) / (INTERVAL_MS / 1000)) * 100}%` }}
                    />
                  </div>
                )}

                {/* ── Hint panel ── */}
                {hint ? (
                  <div className="rounded-xl border border-border/70 bg-white/[0.03] p-3.5 space-y-2.5">

                    {/* Error type badge */}
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
                                       text-[10px] font-semibold
                                       bg-lens-500/20 text-lens-300 border border-lens-500/30">
                        {hintLabel}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        힌트 {hint.shown}/3 단계
                      </span>
                    </div>

                    {/* Hint bubbles — revealed progressively */}
                    <div className="space-y-2">
                      {hint.shown >= 1 && (
                        <p className="text-xs text-foreground/90 leading-relaxed">{hint.level1}</p>
                      )}
                      {hint.shown >= 2 && hint.level2 && (
                        <p className="text-xs text-foreground/80 leading-relaxed border-l-2 border-lens-500/50 pl-2.5">
                          {hint.level2}
                        </p>
                      )}
                      {hint.shown >= 3 && hint.level3 && (
                        <p className="text-xs text-foreground/70 leading-relaxed border-l-2 border-lens-500/30 pl-2.5">
                          {hint.level3}
                        </p>
                      )}
                    </div>

                    {/* Reveal next hint */}
                    {canRevealMore && (
                      <button
                        type="button"
                        onClick={revealNextHint}
                        className="flex items-center gap-1 text-[11px] text-lens-400
                                   hover:text-lens-300 transition-colors"
                      >
                        <ChevronDown className="h-3 w-3" />
                        힌트 {hint.shown + 1}단계 보기
                      </button>
                    )}
                  </div>
                ) : (
                  /* No stall detected yet */
                  <div className="rounded-xl border border-dashed border-border/50 px-3.5 py-3
                                  text-center text-xs text-muted-foreground/60">
                    문제가 발견되면 여기에 힌트가 표시됩니다 👀
                  </div>
                )}
              </>
            )}

            {/* ── Stop button ── */}
            <button
              type="button"
              onClick={onStop}
              className="w-full flex items-center justify-center gap-2 rounded-xl
                         border border-border/60 bg-white/[0.03]
                         py-2 text-xs font-medium text-muted-foreground
                         hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/5
                         transition-all duration-150"
            >
              <StopCircle className="h-3.5 w-3.5" />
              세션 종료
            </button>

          </div>
        )}
      </div>
    </>
  );
}
