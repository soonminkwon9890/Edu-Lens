"use client";

import React, { useState } from "react";
import { BrainCircuit, History, Sparkles } from "lucide-react";
import { ImageUploader } from "@src/components/analysis/ImageUploader";
import { ResultDisplay } from "@src/components/analysis/ResultDisplay";
import { analysisService, type AnalysisResult } from "@src/services/analysis";

export default function AnalysisPage() {
  const [result, setResult]     = useState<AnalysisResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleResult = (r: AnalysisResult) => {
    setResult(r);
    setApiError(null);
  };

  const handleResolve = async (id: string) => {
    const res = await analysisService.resolve(id);
    if (res.ok) {
      setResult(res.data);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── 상단 바 ────────────────────────────────────────────────────── */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4">
          <div className="flex items-center gap-2 text-primary">
            <BrainCircuit className="h-6 w-6" />
            <span className="text-lg font-bold tracking-tight">에듀렌즈</span>
          </div>
          <span className="hidden text-sm text-muted-foreground sm:block">
            AI 기반 학습 보조 도구
          </span>
        </div>
      </header>

      {/* ── 히어로 ───────────────────────────────────────────────────────── */}
      <section className="border-b border-border bg-edu-grid bg-grid py-14 text-center">
        <div className="container mx-auto px-4">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Gemini Vision 기반
          </div>

          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            학습 막힘을{" "}
            <span className="text-edu-gradient">지금 바로 진단하세요</span>
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
            워크스페이스 스크린샷을 올려보세요. 에듀렌즈가 무엇이 잘못됐는지 감지하고,
            소크라테스식 힌트로 앞으로 나아갈 수 있도록 안내합니다 — 정답은 직접 알려주지 않아요.
          </p>
        </div>
      </section>

      {/* ── 메인 콘텐츠 ──────────────────────────────────────────────────── */}
      <main className="container mx-auto px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
          {/* 업로드 패널 */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <History className="h-5 w-5 text-primary" />
              스크린샷 업로드
            </h2>

            <ImageUploader
              onResult={handleResult}
              onError={setApiError}
            />

            {apiError && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {apiError}
              </p>
            )}
          </div>

          {/* 결과 패널 */}
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <BrainCircuit className="h-5 w-5 text-primary" />
              분석 결과
            </h2>

            {result ? (
              <ResultDisplay result={result} onResolve={handleResolve} />
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-center">
                <BrainCircuit className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  스크린샷을 업로드하면 분석 결과가 여기에 표시됩니다.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
