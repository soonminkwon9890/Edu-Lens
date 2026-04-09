/**
 * api-client.ts
 * ─────────────
 * Type-safe HTTP client for the EduLens Python backend (FastAPI, port 8000).
 *
 * Design decisions:
 *  - Built on the native Fetch API — no extra dependencies.
 *  - Every method returns `ApiResult<T>` so callers never need try/catch.
 *  - A configurable timeout is enforced via AbortController.
 *  - Request/response bodies are always JSON.
 *
 * Usage:
 *   const result = await apiClient.analyze({ student_id: "s1", tool_name: "code" });
 *   if (result.ok) console.log(result.data);
 *   else           console.error(result.error.message);
 */

import { API_BASE_URL, API_TIMEOUT_MS } from "@/lib/constants";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ApiError,
  ApiResult,
  PracticeLog,
  ResolveRequest,
} from "@/types";

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
    });

    clearTimeout(timer);

    // Parse body regardless of status — the backend may include error detail
    let body: unknown;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    if (!response.ok) {
      const apiError: ApiError = {
        status: response.status,
        message:
          typeof body === "object" && body !== null && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : response.statusText,
        detail: body,
      };
      return { ok: false, error: apiError };
    }

    return { ok: true, data: body as T };
  } catch (err) {
    clearTimeout(timer);

    const isAbort = err instanceof DOMException && err.name === "AbortError";
    return {
      ok: false,
      error: {
        status: isAbort ? 408 : 0,
        message: isAbort
          ? `Request timed out after ${timeoutMs}ms`
          : err instanceof Error
            ? err.message
            : "Unknown network error",
      },
    };
  }
}

// ─── Typed API surface ────────────────────────────────────────────────────────

export const apiClient = {
  /**
   * POST /analyze
   * Trigger the Gemini diagnostic engine for the given student session.
   * The Python backend captures the screen, calls Gemini, persists the log,
   * and returns the result.
   */
  analyze(body: AnalyzeRequest): Promise<ApiResult<AnalyzeResponse>> {
    return request<AnalyzeResponse>("/analyze", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * POST /resolve
   * Mark the current stall as resolved — logs a `status: "resolved"` event.
   */
  resolve(body: ResolveRequest): Promise<ApiResult<{ ok: boolean }>> {
    return request<{ ok: boolean }>("/resolve", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * GET /logs/:student_id
   * Retrieve the full practice-log history for a student.
   */
  getLogs(studentId: string): Promise<ApiResult<PracticeLog[]>> {
    return request<PracticeLog[]>(`/logs/${encodeURIComponent(studentId)}`);
  },

  /**
   * GET /health
   * Check that the Python backend is reachable.
   */
  health(): Promise<ApiResult<{ status: string }>> {
    return request<{ status: string }>("/health", {}, 5_000);
  },
} as const;
