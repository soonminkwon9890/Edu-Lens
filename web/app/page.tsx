import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import StudentDashboard from "@/components/student/StudentDashboard";
import type { ResolvedSession } from "@/components/student/RecentActivity";

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getStudentData(userId: string) {
  // Fetch profile (nickname + mentor_id)
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("nickname, mentor_id")
    .eq("id", userId)
    .maybeSingle();

  // No DB profile means the row was deleted after Clerk auth — re-run onboarding.
  if (!profile) redirect("/onboarding");

  const nickname = (profile as { nickname?: string } | null)?.nickname ?? "학생";
  const mentorId = (profile as { mentor_id?: string | null } | null)?.mentor_id ?? null;

  // Fetch mentor nickname (if linked)
  let mentorNickname: string | null = null;
  if (mentorId) {
    const { data: mentor } = await supabaseAdmin
      .from("profiles")
      .select("nickname")
      .eq("id", mentorId)
      .maybeSingle();
    mentorNickname = (mentor as { nickname?: string } | null)?.nickname ?? null;
  }

  // Fetch currently active (non-resolved) sessions to show persistent badges
  const { data: activeSessions } = await supabaseAdmin
    .from("active_sessions")
    .select("category")
    .eq("student_id", userId)
    .in("status", ["active", "stalled", "critical"]);

  const activeCategoryIds = (
    (activeSessions as Array<{ category: string }>) ?? []
  ).map((s) => s.category);

  // Fetch ALL resolved sessions — no limit; the UI groups and scrolls them.
  const { data: sessions } = await supabaseAdmin
    .from("active_sessions")
    .select("id, category, status, updated_at")
    .eq("student_id", userId)
    .eq("status", "resolved")
    .order("updated_at", { ascending: false });

  const sessionRows =
    (sessions as Array<{ id: string; category: string; status: string; updated_at: string }>) ?? [];

  // Single batch query for all practice_logs — replaces the previous N+1 pattern.
  // Logs are ordered newest-first; we keep only the first log seen per session_id.
  const latestLogBySession: Record<string, { error_type: string | null; ai_hint: string | null }> = {};

  if (sessionRows.length > 0) {
    const { data: logs } = await supabaseAdmin
      .from("practice_logs")
      .select("session_id, error_type, ai_hint, created_at")
      .in("session_id", sessionRows.map((s) => s.id))
      .order("created_at", { ascending: false });

    for (const log of (logs as Array<{
      session_id: string;
      error_type: string | null;
      ai_hint:    string | null;
      created_at: string;
    }>) ?? []) {
      if (!latestLogBySession[log.session_id]) {
        latestLogBySession[log.session_id] = {
          error_type: log.error_type,
          ai_hint:    log.ai_hint,
        };
      }
    }
  }

  const recentSessions: ResolvedSession[] = sessionRows.map((s) => ({
    id:         s.id,
    category:   s.category,
    status:     s.status,
    updated_at: s.updated_at,
    error_type: latestLogBySession[s.id]?.error_type ?? null,
    ai_hint:    latestLogBySession[s.id]?.ai_hint    ?? null,
  }));

  return { nickname, mentorId, mentorNickname, recentSessions, activeCategoryIds };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Page(): Promise<JSX.Element> {
  const { userId } = await auth();

  // Middleware should handle this, but guard defensively
  if (!userId) redirect("/sign-in");

  const { nickname, mentorId, mentorNickname, recentSessions, activeCategoryIds } =
    await getStudentData(userId);

  return (
    <StudentDashboard
      userId={userId}
      nickname={nickname}
      initialMentorId={mentorId}
      initialMentorNickname={mentorNickname}
      recentSessions={recentSessions}
      activeCategoryIds={activeCategoryIds}
    />
  );
}
