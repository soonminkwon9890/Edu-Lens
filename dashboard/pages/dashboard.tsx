import Head from "next/head";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { groupByStudent } from "@/lib/utils";
import type { PracticeLog, StudentSummary } from "@/types/database";
import StudentCard from "@/components/StudentCard";
import StudentModal from "@/components/StudentModal";
import LiveBadge from "@/components/LiveBadge";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

const PAGE_SIZE = 100; // initial fetch limit

export default function Dashboard(): JSX.Element {
  const [logs, setLogs] = useState<PracticeLog[]>([]);
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ── Derive summaries whenever logs change ───────────────────────────
  useEffect(() => {
    setSummaries(groupByStudent(logs));
  }, [logs]);

  // ── Upsert a single log into the flat list ──────────────────────────
  const upsertLog = useCallback((incoming: PracticeLog): void => {
    setLogs((prev: PracticeLog[]) => {
      const idx = prev.findIndex((l: PracticeLog) => l.id === incoming.id);
      if (idx === -1) return [incoming, ...prev];
      const next = [...prev];
      next[idx] = incoming;
      return next;
    });
  }, []);

  // ── Initial fetch ───────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("practice_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE)
      .then(
        ({
          data,
          error,
        }: {
          data: PracticeLog[] | null;
          error: { message: string } | null;
        }) => {
          if (error) {
            console.error("[Supabase] initial fetch error:", error.message);
            return;
          }
          setLogs(data ?? []);
        }
      );
  }, []);

  // ── Real-time subscription ──────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("practice_logs_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "practice_logs" },
        (payload: RealtimePostgresChangesPayload<Partial<PracticeLog>>) => {
          const log = payload.new as PracticeLog;
          upsertLog(log);
          // Flash highlight for 3 s
          setNewIds((prev: Set<string>) => new Set(prev).add(log.id));
          setTimeout(() => {
            setNewIds((prev: Set<string>) => {
              const next = new Set(prev);
              next.delete(log.id);
              return next;
            });
          }, 3000);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "practice_logs" },
        (payload: RealtimePostgresChangesPayload<Partial<PracticeLog>>) => {
          upsertLog(payload.new as PracticeLog);
        }
      )
      .subscribe((status: string) => {
        setConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [upsertLog]);

  // ── Split into pinned / normal ──────────────────────────────────────
  const pinned = summaries.filter((s: StudentSummary) => s.isPinned);
  const normal = summaries.filter((s: StudentSummary) => !s.isPinned);

  const totalCritical = pinned.filter(
    (s: StudentSummary) => s.latest.status === "critical"
  ).length;

  return (
    <>
      <Head>
        <title>에듀렌즈 · 관리자 레이더</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-radar-bg font-sans">
        {/* ── Top nav ── */}
        <header className="sticky top-0 z-30 border-b border-radar-border
                           bg-radar-bg/80 backdrop-blur-md px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xl select-none">🎯</span>
              <div>
                <h1 className="font-bold text-radar-text text-base leading-tight">
                  학습 현황 레이더
                </h1>
                <p className="text-[11px] text-radar-subtext">에듀렌즈 · 실시간 모니터</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {totalCritical > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full
                                 bg-red-500/15 border border-red-500/30 px-3 py-1
                                 text-xs font-semibold text-red-400 animate-pulse">
                  ⚠ {totalCritical}명 위급
                </span>
              )}
              <span className="text-xs text-radar-subtext hidden sm:block">
                학생 {summaries.length}명
              </span>
              <LiveBadge connected={connected} />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">

          {/* ── Stall Alert section ── */}
          {pinned.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <h2 className="text-sm font-bold text-red-400 tracking-widest uppercase">
                  막힘 경보
                </h2>
                <span className="text-xs text-radar-muted ml-1">
                  — 위급 또는 5분 이상 정체
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinned.map((s: StudentSummary) => (
                  <div
                    key={s.student_id}
                    className={`rounded-2xl transition-all duration-500 ${
                      newIds.has(s.latest.id)
                        ? "ring-2 ring-radar-accent ring-offset-2 ring-offset-radar-bg"
                        : ""
                    }`}
                  >
                    <StudentCard
                      summary={s}
                      onClick={() => setSelected(s)}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Divider when both sections visible ── */}
          {pinned.length > 0 && normal.length > 0 && (
            <div className="border-t border-radar-border" />
          )}

          {/* ── Active students section ── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-radar-accent" />
              <h2 className="text-sm font-bold text-radar-subtext tracking-widest uppercase">
                활성 학생
              </h2>
              {normal.length > 0 && (
                <span className="text-xs text-radar-muted ml-1">
                  — {normal.length}개 세션
                </span>
              )}
            </div>

            {normal.length === 0 && pinned.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4
                              text-radar-muted">
                <span className="text-5xl opacity-30">📡</span>
                <p className="text-sm">학생 활동을 기다리는 중…</p>
                <LiveBadge connected={connected} />
              </div>
            ) : normal.length === 0 ? (
              <p className="text-sm text-radar-muted py-4">
                모든 활성 학생이 막힘 경보 구역에 있습니다.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {normal.map((s: StudentSummary) => (
                  <div
                    key={s.student_id}
                    className={`rounded-2xl transition-all duration-500 ${
                      newIds.has(s.latest.id)
                        ? "ring-2 ring-radar-accent ring-offset-2 ring-offset-radar-bg"
                        : ""
                    }`}
                  >
                    <StudentCard
                      summary={s}
                      onClick={() => setSelected(s)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* ── Detail modal ── */}
      {selected && (
        <StudentModal
          summary={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
