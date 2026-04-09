"use client";

/**
 * use-api.ts
 * ──────────
 * React hooks that wrap apiClient calls with loading / error state so
 * components stay free of fetch boilerplate.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useAppStore } from "@/store/app-store";
import type { AnalyzeResponse, PracticeLog } from "@/types";

// ─── useBackendHealth ─────────────────────────────────────────────────────────

/**
 * Polls GET /health on mount and sets `backendOnline` in the global store.
 * Re-checks every `intervalMs` milliseconds (default: 30 s).
 */
export function useBackendHealth(intervalMs = 30_000) {
  const setBackendOnline = useAppStore((s) => s.setBackendOnline);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const result = await apiClient.health();
      if (!cancelled) setBackendOnline(result.ok);
    }

    check();
    const id = setInterval(check, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs, setBackendOnline]);
}

// ─── useAnalyze ───────────────────────────────────────────────────────────────

interface UseAnalyzeReturn {
  trigger: () => Promise<AnalyzeResponse | null>;
  loading: boolean;
  error: string | null;
}

/**
 * Calls POST /analyze using the student identity from the global store.
 * Updates `analysis` state in the store on success/error.
 */
export function useAnalyze(): UseAnalyzeReturn {
  const studentId = useAppStore((s) => s.studentId);
  const toolName  = useAppStore((s) => s.toolName);
  const setPhase  = useAppStore((s) => s.setAnalysisPhase);
  const setResult = useAppStore((s) => s.setAnalysisResult);
  const setError  = useAppStore((s) => s.setAnalysisError);
  const push      = useAppStore((s) => s.pushNotification);

  const [loading, setLoading] = useState(false);
  const [error,   setLocalError] = useState<string | null>(null);

  const trigger = useCallback(async (): Promise<AnalyzeResponse | null> => {
    setLoading(true);
    setLocalError(null);
    setPhase("analyzing");

    const result = await apiClient.analyze({ student_id: studentId, tool_name: toolName });

    setLoading(false);

    if (!result.ok) {
      const msg = result.error.message;
      setLocalError(msg);
      setError(msg);
      push({ kind: "error", title: "Analysis failed", message: msg });
      return null;
    }

    const { diagnostic, log } = result.data;
    setResult(diagnostic, log.status);

    if (log.status === "critical") {
      push({
        kind: "warning",
        title: "Critical stall detected",
        message: `${studentId} has stalled ${3}+ times — instructor notified.`,
      });
    }

    return result.data;
  }, [studentId, toolName, setPhase, setResult, setError, push]);

  return { trigger, loading, error };
}

// ─── useStudentLogs ───────────────────────────────────────────────────────────

interface UseStudentLogsReturn {
  logs: PracticeLog[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Fetches GET /logs/:student_id and re-fetches when `studentId` changes. */
export function useStudentLogs(studentId: string): UseStudentLogsReturn {
  const [logs,    setLogs]    = useState<PracticeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const counter = useRef(0);

  const fetch = useCallback(async () => {
    if (!studentId) return;
    const run = ++counter.current;
    setLoading(true);
    setError(null);

    const result = await apiClient.getLogs(studentId);
    if (run !== counter.current) return; // stale request

    setLoading(false);
    if (result.ok) setLogs(result.data);
    else           setError(result.error.message);
  }, [studentId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { logs, loading, error, refresh: fetch };
}
