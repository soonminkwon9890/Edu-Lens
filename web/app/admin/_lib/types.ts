// ── Primitive types ───────────────────────────────────────────────────────────

export type SessionStatus = "active" | "stalled" | "critical" | "resolved";
export type ErrorType     = "syntax" | "tool_usage" | "config" | "unknown";

// ── Database row mirrors ───────────────────────────────────────────────────────

export interface ActiveSession {
  id:         string;
  student_id: string;
  mentor_id:  string;
  category:   string;
  status:     SessionStatus;
  started_at: string; // ISO-8601
  updated_at: string; // ISO-8601
}

export interface PracticeLog {
  id:             string;
  student_id:     string;
  session_id:     string;
  /** Includes legacy English keys (syntax/tool_usage/config) and Korean labels
   *  (선제적 조언, 질의응답) added after the proactive-logging update. */
  error_type:     string | null;
  ai_hint:        string | null;
  screenshot_url: string | null;
  created_at:     string; // ISO-8601
}

/** practice_log row with the parent session's category joined in. */
export interface PracticeLogWithCategory extends PracticeLog {
  category: string;
}

/** A student profile row from the `profiles` table. */
export interface StudentProfile {
  id:        string;
  nickname:  string;
  role:      string;
  mentor_id: string | null;
}

// ── Derived view model ────────────────────────────────────────────────────────

export interface StudentRecord {
  session:     ActiveSession;
  /** All logs for this session, newest-first. */
  logs:        PracticeLog[];
  /** Convenience: logs[0] ?? null */
  latest_log:  PracticeLog | null;
  /** Number of logs that carry an error_type (i.e. real stall events). */
  stall_count: number;
  /** true when status is 'critical' OR stall_count >= 3 */
  isPinned:    boolean;
}

// ── Chart shapes ──────────────────────────────────────────────────────────────

export interface DayCount  { date: string; count: number }
export interface TypeSlice { name: string; value: number }
