"use server";

import { auth } from "@clerk/nextjs/server";
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
