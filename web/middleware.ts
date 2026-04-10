import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ── Type augmentation for publicMetadata in JWT claims ────────────────────────
// Matches what the webhook writes via clerkClient.users.updateUserMetadata()
declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: "instructor" | "student";
    };
  }
}

// ── Route classification ──────────────────────────────────────────────────────

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)", // Clerk webhook must never be gated
]);

// ── Middleware ────────────────────────────────────────────────────────────────

export default clerkMiddleware((auth, req) => {
  // Public routes bypass all checks unconditionally
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims } = auth();
  const { pathname } = req.nextUrl;

  // ── Unauthenticated: redirect to sign-in ───────────────────────────────────
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    // Preserve the intended destination so we can redirect back after login
    signInUrl.searchParams.set("redirect_url", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // ── Role-based routing ─────────────────────────────────────────────────────
  //
  // `role` lives in Clerk publicMetadata, surfaced in the JWT as
  // sessionClaims.metadata.role after the webhook calls updateUserMetadata().
  //
  // Edge case: a newly signed-up user whose webhook has not yet fired will
  // have role === undefined.  We treat undefined as "student" (safe default)
  // so they cannot accidentally access /admin while waiting for the webhook.
  const role = sessionClaims?.metadata?.role;

  // Instructor at "/" → their home is /admin
  if (role === "instructor" && pathname === "/") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // Non-instructor (student or role-pending) at "/admin/*" → back to "/"
  if (role !== "instructor" && pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Authenticated and on the correct path — proceed
});

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API and tRPC routes
    "/(api|trpc)(.*)",
  ],
};
