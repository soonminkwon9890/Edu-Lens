// ── Primitive types ──────────────────────────────────────────────────────────

/** Mutable state of an active_sessions row. */
export type SessionStatus = "active" | "stalled" | "critical" | "resolved";

/** Error category produced by the Gemini diagnostic engine. */
export type ErrorType = "syntax" | "tool_usage" | "config" | "unknown";

// ── Domain interfaces ────────────────────────────────────────────────────────

/** mirrors public.profiles */
export interface Profile {
  id:         string;
  role:       "instructor" | "student";
  nickname:   string;
  mentor_id:  string | null; // null for instructors
  created_at: string;        // ISO-8601
}

/** mirrors public.active_sessions */
export interface ActiveSession {
  id:         string;
  student_id: string;
  mentor_id:  string;
  category:   string;        // tool / subject (e.g. "VS Code", "Python")
  status:     SessionStatus;
  started_at: string;        // ISO-8601
  updated_at: string;        // ISO-8601 — auto-updated by DB trigger
}

/**
 * mirrors public.practice_logs
 * Immutable event entry. One row per Gemini stall detection.
 * Status lives on active_sessions, not here.
 */
export interface PracticeLog {
  id:             string;
  student_id:     string;
  session_id:     string;          // FK → active_sessions.id
  error_type:     ErrorType | null;
  ai_hint:        string | null;
  screenshot_url: string | null;
  created_at:     string;          // ISO-8601
}

/**
 * Joined view used by the dashboard UI.
 * Built client-side from active_sessions + practice_logs queries.
 */
export interface StudentSummary {
  student_id: string;
  session:    ActiveSession;
  logs:       PracticeLog[];
  /**
   * The most-recent practice_logs entry for this session.
   * Used to preview the latest hint / screenshot in the card.
   * Null when the session has no logs yet (status still 'active').
   */
  latest_log: PracticeLog | null;
  /** Convenience alias: session.status */
  status:     SessionStatus;
  /**
   * true when status is 'critical', OR the session has been stalled/critical
   * for more than 5 minutes without resolution.
   */
  isPinned:   boolean;
}

// ── Supabase Database type ────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row:    Profile;
        Insert: Omit<Profile, "created_at">;
        Update: Partial<Omit<Profile, "id" | "created_at">>;
      };
      active_sessions: {
        Row:    ActiveSession;
        Insert: Omit<ActiveSession, "id" | "started_at" | "updated_at">;
        Update: Partial<Omit<ActiveSession, "id" | "student_id" | "started_at">>;
      };
      practice_logs: {
        Row:    PracticeLog;
        Insert: Omit<PracticeLog, "id" | "created_at">;
        // Logs are immutable — only screenshot_url can be patched in rare cases.
        Update: Pick<PracticeLog, "screenshot_url">;
      };
    };
  };
}
