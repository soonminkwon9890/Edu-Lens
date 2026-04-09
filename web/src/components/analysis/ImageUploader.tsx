"use client";

import React, { useCallback, useRef, useState } from "react";
import { Upload, ImageIcon, X } from "lucide-react";
import { cn } from "@src/lib/utils";
import { Button } from "@src/components/ui/Button";
import { analysisService, type AnalysisResult } from "@src/services/analysis";

interface ImageUploaderProps {
  /** 백엔드 응답이 성공했을 때 분석 결과와 함께 호출됩니다. */
  onResult: (result: AnalysisResult) => void;
  /** 백엔드에서 오류가 반환됐을 때 호출됩니다. */
  onError?: (message: string) => void;
  className?: string;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE_MB = 10;

export function ImageUploader({ onResult, onError, className }: ImageUploaderProps) {
  const [file, setFile]         = useState<File | null>(null);
  const [preview, setPreview]   = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setLocalError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const acceptFile = useCallback((f: File) => {
    setLocalError(null);

    if (!ACCEPTED_TYPES.includes(f.type)) {
      setLocalError("PNG, JPEG, WebP 이미지만 지원합니다.");
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setLocalError(`파일 크기는 ${MAX_SIZE_MB} MB 이하여야 합니다.`);
      return;
    }

    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  // ── 드래그 앤 드롭 ─────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) acceptFile(dropped);
  };

  // ── 파일 입력 ──────────────────────────────────────────────────────────

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) acceptFile(selected);
  };

  // ── 제출 ───────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!file) return;

    setLoading(true);
    setLocalError(null);

    const result = await analysisService.requestAnalysis(file);

    setLoading(false);

    if (result.ok) {
      onResult(result.data);
    } else {
      const msg = result.error.message;
      setLocalError(msg);
      onError?.(msg);
    }
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* 드롭 영역 */}
      <div
        role="button"
        tabIndex={0}
        aria-label="분석할 이미지를 업로드하세요"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={cn(
          "relative flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3",
          "rounded-xl border-2 border-dashed transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragging
            ? "border-primary bg-accent"
            : "border-border bg-muted/40 hover:border-primary/50 hover:bg-accent/50",
        )}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="미리보기"
              className="max-h-64 max-w-full rounded-lg object-contain"
            />
            <button
              type="button"
              aria-label="이미지 제거"
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="absolute right-2 top-2 rounded-full bg-background/80 p-1 shadow hover:bg-background"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <div className="rounded-full bg-primary/10 p-4">
              {dragging ? (
                <ImageIcon className="h-8 w-8 text-primary" />
              ) : (
                <Upload className="h-8 w-8 text-primary" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {dragging ? "여기에 놓으세요" : "드래그 앤 드롭 또는 클릭하여 업로드"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PNG, JPEG, WebP · 최대 {MAX_SIZE_MB} MB
              </p>
            </div>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="hidden"
        onChange={onInputChange}
      />

      {/* 유효성 오류 */}
      {localError && (
        <p className="text-sm text-destructive" role="alert">
          {localError}
        </p>
      )}

      {/* 분석 버튼 */}
      <Button
        onClick={handleAnalyze}
        disabled={!file}
        loading={loading}
        size="lg"
        className="w-full"
      >
        {loading ? "분석 중…" : "이미지 분석하기"}
      </Button>
    </div>
  );
}
