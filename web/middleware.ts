import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// ── Type augmentation for publicMetadata in JWT claims ────────────────────────
declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      role?:     "instructor" | "student";
      nickname?: string;
    };
  }
}

// ── Route classification ──────────────────────────────────────────────────────

/** Completely public — no auth required. */
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk(.*)",
]);

/** Accessible to authenticated users regardless of role (including role-pending). */
const isOnboardingRoute = createRouteMatcher(["/onboarding(.*)"]);

// ── Middleware ────────────────────────────────────────────────────────────────

export default clerkMiddleware((auth, req) => {
  // Public routes bypass all checks
  if (isPublicRoute(req)) return;

  const { userId, sessionClaims } = auth();
  const { pathname } = req.nextUrl;

  // ── Unauthenticated: redirect to sign-in ──────────────────────────────────
  if (!userId) {
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", pathname);
    return NextResponse.redirect(signInUrl);
  }

  const role = sessionClaims?.metadata?.role;

  // ── Onboarding gate ───────────────────────────────────────────────────────
  //
  // OAuth sign-ups (Google / GitHub) bypass the custom sign-up form and land
  // here with no role set.  Force them through /onboarding before they can
  // access any protected page.
  //
  // Exception: once onboarding is complete and the JWT has been refreshed,
  // redirect away from /onboarding so the user doesn't get stuck there.
  if (!role && !isOnboardingRoute(req)) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (role && isOnboardingRoute(req)) {
    // Already has a role — send to their home page
    return NextResponse.redirect(
      new URL(role === "instructor" ? "/admin" : "/", req.url),
    );
  }

  // ── Role-based routing ────────────────────────────────────────────────────
  // Only reached when `role` is defined (onboarding complete).

  if (role === "instructor" && pathname === "/") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (role !== "instructor" && pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
