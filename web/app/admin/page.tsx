"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useUser, RedirectToSignIn, UserButton } from "@clerk/nextjs";

import {
  fetchInstructorSessions,
  fetchInstructorLogs,
  fetchInstructorStudents,
} from "@/app/actions";

import { MetricCard }           from "./_components/MetricCard";
import { ErrorLineChart }       from "./_components/ErrorLineChart";
import { ErrorPieChart }        from "./_components/ErrorPieChart";
import { StudentDirectoryCard } from "./_components/StudentDirectoryCard";
import { StudentTimeline }      from "./_components/StudentTimeline";

import type { ActiveSession, PracticeLog, StudentProfile } from "./_lib/types";
import { buildLineData, buildPieData } from "./_lib/utils";

// ─────────────────────────────────────────────────────────────────────────────

const FLASH_DURATION_MS = 4000;

// ── Small inline components ───────────────────────────────────────────────────

function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold
                  border transition-colors duration-500
                  ${connected
                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                    : "bg-muted/10 text-muted-foreground border-border"
                  }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          connected ? "bg-green-400 animate-pulse" : "bg-muted-foreground"
        }`}
      />
      {connected ? "자동 갱신 (30s)" : "연결 중…"}
    </span>
  );
}

function SectionHeading({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-foreground">{label}</h2>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground mb-4">
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage(): JSX.Element {
  const { user, isLoaded } = useUser();

  // ── Data state ────────────────────────────────────────────────────────────
  const [sessions,        setSessions]        = useState<ActiveSession[]>([]);
  const [logs,            setLogs]            = useState<PracticeLog[]>([]);
  const [studentProfiles, setStudentProfiles] = useState<StudentProfile[]>([]);
  const [connected,       setConnected]       = useState(false);
  const [loading,         setLoading]         = useState(true);

  /** IDs currently flashing (student IDs for directory card highlight). */
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  /** The student whose timeline is currently open; null = show directory. */
  const [timelineStudent, setTimelineStudent] = useState<{
    id:       string;
    nickname: string;
  } | null>(null);

  // Track seen IDs so we only flash on genuinely new rows.
  const knownSessionIds = useRef<Set<string>>(new Set());

  // ── Helpers ───────────────────────────────────────────────────────────────

  const flashId = useCallback((id: string) => {
    setNewIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, FLASH_DURATION_MS);
  }, []);

  // ── Data fetch (server actions bypass RLS) ────────────────────────────────
  //
  // Uses supabaseAdmin on the server side; polls every 30 s as a lightweight
  // realtime substitute (Supabase anon client is blocked by RLS because
  // auth.uid() is always null when using Clerk instead of Supabase Auth).

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      // 1. Sessions
      const fetchedSessions = (await fetchInstructorSessions()) as unknown as ActiveSession[];
      setSessions(fetchedSessions);

      fetchedSessions.forEach((s) => {
        if (!knownSessionIds.current.has(s.id)) {
          if (!isInitial) flashId(s.student_id); // flash the student's directory card
          knownSessionIds.current.add(s.id);
        }
      });

      // 2. Logs (scoped to the fetched sessions)
      if (fetchedSessions.length > 0) {
        const sessionIds    = fetchedSessions.map((s) => s.id);
        const fetchedLogs   = (await fetchInstructorLogs(sessionIds)) as unknown as PracticeLog[];
        setLogs(fetchedLogs);

        fetchedLogs.forEach((l) => {
          if (!knownSessionIds.current.has(`log-${l.id}`)) {
            if (!isInitial) flashId(l.student_id);
            knownSessionIds.current.add(`log-${l.id}`);
          }
        });
      }

      // 3. Student profiles (for the directory and the correct student count)
      const fetchedProfiles = (await fetchInstructorStudents()) as unknown as StudentProfile[];
      setStudentProfiles(fetchedProfiles);

      setConnected(true);
    } catch (err) {
      console.error("[Admin] fetch error:", err);
      setConnected(false);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [flashId]);

  useEffect(() => {
    void fetchData(true);
    const interval = setInterval(() => void fetchData(false), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const lineData = useMemo(() => buildLineData(logs), [logs]);
  const pieData  = useMemo(() => buildPieData(logs),  [logs]);

  /** Sessions with status active | stalled | critical (not resolved). */
  const activeSessions = useMemo(
    () => sessions.filter((s) =>
      s.status === "active" || s.status === "stalled" || s.status === "critical"
    ).length,
    [sessions],
  );
  const criticalCount = useMemo(
    () => sessions.filter((s) => s.status === "critical").length,
    [sessions],
  );

  /**
   * Set of student IDs that currently have at least one non-resolved session.
   * Used to show the "에듀렌즈 사용 중" indicator on directory cards.
   */
  const activeStudentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sessions) {
      if (s.status === "active" || s.status === "stalled" || s.status === "critical") {
        ids.add(s.student_id);
      }
    }
    return ids;
  }, [sessions]);

  /** Total interaction count per student_id (derived from fetched logs). */
  const interactionCountByStudent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of logs) {
      counts[log.student_id] = (counts[log.student_id] ?? 0) + 1;
    }
    return counts;
  }, [logs]);

  /** Most recent log timestamp per student_id. */
  const lastActiveByStudent = useMemo(() => {
    const times: Record<string, string> = {};
    for (const log of logs) {
      if (!times[log.student_id] || log.created_at > times[log.student_id]) {
        times[log.student_id] = log.created_at;
      }
    }
    return times;
  }, [logs]);

  // ── Auth / loading guard ──────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 rounded-full border-2 border-edu-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <RedirectToSignIn />;

  const displayName = user.firstName ?? user.username ?? "강사";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pt-16">

      {/* ── Sticky top header bar ── */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm
                      sticky top-16 z-20 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xl select-none">🎯</span>
            <div>
              <h1 className="font-bold text-foreground text-sm leading-tight">
                관리자 레이더
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {displayName} 강사 · 수강생 모니터링
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {criticalCount > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1
                           bg-red-500/15 border border-red-500/30 text-xs font-semibold
                           text-red-400 animate-pulse"
              >
                ⚠ {criticalCount}명 위급
              </span>
            )}
            {/* Correct count: unique student profiles, not sessions or log rows */}
            <span className="text-xs text-muted-foreground hidden sm:block">
              수강생 {loading ? "…" : studentProfiles.length}명
            </span>
            <LiveDot connected={connected} />
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </div>

      {/* ── Page body ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* ── Metrics ── */}
        <section>
          <SectionHeading
            label="학습 현황 요약"
            sub="현재 이 강사에게 배정된 수강생 기준"
          />
          <div className="flex gap-4 flex-wrap">
            <MetricCard
              label="담당 수강생"
              value={loading ? "…" : studentProfiles.length}
              sub="프로필 기준 총 인원"
              icon="👥"
              accent="default"
            />
            <MetricCard
              label="활성 세션"
              value={loading ? "…" : activeSessions}
              sub="현재 진행 중"
              icon="📋"
              accent="default"
            />
            <MetricCard
              label="현재 위급 상태"
              value={loading ? "…" : criticalCount}
              sub={criticalCount > 0 ? "즉시 확인 필요!" : "모든 학생 정상"}
              icon="🚨"
              accent={criticalCount > 0 ? "red" : "green"}
            />
          </div>
        </section>

        {/* ── Charts ── */}
        <section>
          <SectionHeading
            label="AI 코파일럿 상호작용"
            sub="내 수강생의 최근 7일 상호작용 빈도 및 유형 분포"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ChartCard title="일별 상호작용 빈도 (최근 7일)">
              <ErrorLineChart data={lineData} />
            </ChartCard>
            <ChartCard title="상호작용 유형 분포">
              <ErrorPieChart data={pieData} />
            </ChartCard>
          </div>
        </section>

        {/* ── Student directory / timeline ── */}
        <section>
          {timelineStudent ? (
            /* ── Individual student timeline ── */
            <StudentTimeline
              studentId={timelineStudent.id}
              nickname={timelineStudent.nickname}
              onBack={() => setTimelineStudent(null)}
            />
          ) : (
            /* ── Student directory grid ── */
            <>
              <SectionHeading
                label="수강생 디렉토리"
                sub="카드를 클릭하면 해당 수강생의 상호작용 타임라인을 볼 수 있습니다"
              />

              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-border bg-card p-4
                                 space-y-3 animate-pulse"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted/40" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-muted/40 rounded w-3/4" />
                          <div className="h-2.5 bg-muted/30 rounded w-1/2" />
                        </div>
                        <div className="h-5 w-10 bg-muted/30 rounded-full" />
                      </div>
                      <div className="flex justify-between">
                        <div className="h-2.5 bg-muted/20 rounded w-2/5" />
                        <div className="h-2.5 bg-muted/20 rounded w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : studentProfiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4
                               text-muted-foreground">
                  <span className="text-5xl opacity-25">📡</span>
                  <p className="text-sm">아직 배정된 수강생이 없습니다.</p>
                  <LiveDot connected={connected} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {studentProfiles.map((profile) => (
                    <StudentDirectoryCard
                      key={profile.id}
                      profile={profile}
                      interactionCount={interactionCountByStudent[profile.id] ?? 0}
                      lastActiveAt={lastActiveByStudent[profile.id] ?? null}
                      isNew={newIds.has(profile.id)}
                      isSessionActive={activeStudentIds.has(profile.id)}
                      onClick={() =>
                        setTimelineStudent({
                          id:       profile.id,
                          nickname: profile.nickname,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

      </div>
    </div>
  );
}
