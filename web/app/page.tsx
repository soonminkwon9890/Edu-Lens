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

  // Fetch recent resolved sessions (last 5)
  // Join with practice_logs to get the latest error_type per session
  const { data: sessions } = await supabaseAdmin
    .from("active_sessions")
    .select("id, category, status, updated_at")
    .eq("student_id", userId)
    .eq("status", "resolved")
    .order("updated_at", { ascending: false })
    .limit(5);

  // For each resolved session, grab the latest practice_log's error_type
  const recentSessions: ResolvedSession[] = await Promise.all(
    ((sessions as Array<{ id: string; category: string; status: string; updated_at: string }>) ?? [])
      .map(async (s) => {
        const { data: log } = await supabaseAdmin
          .from("practice_logs")
          .select("error_type")
          .eq("session_id", s.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          id:         s.id,
          category:   s.category,
          status:     s.status,
          updated_at: s.updated_at,
          error_type: (log as { error_type?: string | null } | null)?.error_type ?? null,
        };
      }),
  );

  return { nickname, mentorId, mentorNickname, recentSessions };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Page(): Promise<JSX.Element> {
  const { userId } = await auth();

  // Middleware should handle this, but guard defensively
  if (!userId) redirect("/sign-in");

  const { nickname, mentorId, mentorNickname, recentSessions } =
    await getStudentData(userId);

  return (
    <StudentDashboard
      userId={userId}
      nickname={nickname}
      initialMentorId={mentorId}
      initialMentorNickname={mentorNickname}
      recentSessions={recentSessions}
    />
  );
}
