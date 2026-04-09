/**
 * app-store.ts  — Zustand global store
 * ────────────────────────────────────
 * Manages client-side state that needs to be shared across the component tree:
 *  - Student identity (read from env / session)
 *  - Live analysis status
 *  - Notification queue
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { DiagnosticResult, LogStatus } from "@/types";

// ─── Types ─────────────────────────────────────────────────────────────────

export type NotificationKind = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  message?: string;
  createdAt: number;
}

export type AnalysisPhase =
  | "idle"       // nothing happening
  | "capturing"  // screenshot in progress
  | "analyzing"  // waiting for Gemini
  | "done"       // result ready
  | "error";     // something went wrong

interface AnalysisState {
  phase: AnalysisPhase;
  result: DiagnosticResult | null;
  logStatus: LogStatus | null;
  errorMessage: string | null;
}

interface AppState {
  // ── Student identity ──────────────────────────────────────────────────
  studentId: string;
  toolName: string;
  setStudentId: (id: string) => void;
  setToolName: (name: string) => void;

  // ── Analysis ──────────────────────────────────────────────────────────
  analysis: AnalysisState;
  setAnalysisPhase: (phase: AnalysisPhase) => void;
  setAnalysisResult: (result: DiagnosticResult, status: LogStatus) => void;
  setAnalysisError: (message: string) => void;
  resetAnalysis: () => void;

  // ── Notifications ─────────────────────────────────────────────────────
  notifications: Notification[];
  pushNotification: (n: Omit<Notification, "id" | "createdAt">) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;

  // ── Backend health ────────────────────────────────────────────────────
  backendOnline: boolean | null;   // null = not yet checked
  setBackendOnline: (online: boolean) => void;
}

// ─── Initial values ──────────────────────────────────────────────────────────

const initialAnalysis: AnalysisState = {
  phase:        "idle",
  result:       null,
  logStatus:    null,
  errorMessage: null,
};

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // ── Student identity ───────────────────────────────────────────────
      studentId: "student_demo",
      toolName:  "edu-lens",
      setStudentId: (id)   => set({ studentId: id },   false, "setStudentId"),
      setToolName:  (name) => set({ toolName: name },  false, "setToolName"),

      // ── Analysis ───────────────────────────────────────────────────────
      analysis: initialAnalysis,

      setAnalysisPhase: (phase) =>
        set(
          (s) => ({ analysis: { ...s.analysis, phase } }),
          false,
          "setAnalysisPhase",
        ),

      setAnalysisResult: (result, status) =>
        set(
          () => ({
            analysis: {
              phase: "done",
              result,
              logStatus: status,
              errorMessage: null,
            },
          }),
          false,
          "setAnalysisResult",
        ),

      setAnalysisError: (message) =>
        set(
          () => ({
            analysis: {
              phase: "error",
              result: null,
              logStatus: null,
              errorMessage: message,
            },
          }),
          false,
          "setAnalysisError",
        ),

      resetAnalysis: () =>
        set({ analysis: initialAnalysis }, false, "resetAnalysis"),

      // ── Notifications ──────────────────────────────────────────────────
      notifications: [],

      pushNotification: (n) =>
        set(
          (s) => ({
            notifications: [
              ...s.notifications,
              { ...n, id: crypto.randomUUID(), createdAt: Date.now() },
            ],
          }),
          false,
          "pushNotification",
        ),

      dismissNotification: (id) =>
        set(
          (s) => ({
            notifications: s.notifications.filter((n) => n.id !== id),
          }),
          false,
          "dismissNotification",
        ),

      clearNotifications: () =>
        set({ notifications: [] }, false, "clearNotifications"),

      // ── Backend health ─────────────────────────────────────────────────
      backendOnline: null,
      setBackendOnline: (online) =>
        set({ backendOnline: online }, false, "setBackendOnline"),
    }),
    { name: "EduLens" },
  ),
);
