import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * Server-side guard for the /onboarding route.
 *
 * Two cases where a user legitimately needs /onboarding:
 *   A) New OAuth sign-up — no Clerk role yet (middleware already sends them here).
 *   B) Ghost user — Clerk role exists but their Supabase profile was deleted
 *      (the page-level auth guard in / and /admin sends them here).
 *
 * Once a user has BOTH a Clerk role AND a valid Supabase profile they are
 * fully onboarded; redirect them to their home page instead of showing the
 * form again.
 *
 * Previously this logic lived in middleware.ts, but that caused an infinite
 * loop for ghost users: page guard → /onboarding, middleware → back to home,
 * page guard → /onboarding, …
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, sessionClaims } = await auth();

  // Unauthenticated users shouldn't reach here (middleware handles it), but
  // guard defensively so the Supabase query below is never called with null.
  if (!userId) redirect("/sign-in");

  const role = (sessionClaims as { metadata?: { role?: string } } | null)
    ?.metadata?.role;

  // Case A: no role yet → legitimate new user, let them through.
  if (!role) return <>{children}</>;

  // Case B candidate: role exists, check whether a DB profile also exists.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  // Profile found → fully onboarded, send to their home page.
  if (profile) {
    redirect(role === "instructor" ? "/admin" : "/");
  }

  // No profile despite having a role → ghost user, let them re-onboard.
  return <>{children}</>;
}
