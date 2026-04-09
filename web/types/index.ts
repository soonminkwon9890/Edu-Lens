// ─── Shared domain types ─────────────────────────────────────────────────────

/** Status of a practice-log entry (mirrors Python backend / Supabase schema) */
export type LogStatus = "stalled" | "critical" | "resolved";

/** Error category returned by Gemini diagnostic engine */
export type ErrorType = "syntax" | "tool_usage" | "config" | "unknown";

/** A single practice-log record from Supabase */
export interface PracticeLog {
  id: string;
  student_id: string;
  tool_name: string;
  ai_hint: string;
  screenshot_url: string;
  status: LogStatus;
  created_at: string; // ISO-8601
}

/** Gemini diagnostic result returned by the Python backend */
export interface DiagnosticResult {
  error_type: ErrorType;
  /** [ymin, xmin, ymax, xmax] in 0–1000 scale, relative to the captured window */
  problem_location: [number, number, number, number];
  hint_level_1: string;
  hint_level_2: string;
}

/** Payload sent to POST /analyze */
export interface AnalyzeRequest {
  student_id: string;
  tool_name: string;
}

/** Full response from POST /analyze */
export interface AnalyzeResponse {
  diagnostic: DiagnosticResult;
  log: PracticeLog;
}

/** Payload sent to POST /resolve */
export interface ResolveRequest {
  student_id: string;
  tool_name: string;
}

// ─── API utility types ────────────────────────────────────────────────────────

export interface ApiError {
  status: number;
  message: string;
  detail?: unknown;
}

/** Generic wrapper for API responses */
export type ApiResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: ApiError };
