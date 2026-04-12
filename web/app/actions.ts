"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-server";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InstructorResult {
  id: string;
  nickname: string;
}

export interface SessionResult {
  sessionId: string;
  mentorId: string;
}

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Full-text search for instructors by nickname.
 * Safe to call without auth — instructor nicknames are not sensitive.
 */
export async function searchInstructors(
  query: string,
): Promise<InstructorResult[]> {
  if (!query.trim()) return [];

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, nickname")
    .eq("role", "instructor")
    .ilike("nickname", `%${query.trim()}%`)
    .limit(10);

  if (error) throw new Error(error.message);
  return (data as InstructorResult[]) ?? [];
}

/**
 * Link the current student to a mentor.
 * Triggers a server-side revalidation so the page reflects the change.
 */
export async function setMentor(mentorId: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ mentor_id: mentorId })
    .eq("id", userId);

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/**
 * Look up (or create) an active_sessions row for the given category.
 *
 * Rules:
 *  - If a non-resolved session already exists for this (student, category),
 *    return its id to avoid duplicate rows.
 *  - Otherwise INSERT a fresh 'active' session.
 *
 * Throws "MENTOR_NOT_SET" if the student hasn't linked a mentor yet
 * (active_sessions.mentor_id is NOT NULL in the schema).
 */
export async function createSession(category: string): Promise<SessionResult> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  // Fetch mentor_id from the student's profile
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("mentor_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.mentor_id) throw new Error("MENTOR_NOT_SET");

  const mentorId = profile.mentor_id as string;

  // Re-use an existing open session for this category
  const { data: existing } = await supabaseAdmin
    .from("active_sessions")
    .select("id")
    .eq("student_id", userId)
    .eq("category", category)
    .in("status", ["active", "stalled", "critical"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { sessionId: existing.id as string, mentorId };
  }

  // No open session — create one
  const { data: newSession, error: insertError } = await supabaseAdmin
    .from("active_sessions")
    .insert({
      student_id: userId,
      mentor_id:  mentorId,
      category,
      status:     "active",
    })
    .select("id")
    .single();

  if (insertError || !newSession) {
    throw new Error(insertError?.message ?? "Failed to create session");
  }

  return { sessionId: newSession.id as string, mentorId };
}

/**
 * Mark an active session as resolved.
 * Called when the student clicks "Stop" in the WebEduLensCapture widget.
 */
export async function resolveSession(sessionId: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const { error } = await supabaseAdmin
    .from("active_sessions")
    .update({ status: "resolved" })
    .eq("id", sessionId)
    .eq("student_id", userId); // safety: only the owning student can resolve

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

// ── Admin dashboard data (service-role, bypasses RLS) ───────────────────────

/**
 * Fetch all active_sessions assigned to the authenticated instructor.
 * Uses supabaseAdmin so RLS is bypassed — safe because auth() already gates access.
 */
export async function fetchInstructorSessions(): Promise<Record<string, unknown>[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const { data, error } = await supabaseAdmin
    .from("active_sessions")
    .select("*")
    .eq("mentor_id", userId)
    .order("started_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]) ?? [];
}

/**
 * Fetch all practice_logs for the given session IDs.
 * Must be called after fetchInstructorSessions to scope logs to the instructor.
 */
export async function fetchInstructorLogs(
  sessionIds: string[],
): Promise<Record<string, unknown>[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  if (sessionIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("practice_logs")
    .select("*")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]) ?? [];
}

/**
 * Fetch all student profiles assigned to the authenticated instructor.
 * Queries `profiles` where role = '학생' AND mentor_id = instructorId.
 */
export async function fetchInstructorStudents(): Promise<Record<string, unknown>[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, nickname, role, mentor_id")
    .eq("role", "학생")
    .eq("mentor_id", userId)
    .order("nickname", { ascending: true });

  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]) ?? [];
}

/**
 * Fetch all practice_logs for a specific student, including the session's category.
 * Scoped to the authenticated instructor — returns [] if the student doesn't belong to them.
 */
export async function fetchStudentLogs(studentId: string): Promise<Record<string, unknown>[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  // Security: verify the student is assigned to this instructor
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", studentId)
    .eq("mentor_id", userId)
    .maybeSingle();

  if (!profile) return [];

  const { data, error } = await supabaseAdmin
    .from("practice_logs")
    .select("*, active_sessions(category)")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Flatten the join: promote active_sessions.category to top-level
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((row: any) => {
    const { active_sessions, ...rest } = row as Record<string, unknown> & {
      active_sessions: { category: string } | null;
    };
    return { ...rest, category: active_sessions?.category ?? "general" };
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────────

/**
 * Save nickname + role for a user who signed up via OAuth (Google/GitHub)
 * and therefore bypassed the custom sign-up form.
 *
 * 1. Updates Clerk publicMetadata so the JWT carries the role on the next
 *    refresh (sessionClaims.metadata.role / .nickname).
 * 2. Upserts the Supabase profiles row so the rest of the app can query it.
 *
 * Called by the /onboarding client component.  After this resolves, the
 * caller should invoke `session.reload()` from useClerk() to force a fresh
 * JWT before navigating away, otherwise the middleware will redirect back.
 */
// ── Onboarding result discriminated union ────────────────────────────────────

export type OnboardingResult =
  | { success: true;  role: "instructor" | "student" }
  | { success: false; error: string };

/**
 * Save nickname + role for users who signed up via OAuth and bypassed the
 * custom sign-up form.
 *
 * Returns a plain result object instead of throwing so the client component
 * can handle errors without losing control of its loading state.
 *
 * Steps:
 *   1. Validate inputs server-side.
 *   2. Call Clerk's `updateUserMetadata` to write { role, nickname } into
 *      publicMetadata — the JWT carries these on the next refresh.
 *   3. Upsert the Supabase `profiles` row (idempotent; handles the race where
 *      the webhook already created the row before onboarding completed).
 */
export async function saveOnboarding(data: {
  nickname: string;
  role:     "instructor" | "student";
}): Promise<OnboardingResult> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "인증되지 않은 사용자입니다." };

  const { nickname, role } = data;
  const trimmed = nickname.trim();

  if (!trimmed)                                    return { success: false, error: "닉네임을 입력해 주세요." };
  if (role !== "instructor" && role !== "student") return { success: false, error: "올바른 역할을 선택해 주세요." };

  try {
    // 1. Write role + nickname into Clerk publicMetadata.
    //    The JWT will carry these fields after the client calls user.reload().
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { role, nickname: trimmed },
    });

    // 2. Upsert the profiles row — safe to re-run if the webhook already fired.
    const { error: dbError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, role, nickname: trimmed },
        { onConflict: "id" },
      );

    if (dbError) {
      console.error("[saveOnboarding] Supabase upsert failed:", dbError.message);
      return { success: false, error: "프로필 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
    }

    revalidatePath("/");
    return { success: true, role };

  } catch (err) {
    console.error("[saveOnboarding] Unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
    };
  }
}
