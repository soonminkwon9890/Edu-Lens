"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useUser, RedirectToSignIn, UserButton } from "@clerk/nextjs";

import { fetchInstructorSessions, fetchInstructorLogs } from "@/app/actions";

import { MetricCard }      from "./_components/MetricCard";
import { ErrorLineChart }  from "./_components/ErrorLineChart";
import { ErrorPieChart }   from "./_components/ErrorPieChart";
import { StudentCard }     from "./_components/StudentCard";
import { StudentModal }    from "./_components/StudentModal";

import type { ActiveSession, PracticeLog, StudentRecord } from "./_lib/types";
import { buildRecords, buildLineData, buildPieData } from "./_lib/utils";

// ─────────────────────────────────────────────────────────────────────────────

const FLASH_DURATION_MS = 4000;

// ── Small inline components ──────────────────────────────────────────────────

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

// ── Main page ────────────────────────────────────────────────────────────────

export default function AdminPage(): JSX.Element {
  const { user, isLoaded } = useUser();

  // ── Data state ───────────────────────────────────────────────────────────
  const [sessions,  setSessions]  = useState<ActiveSession[]>([]);
  const [logs,      setLogs]      = useState<PracticeLog[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [newIds,    setNewIds]    = useState<Set<string>>(new Set());
  const [selected,  setSelected]  = useState<StudentRecord | null>(null);

  // Track known session IDs so we can flash newly-arrived cards on each poll.
  const knownSessionIds = useRef<Set<string>>(new Set());

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Flash a card for FLASH_DURATION_MS then remove the glow. */
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


  // ── Data fetch via Server Actions (bypasses RLS) ─────────────────────────
  //
  // The anon Supabase client respects RLS. Because this app uses Clerk (not
  // Supabase Auth), auth.uid() is always null on the DB side, so RLS blocks
  // all reads. Server Actions use supabaseAdmin (service role) instead.
  //
  // We poll every 30 s as a lightweight realtime substitute.

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const fetchedSessions = (await fetchInstructorSessions()) as unknown as ActiveSession[];
      setSessions(fetchedSessions);

      // Flash cards that weren't in the previous poll result.
      fetchedSessions.forEach((s) => {
        if (!knownSessionIds.current.has(s.id)) {
          if (!isInitial) flashId(s.id);
          knownSessionIds.current.add(s.id);
        }
      });

      if (fetchedSessions.length > 0) {
        const sessionIds = fetchedSessions.map((s) => s.id);
        const fetchedLogs = (await fetchInstructorLogs(sessionIds)) as unknown as PracticeLog[];
        setLogs(fetchedLogs);

        // Flash cards whose session received a new log since the last poll.
        fetchedLogs.forEach((l) => {
          if (!knownSessionIds.current.has(`log-${l.id}`)) {
            if (!isInitial) flashId(l.session_id);
            knownSessionIds.current.add(`log-${l.id}`);
          }
        });
      }

      setConnected(true);
    } catch (err) {
      console.error("[Admin] fetch error:", err);
      setConnected(false);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [flashId]);

  // Initial load + 30-second polling interval.
  useEffect(() => {
    void fetchData(true);
    const interval = setInterval(() => void fetchData(false), 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Derived data (memoised) ───────────────────────────────────────────────
  const records   = useMemo(() => buildRecords(sessions, logs),    [sessions, logs]);
  const lineData  = useMemo(() => buildLineData(logs),              [logs]);
  const pieData   = useMemo(() => buildPieData(logs),               [logs]);

  const activeSessions = useMemo(
    () => sessions.filter((s) => s.status !== "resolved").length,
    [sessions],
  );
  const criticalCount = useMemo(
    () => sessions.filter((s) => s.status === "critical").length,
    [sessions],
  );

  const pinnedRecords = records.filter((r) => r.isPinned);
  const normalRecords = records.filter((r) => !r.isPinned);

  // ── Auth / loading guard ─────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 rounded-full border-2 border-edu-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <RedirectToSignIn />;

  const displayName = user.firstName ?? user.username ?? "강사";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pt-16">

      {/* ── Top header bar ── */}
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
            <span className="text-xs text-muted-foreground hidden sm:block">
              수강생 {records.length}명
            </span>
            <LiveDot connected={connected} />
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </div>

      {/* ── Page body ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* ── Analytics metrics ── */}
        <section>
          <SectionHeading
            label="학습 현황 요약"
            sub="현재 이 강사에게 배정된 수강생 기준"
          />
          <div className="flex gap-4 flex-wrap">
            <MetricCard
              label="활성 수강생"
              value={loading ? "…" : activeSessions}
              sub="현재 세션 진행 중"
              icon="👥"
              accent="default"
            />
            <MetricCard
              label="누적 실습 세션"
              value={loading ? "…" : sessions.length}
              sub="전체 기간 합산"
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

        {/* ── Pinned / critical section ── */}
        {pinnedRecords.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-sm font-bold text-red-400 tracking-widest uppercase">
                막힘 경보
              </h2>
              <span className="text-xs text-muted-foreground ml-1">
                — 위급 또는 막힘 3회 이상
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pinnedRecords.map((r) => (
                <StudentCard
                  key={r.session.id}
                  record={r}
                  isNew={newIds.has(r.session.id)}
                  onClick={() => setSelected(r)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Divider ── */}
        {pinnedRecords.length > 0 && normalRecords.length > 0 && (
          <div className="border-t border-border" />
        )}

        {/* ── Normal students section ── */}
        <section>
          <div className="flex items-center gap-2 mb-5">
            <span className="w-2 h-2 rounded-full bg-edu-400" />
            <h2 className="text-sm font-bold text-muted-foreground tracking-widest uppercase">
              활성 수강생
            </h2>
            {normalRecords.length > 0 && (
              <span className="text-xs text-muted-foreground ml-1">
                — {normalRecords.length}개 세션
              </span>
            )}
          </div>

          {loading ? (
            /* Skeleton grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-card p-4 space-y-3 animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted/40" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-muted/40 rounded w-3/4" />
                      <div className="h-2.5 bg-muted/30 rounded w-1/2" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2.5 bg-muted/30 rounded w-full" />
                    <div className="h-2.5 bg-muted/30 rounded w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : normalRecords.length === 0 && pinnedRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
              <span className="text-5xl opacity-25">📡</span>
              <p className="text-sm">수강생 활동을 기다리는 중…</p>
              <LiveDot connected={connected} />
            </div>
          ) : normalRecords.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              모든 활성 수강생이 막힘 경보 구역에 있습니다.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {normalRecords.map((r) => (
                <StudentCard
                  key={r.session.id}
                  record={r}
                  isNew={newIds.has(r.session.id)}
                  onClick={() => setSelected(r)}
                />
              ))}
            </div>
          )}
        </section>

      </div>

      {/* ── Detail modal ── */}
      {selected && (
        <StudentModal
          record={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
