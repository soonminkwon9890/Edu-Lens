import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * Server-side profile guard for all /admin routes.
 *
 * The middleware already verifies the Clerk session and role, but if a user's
 * row is manually deleted from the `profiles` table their Clerk JWT still has
 * role = "instructor", letting them through the middleware with no DB record.
 * This layout catches that case before any admin UI renders.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) redirect("/onboarding");

  return <>{children}</>;
}
