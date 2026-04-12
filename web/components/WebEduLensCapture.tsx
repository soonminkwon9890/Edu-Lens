"use client";

import {
  useEffect, useRef, useState, useCallback,
  KeyboardEvent, useLayoutEffect,
} from "react";
import {
  Loader2, MonitorPlay, StopCircle,
  ChevronDown, AlertTriangle, Minimize2, Maximize2, SendHorizonal,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Shape of every /analyze response from the FastAPI backend. */
interface ApiResponse {
  success:        boolean;
  response_type:  "error" | "proactive" | "answer";
  message:        string;
  message_2?:     string | null;
  message_3?:     string | null;
  error_type?:    string | null;
  session_status?: string | null;
}

/** A single bubble in the chat history. */
interface ChatMessage {
  id:          string;
  role:        "system" | "user" | "error" | "proactive" | "answer" | "loading";
  text:        string;
  // "error" extras
  hint2?:      string;
  hint3?:      string;
  errorType?:  string;
  shownLevel?: 1 | 2 | 3;
  // "proactive" extras
  answered?:   boolean;
}

type WidgetStatus =
  | "idle"        // not yet started — show welcome + "감지 시작" button
  | "requesting"  // getDisplayMedia in progress
  | "active"      // auto-capture loop running
  | "paused"      // user said "아니오" — manual Q only, auto stopped
  | "error";      // unrecoverable capture error

// ── Constants ─────────────────────────────────────────────────────────────────

const INTERVAL_MS  = 30_000;
const JPEG_QUALITY = 0.85;

const ERROR_LABELS: Record<string, string> = {
  syntax:     "구문 오류",
  tool_usage: "도구 사용법",
  config:     "설정 오류",
  unknown:    "알 수 없음",
};

const WELCOME_MESSAGE: ChatMessage = {
  id:   "welcome",
  role: "system",
  text: "안녕하세요! EduLens AI 코파일럿입니다 👋\n\n"
      + "화면 감지를 시작하면 30초마다 화면을 자동 분석하고, "
      + "막히는 부분이 있으면 소크라테스식 힌트를 드릴게요.\n\n"
      + "궁금한 점이 생기면 아래 채팅창에 바로 질문하셔도 됩니다!",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface WebEduLensCaptureProps {
  studentId:     string;
  sessionId:     string;
  category:      string;
  categoryLabel: string;
  onStop:        () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WebEduLensCapture({
  studentId,
  sessionId,
  category,
  categoryLabel,
  onStop,
}: WebEduLensCaptureProps): JSX.Element {
  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Stable ref so the setInterval callback always sees the latest function.
  const runAutoRef    = useRef<() => Promise<void>>();

  // ── State ──────────────────────────────────────────────────────────────────
  const [status,     setStatus]     = useState<WidgetStatus>("idle");
  const [messages,   setMessages]   = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [countdown,  setCountdown]  = useState(INTERVAL_MS / 1000);
  const [analysedN,  setAnalysedN]  = useState(0);
  const [inputText,  setInputText]  = useState("");
  const [isSending,  setIsSending]  = useState(false);
  const [minimised,  setMinimised]  = useState(false);
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);

  // ── Auto-scroll to latest message ─────────────────────────────────────────
  useLayoutEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tickRef.current)     clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── Chat helpers ───────────────────────────────────────────────────────────

  function push(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  function replace(id: string, updates: Partial<ChatMessage>) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }

  // ── Frame capture ──────────────────────────────────────────────────────────

  const captureFrame = useCallback((): string | null => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return null;
    canvas.width  = video.videoWidth  || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1];
  }, []);

  // ── API call ───────────────────────────────────────────────────────────────

  const callApi = useCallback(async (
    b64:         string,
    requestType: "auto" | "manual",
    userPrompt?: string,
  ): Promise<ApiResponse> => {
    const res = await fetch("/api/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: b64,
        student_id:   studentId,
        session_id:   sessionId,
        category,
        request_type: requestType,
        user_prompt:  userPrompt ?? null,
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json() as Promise<ApiResponse>;
  }, [studentId, sessionId, category]);

  // ── Stop auto-capture (keeps stream alive for manual Q) ───────────────────

  function pauseAutoCapture() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (tickRef.current)     { clearInterval(tickRef.current);     tickRef.current     = null; }
    setStatus("paused");
  }

  // ── Auto analysis (one cycle) ─────────────────────────────────────────────

  const runAutoCapture = useCallback(async () => {
    const b64 = captureFrame();
    if (!b64) return;

    setStatus("active"); // ensure we're in active (re-entry guard)

    const loadingId = uid();
    push({ id: loadingId, role: "loading", text: "" });

    try {
      const data = await callApi(b64, "auto");
      setAnalysedN((n) => n + 1);

      if (data.response_type === "error") {
        replace(loadingId, {
          role:       "error",
          text:       data.message,
          hint2:      data.message_2  ?? "",
          hint3:      data.message_3  ?? "",
          errorType:  data.error_type ?? "unknown",
          shownLevel: 1,
        });
      } else if (data.response_type === "proactive") {
        replace(loadingId, {
          role:     "proactive",
          text:     data.message,
          answered: false,
        });
      } else {
        // Unexpected response_type in auto mode — silently remove loading bubble
        setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      }
    } catch (err) {
      replace(loadingId, {
        role: "system",
        text: `분석 중 오류: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
      });
    } finally {
      setCountdown(INTERVAL_MS / 1000);
    }
  }, [captureFrame, callApi]);

  // Keep the ref in sync so the setInterval callback is always fresh.
  runAutoRef.current = runAutoCapture;

  // ── Start capture (triggered by user click, not mount) ────────────────────

  async function handleStartCapture() {
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 1, max: 5 } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Browser's native "Stop sharing" button
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        pauseAutoCapture();
        onStop();
      });

      setStatus("active");
      setCountdown(INTERVAL_MS / 1000);
      push({
        id:   uid(),
        role: "system",
        text: "화면 감지가 시작됐어요! 30초마다 화면을 분석할게요 🔍",
      });

      // Immediate first analysis
      await runAutoCapture();

      // Recurring interval — uses ref to avoid stale closure
      intervalRef.current = setInterval(() => {
        void runAutoRef.current?.();
      }, INTERVAL_MS);

      // Countdown tick
      tickRef.current = setInterval(() => {
        setCountdown((c) => (c <= 1 ? INTERVAL_MS / 1000 : c - 1));
      }, 1_000);

    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "AbortError") {
        // User cancelled the share dialog — go back to idle, don't end session
        setStatus("idle");
        push({
          id:   uid(),
          role: "system",
          text: "화면 공유가 취소됐습니다. 준비가 되면 '감지 시작' 버튼을 다시 눌러 주세요.",
        });
      } else {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "화면 공유를 시작할 수 없습니다.");
      }
    }
  }

  // ── Proactive response handlers ───────────────────────────────────────────

  async function handleProactiveYes(msgId: string) {
    replace(msgId, { answered: true });
    // Stop the auto-capture loop: user is now in a manual chat session.
    pauseAutoCapture();
    const prompt = "네, 도와주세요.";
    push({ id: uid(), role: "user", text: prompt });
    await sendManual(prompt);
  }

  function handleProactiveNo(msgId: string) {
    replace(msgId, { answered: true });
    pauseAutoCapture();
    push({
      id:   uid(),
      role: "system",
      text: "자동 감지를 중지합니다. 질문이 있다면 아래 창에 입력해 주세요.",
    });
  }

  // ── Manual Q&A ────────────────────────────────────────────────────────────

  async function sendManual(prompt: string) {
    const b64 = captureFrame();
    const loadingId = uid();
    push({ id: loadingId, role: "loading", text: "" });

    if (!b64) {
      replace(loadingId, {
        role: "system",
        text: "화면 캡처에 실패했습니다. 화면 공유가 활성 상태인지 확인해 주세요.",
      });
      return;
    }

    try {
      const data = await callApi(b64, "manual", prompt);
      replace(loadingId, { role: "answer", text: data.message });
    } catch (err) {
      replace(loadingId, {
        role: "system",
        text: `답변을 가져오지 못했습니다: ${err instanceof Error ? err.message : "오류"}`,
      });
    }
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || isSending) return;
    if (!streamRef.current) {
      push({ id: uid(), role: "system", text: "화면 공유를 먼저 시작해야 질문할 수 있어요." });
      return;
    }
    setInputText("");
    setIsSending(true);
    // Stop the auto-capture loop the moment the user manually sends a message.
    // The interval would otherwise fire mid-conversation and interrupt the flow.
    if (status === "active") pauseAutoCapture();
    push({ id: uid(), role: "user", text });
    try {
      await sendManual(text);
    } finally {
      setIsSending(false);
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ── Hint reveal ───────────────────────────────────────────────────────────

  function revealHint(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.shownLevel || m.shownLevel >= 3) return m;
        return { ...m, shownLevel: (m.shownLevel + 1) as 1 | 2 | 3 };
      }),
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isLive     = status === "active" || status === "paused";
  const canInput   = isLive && !isSending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden media elements — must be in the DOM for capture to work */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Floating chat widget ── */}
      <div
        className={cn(
          "fixed bottom-6 right-6 z-50 flex flex-col",
          "rounded-2xl border border-white/10",
          "bg-[#0f1117] shadow-2xl shadow-black/70",
          "transition-all duration-200 ease-in-out",
          minimised ? "w-52 h-auto" : "w-[360px]",
        )}
        role="complementary"
        aria-label="EduLens AI 코파일럿"
      >

        {/* ── Header ── */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-white/8 shrink-0">
          {/* Live indicator dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {isLive ? (
              <>
                <span className="absolute inset-0 rounded-full bg-emerald-400/70 animate-ping" />
                <span className="relative rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </>
            ) : status === "requesting" ? (
              <Loader2 className="h-2.5 w-2.5 text-lens-400 animate-spin" />
            ) : (
              <span className="rounded-full h-2.5 w-2.5 bg-white/20" />
            )}
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-white/80 leading-tight truncate">
              EduLens AI 코파일럿
            </p>
            {!minimised && (
              <p className="text-[10px] text-white/35 truncate">{categoryLabel}</p>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setMinimised((m) => !m)}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
              aria-label={minimised ? "확장" : "최소화"}
            >
              {minimised
                ? <Maximize2 className="h-3.5 w-3.5" />
                : <Minimize2 className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onStop}
              className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              aria-label="세션 종료"
            >
              <StopCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── Body (hidden when minimised) ── */}
        {!minimised && (
          <>
            {/* ── Message list ── */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 max-h-[300px]
                             scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">

              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onRevealHint={revealHint}
                  onProactiveYes={handleProactiveYes}
                  onProactiveNo={handleProactiveNo}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Status bar (active mode only) ── */}
            {status === "active" && (
              <div className="px-3.5 py-2 border-t border-white/8 shrink-0">
                <div className="flex items-center justify-between text-[10px] text-white/30 mb-1.5">
                  <span className="tabular-nums">다음 분석: {countdown}초 후</span>
                  <span className="tabular-nums">분석 {analysedN}회</span>
                </div>
                <div className="h-0.5 w-full rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-lens-500/60 transition-all duration-1000 ease-linear"
                    style={{
                      width: `${((INTERVAL_MS / 1000 - countdown) / (INTERVAL_MS / 1000)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── Error state ── */}
            {status === "error" && errorMsg && (
              <div className="px-3.5 py-3 border-t border-white/8 flex items-start gap-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-400/80 leading-relaxed">{errorMsg}</p>
              </div>
            )}

            {/* ── Input row (when live) ── */}
            {isLive && (
              <div className="flex items-end gap-2 px-3 py-2.5 border-t border-white/8 shrink-0">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  disabled={!canInput}
                  placeholder="질문을 입력하세요… (Enter로 전송)"
                  rows={1}
                  className="flex-1 resize-none rounded-xl bg-white/5 border border-white/10
                             px-3 py-2 text-xs text-white/80 placeholder:text-white/25
                             focus:outline-none focus:border-lens-500/50 focus:bg-white/[0.07]
                             disabled:opacity-40 transition-colors
                             max-h-24 overflow-y-auto"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canInput || !inputText.trim()}
                  className="shrink-0 p-2 rounded-xl bg-lens-500/80 text-white
                             hover:bg-lens-500 transition-colors
                             disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="전송"
                >
                  {isSending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <SendHorizonal className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}

            {/* ── Action bar ── */}
            <div className="px-3 pb-3 pt-1 flex gap-2 shrink-0">
              {status === "idle" || status === "requesting" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleStartCapture()}
                    disabled={status === "requesting"}
                    className="flex-1 flex items-center justify-center gap-2
                               rounded-xl bg-lens-gradient py-2.5
                               text-xs font-semibold text-white
                               hover:opacity-90 transition-opacity
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === "requesting" ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />요청 중…</>
                    ) : (
                      <><MonitorPlay className="h-3.5 w-3.5" />감지 시작</>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onStop}
                    className="px-3 py-2.5 rounded-xl border border-white/10
                               text-xs text-white/40 hover:text-white/70
                               hover:bg-white/5 transition-colors"
                  >
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onStop}
                  className="w-full flex items-center justify-center gap-2 rounded-xl
                             border border-white/10 py-2 text-xs text-white/40
                             hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/5
                             transition-all duration-150"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  세션 종료
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Message bubble sub-components ─────────────────────────────────────────────

interface BubbleProps {
  msg:              ChatMessage;
  onRevealHint:     (id: string) => void;
  onProactiveYes:   (id: string) => void;
  onProactiveNo:    (id: string) => void;
}

function MessageBubble({ msg, onRevealHint, onProactiveYes, onProactiveNo }: BubbleProps) {
  if (msg.role === "loading") {
    return (
      <div className="flex items-center gap-2 text-white/30">
        <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:300ms]" />
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm
                        bg-lens-500/70 px-3 py-2 text-xs text-white leading-relaxed">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === "system") {
    return (
      <div className="flex justify-center">
        <p className="text-[10px] text-white/30 text-center leading-relaxed px-2 whitespace-pre-line">
          {msg.text}
        </p>
      </div>
    );
  }

  if (msg.role === "answer") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm
                        bg-white/[0.06] border border-white/8
                        px-3 py-2 text-xs text-white/80 leading-relaxed">
          {msg.text}
        </div>
      </div>
    );
  }

  if (msg.role === "error") {
    const label = ERROR_LABELS[msg.errorType ?? ""] ?? msg.errorType;
    const shown = msg.shownLevel ?? 1;
    const canReveal =
      (shown === 1 && !!msg.hint2) ||
      (shown === 2 && !!msg.hint3);

    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm
                        bg-red-500/10 border border-red-500/20
                        px-3 py-2.5 space-y-2 text-xs">
          {/* Badge row */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5
                             bg-red-500/20 border border-red-500/30
                             text-[10px] font-semibold text-red-400">
              {label}
            </span>
            <span className="text-[10px] text-white/30">힌트 {shown}/3단계</span>
          </div>

          {/* Hint levels (progressive) */}
          <div className="space-y-1.5">
            {shown >= 1 && (
              <p className="text-white/80 leading-relaxed">{msg.text}</p>
            )}
            {shown >= 2 && msg.hint2 && (
              <p className="text-white/65 leading-relaxed border-l-2 border-red-500/40 pl-2">
                {msg.hint2}
              </p>
            )}
            {shown >= 3 && msg.hint3 && (
              <p className="text-white/50 leading-relaxed border-l-2 border-red-500/20 pl-2">
                {msg.hint3}
              </p>
            )}
          </div>

          {canReveal && (
            <button
              type="button"
              onClick={() => onRevealHint(msg.id)}
              className="flex items-center gap-1 text-[10px] text-red-400/70
                         hover:text-red-400 transition-colors"
            >
              <ChevronDown className="h-3 w-3" />
              힌트 {shown + 1}단계 보기
            </button>
          )}
        </div>
      </div>
    );
  }

  if (msg.role === "proactive") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm
                        bg-lens-500/10 border border-lens-500/20
                        px-3 py-2.5 space-y-2.5 text-xs">
          <p className="text-white/75 leading-relaxed">{msg.text}</p>

          {!msg.answered && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onProactiveYes(msg.id)}
                className="flex-1 rounded-lg bg-lens-500/30 border border-lens-500/40
                           py-1.5 text-[11px] font-semibold text-lens-300
                           hover:bg-lens-500/50 transition-colors"
              >
                예, 도와주세요
              </button>
              <button
                type="button"
                onClick={() => onProactiveNo(msg.id)}
                className="flex-1 rounded-lg bg-white/5 border border-white/10
                           py-1.5 text-[11px] text-white/40
                           hover:bg-white/10 transition-colors"
              >
                아니오
              </button>
            </div>
          )}

          {msg.answered && (
            <p className="text-[10px] text-white/25 italic">응답 완료</p>
          )}
        </div>
      </div>
    );
  }

  return null;
}
