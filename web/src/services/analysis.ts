/**
 * src/services/analysis.ts
 * ────────────────────────
 * Service layer that encapsulates every API call related to screen-capture
 * analysis.  Components import `analysisService` and never touch the raw
 * `apiClient` directly — this keeps network concerns out of the UI and makes
 * the service trivially mockable in tests.
 *
 * Backend contract (FastAPI endpoints assumed)
 * ────────────────────────────────────────────
 *   POST /analysis/upload          — multipart: field "file" (image/png)
 *   GET  /analysis/history         — returns AnalysisResult[]
 *   GET  /analysis/:id             — returns AnalysisResult
 *   POST /analysis/:id/resolve     — marks a stall as resolved
 */

import { apiClient } from "@src/lib/api-client";
import type { ApiResult } from "@src/lib/api-client";

// ─── Domain types ─────────────────────────────────────────────────────────────

/** Error category produced by the Gemini diagnostic engine. */
export type ErrorType = "syntax" | "tool_usage" | "config" | "unknown";

/** Status of a single stall event. */
export type AnalysisStatus = "stalled" | "critical" | "resolved";

/**
 * A single analysis result returned by the Python backend.
 * Mirrors the `practice_logs` row shape in Supabase.
 */
export interface AnalysisResult {
  /** Unique record ID (UUID from Supabase). */
  id: string;

  /** Raw OCR / vision output — the text Gemini identified as problematic. */
  detected_text: string;

  /** Human-readable one-line summary of the stall. */
  summary: string;

  /** ISO-8601 creation timestamp. */
  timestamp: string;

  // ── Extended fields (present after Gemini analysis) ──────────────────────

  /** Classified error category. */
  error_type?: ErrorType;

  /**
   * Bounding box of the problem area in the **original screenshot**.
   * Format: [ymin, xmin, ymax, xmax] on a 0–1000 scale.
   */
  problem_location?: [number, number, number, number];

  /** Level-1 Socratic hint (vague direction). */
  hint_level_1?: string;

  /** Level-2 Socratic hint (detailed explanation + fix). */
  hint_level_2?: string;

  /** Student who triggered the analysis. */
  student_id?: string;

  /** Name of the workspace tool that was active (e.g. "code", "pycharm"). */
  tool_name?: string;

  /** Current log status. */
  status?: AnalysisStatus;

  /** Public URL of the screenshot stored in Supabase Storage. */
  screenshot_url?: string;
}

/** Payload accepted by POST /analysis/upload */
interface UploadPayload {
  /** The student's current workspace tool (e.g. "code"). */
  tool_name?: string;
  /** Student identifier — defaults to the value stored in the Zustand store. */
  student_id?: string;
}

/** Paginated history response */
export interface HistoryPage {
  items: AnalysisResult[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const analysisService = {
  /**
   * Upload an image for Gemini analysis.
   *
   * Sends a multipart/form-data POST request; the backend runs the
   * Vision Diagnostic Engine, persists the result, and returns the full
   * `AnalysisResult` immediately.
   *
   * @param file      - PNG/JPEG screenshot to analyse.
   * @param meta      - Optional metadata appended to the form (student_id, tool_name).
   *
   * @example
   * const file = await captureScreen();        // returns a File/Blob
   * const result = await analysisService.requestAnalysis(file, {
   *   student_id: "student_42",
   *   tool_name:  "code",
   * });
   * if (result.ok) console.log(result.data.hint_level_1);
   */
  requestAnalysis(
    file: File,
    meta: UploadPayload = {},
  ): Promise<ApiResult<AnalysisResult>> {
    const form = new FormData();
    form.append("file", file, file.name);

    // Append optional metadata fields when provided
    if (meta.student_id) form.append("student_id", meta.student_id);
    if (meta.tool_name)  form.append("tool_name",  meta.tool_name);

    return apiClient.postForm<AnalysisResult>("/analysis/upload", form);
  },

  /**
   * Fetch the full analysis history, optionally filtered by student.
   *
   * @param studentId  - Filter to a specific student's records (optional).
   * @param page       - 1-based page index (default: 1).
   * @param pageSize   - Records per page (default: 20).
   *
   * @example
   * const result = await analysisService.getHistory("student_42");
   * if (result.ok) setLogs(result.data.items);
   */
  getHistory(
    studentId?: string,
    page = 1,
    pageSize = 20,
  ): Promise<ApiResult<HistoryPage>> {
    const params = new URLSearchParams({
      page:      String(page),
      page_size: String(pageSize),
    });
    if (studentId) params.set("student_id", studentId);

    return apiClient.get<HistoryPage>(`/analysis/history?${params.toString()}`);
  },

  /**
   * Fetch a single analysis record by its ID.
   *
   * @example
   * const result = await analysisService.getById("uuid-1234");
   * if (result.ok) showDetail(result.data);
   */
  getById(id: string): Promise<ApiResult<AnalysisResult>> {
    return apiClient.get<AnalysisResult>(`/analysis/${encodeURIComponent(id)}`);
  },

  /**
   * Mark a stall as resolved.
   * Persists a `status: "resolved"` record and triggers the confetti burst on
   * the desktop agent side via Supabase Realtime.
   *
   * @example
   * const result = await analysisService.resolve(log.id);
   * if (result.ok) refreshDashboard();
   */
  resolve(id: string): Promise<ApiResult<AnalysisResult>> {
    return apiClient.post<AnalysisResult>(
      `/analysis/${encodeURIComponent(id)}/resolve`,
      {},
    );
  },
} as const;
