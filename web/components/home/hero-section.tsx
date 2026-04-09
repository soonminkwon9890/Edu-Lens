import Link from "next/link";
import { ArrowRight, Play, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function HeroSection() {
  return (
    <section
      className="relative overflow-hidden pt-20 pb-24 md:pt-28 md:pb-32"
      aria-labelledby="hero-heading"
    >
      {/* ── Background grid + radial glow ─────────────────────────── */}
      <div
        aria-hidden
        className="absolute inset-0 bg-hero-grid bg-grid opacity-100 pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-radial from-lens-500/10 via-transparent to-transparent
                   pointer-events-none"
      />
      {/* Subtle bottom fade */}
      <div
        aria-hidden
        className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-background to-transparent
                   pointer-events-none"
      />

      <div className="container relative z-10 flex flex-col items-center text-center">

        {/* ── Eyebrow badge ────────────────────────────────────────── */}
        <div className="animate-fade-in opacity-0 [animation-delay:0ms]">
          <Badge
            variant="lens"
            className="gap-1.5 px-3 py-1 text-xs font-medium mb-6"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            Gemini 1.5 Flash + Supabase 실시간 분석 기반
          </Badge>
        </div>

        {/* ── Headline ──────────────────────────────────────────────── */}
        <h1
          id="hero-heading"
          className="animate-fade-in opacity-0 [animation-delay:80ms]
                     max-w-4xl text-5xl font-extrabold tracking-tight leading-tight
                     md:text-6xl lg:text-7xl text-balance"
        >
          교육의 흐름을 맑게{" "}
          <span className="text-gradient">비추는 렌즈, 에듀렌즈</span>
        </h1>

        {/* ── Sub-headline ──────────────────────────────────────────── */}
        <p
          className="animate-fade-in opacity-0 [animation-delay:160ms]
                     mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed text-balance"
        >
          에듀렌즈는 학생의 화면을 실시간으로 분석해 막힘 순간을 즉시 감지하고,
          소크라테스식 힌트로 돌파구를 제시합니다 — 학생은 스스로 해결하고,
          교사는 한눈에 파악할 수 있어요.
        </p>

        {/* ── CTA buttons ──────────────────────────────────────────── */}
        <div
          className="animate-fade-in opacity-0 [animation-delay:240ms]
                     mt-10 flex flex-col sm:flex-row items-center gap-4"
        >
          <Button variant="glow" size="lg" asChild className="min-w-44">
            <Link href="/dashboard">
              대시보드 시작하기
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>

          <Button variant="outline" size="lg" asChild className="min-w-44 gap-2">
            <Link href="#how-it-works">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full
                           bg-lens-500/20 border border-lens-500/40"
              >
                <Play className="h-3 w-3 fill-lens-400 text-lens-400" aria-hidden />
              </span>
              작동 방식 보기
            </Link>
          </Button>
        </div>

        {/* ── Social proof ─────────────────────────────────────────── */}
        <p
          className="animate-fade-in opacity-0 [animation-delay:320ms]
                     mt-8 text-xs text-muted-foreground"
        >
          VS Code · PyCharm · Figma · Xcode · Terminal 등 다양한 도구와 호환
        </p>

        {/* ── Hero illustration placeholder ─────────────────────────── */}
        <div
          aria-hidden
          className="animate-fade-in opacity-0 [animation-delay:400ms]
                     mt-16 w-full max-w-4xl"
        >
          <div
            className="relative rounded-2xl border border-border/60 bg-card/60
                       shadow-2xl shadow-black/50 overflow-hidden backdrop-blur-sm"
          >
            {/* Fake window chrome */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/50 bg-card/80">
              <span className="h-3 w-3 rounded-full bg-red-500/70" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
              <span className="h-3 w-3 rounded-full bg-green-500/70" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">
                에듀렌즈 — 실시간 학습 현황 모니터
              </span>
            </div>

            {/* Mock dashboard grid */}
            <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 min-h-[220px]">
              {[
                { label: "위급",  color: "border-red-500/50 bg-red-500/5",    dot: "bg-red-500"    },
                { label: "막힘",  color: "border-amber-500/50 bg-amber-500/5", dot: "bg-amber-500" },
                { label: "막힘",  color: "border-amber-500/50 bg-amber-500/5", dot: "bg-amber-500" },
              ].map(({ label, color, dot }, i) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 flex flex-col gap-2 ${color}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="h-7 w-7 rounded-full bg-lens-500/20 border border-lens-500/30
                                    flex items-center justify-center text-xs font-bold text-lens-400">
                      {String.fromCharCode(65 + i)}
                    </div>
                    <span className={`h-2 w-2 rounded-full ${dot} animate-pulse`} />
                  </div>
                  <div className="h-2 w-3/4 rounded bg-muted/60" />
                  <div className="h-2 w-1/2 rounded bg-muted/40" />
                  <span className="mt-1 text-[10px] font-bold tracking-widest text-muted-foreground">
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Glow overlay */}
            <div
              className="absolute inset-0 bg-gradient-to-t from-lens-500/5 to-transparent
                         pointer-events-none rounded-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
