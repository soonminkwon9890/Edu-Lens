export type LogStatus = "stalled" | "critical" | "resolved";

export interface PracticeLog {
  id: string;
  student_id: string;
  tool_name: string;
  ai_hint: string;
  screenshot_url: string;
  status: LogStatus;
  created_at: string; // ISO-8601
}

/** Grouped view: latest log + full history per student */
export interface StudentSummary {
  student_id: string;
  latest: PracticeLog;
  history: PracticeLog[];
  /** true when latest.status === 'critical' OR stalled > 5 min */
  isPinned: boolean;
}

// Supabase generic DB type (minimal — extend as your schema grows)
export interface Database {
  public: {
    Tables: {
      practice_logs: {
        Row: PracticeLog;
        Insert: Omit<PracticeLog, "id" | "created_at">;
        Update: Partial<Omit<PracticeLog, "id">>;
      };
    };
  };
}
