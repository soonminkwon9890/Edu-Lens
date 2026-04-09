"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@src/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@src/components/ui/Card";
import { Badge } from "@src/components/ui/Badge";
import { Button } from "@src/components/ui/Button";
import type { AnalysisResult, ErrorType, AnalysisStatus } from "@src/services/analysis";

interface ResultDisplayProps {
  result: AnalysisResult;
  /** 사용자가 "해결 완료로 표시"를 클릭했을 때 호출됩니다. */
  onResolve?: (id: string) => void;
  className?: string;
}

// ── 레이블 헬퍼 ───────────────────────────────────────────────────────────────

const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  syntax:     "문법 오류",
  tool_usage: "도구 사용 오류",
  config:     "설정 오류",
  unknown:    "알 수 없음",
};

const STATUS_LABELS: Record<AnalysisStatus, string> = {
  stalled:  "막힘",
  critical: "위급",
  resolved: "해결됨",
};

const STATUS_ICONS: Record<AnalysisStatus, React.ReactNode> = {
  stalled:  <AlertTriangle className="h-3.5 w-3.5" />,
  critical: <AlertTriangle className="h-3.5 w-3.5" />,
  resolved: <CheckCircle2 className="h-3.5 w-3.5" />,
};

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

export function ResultDisplay({ result, onResolve, className }: ResultDisplayProps) {
  const [hintStage, setHintStage] = useState<0 | 1 | 2>(0);

  const {
    id, summary, detected_text, timestamp,
    error_type, status, hint_level_1, hint_level_2,
    tool_name, student_id,
  } = result;

  const formattedDate = new Date(timestamp).toLocaleString("ko-KR");

  return (
    <Card className={cn("overflow-hidden", className)}>
      {/* 헤더 */}
      <CardHeader className="bg-muted/30 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {error_type && (
              <Badge variant={error_type}>
                {ERROR_TYPE_LABELS[error_type]}
              </Badge>
            )}
            {status && (
              <Badge variant={status}>
                {STATUS_ICONS[status]}
                {STATUS_LABELS[status]}
              </Badge>
            )}
            {tool_name && (
              <Badge variant="outline">{tool_name}</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{formattedDate}</span>
        </div>

        <CardTitle className="mt-2 text-base">{summary}</CardTitle>

        {student_id && (
          <CardDescription>학생: {student_id}</CardDescription>
        )}
      </CardHeader>

      {/* 감지된 문제 */}
      <CardContent className="pt-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          감지된 문제
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
          {detected_text}
        </pre>
      </CardContent>

      {/* 소크라테스식 힌트 */}
      {(hint_level_1 || hint_level_2) && (
        <CardContent className="border-t border-border pt-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            소크라테스식 힌트
          </p>

          {/* 1단계 힌트 */}
          {hint_level_1 && (
            <div className="mb-2 rounded-lg border border-primary/20 bg-accent/30 p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setHintStage(hintStage === 1 ? 0 : 1)}
                aria-expanded={hintStage >= 1}
              >
                <span className="text-sm font-medium text-accent-foreground">
                  힌트 1단계 — 방향 제시
                </span>
                {hintStage >= 1
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {hintStage >= 1 && (
                <p className="mt-2 text-sm text-foreground">{hint_level_1}</p>
              )}
            </div>
          )}

          {/* 2단계 힌트 */}
          {hint_level_2 && hintStage >= 1 && (
            <div className="rounded-lg border border-secondary/20 bg-secondary/5 p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => setHintStage(hintStage === 2 ? 1 : 2)}
                aria-expanded={hintStage === 2}
              >
                <span className="text-sm font-medium text-secondary">
                  힌트 2단계 — 상세 설명
                </span>
                {hintStage === 2
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {hintStage === 2 && (
                <p className="mt-2 text-sm text-foreground">{hint_level_2}</p>
              )}
            </div>
          )}
        </CardContent>
      )}

      {/* 하단 — 해결 완료 액션 */}
      {onResolve && status !== "resolved" && (
        <CardFooter className="border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResolve(id)}
            className="gap-1.5 text-success hover:bg-success/10 hover:text-success"
          >
            <CheckCircle2 className="h-4 w-4" />
            해결 완료로 표시
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
