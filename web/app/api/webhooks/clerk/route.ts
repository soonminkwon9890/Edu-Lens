import { Webhook } from "svix";
import { clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-server";

// ── Minimal Clerk webhook event types ────────────────────────────────────────

interface ClerkEmailAddress {
  email_address: string;
  id: string;
}

interface ClerkUserCreatedData {
  id: string;
  email_addresses: ClerkEmailAddress[];
  unsafe_metadata: Record<string, unknown>;
  public_metadata: Record<string, unknown>;
  first_name: string | null;
  last_name: string | null;
}

type WebhookEvent =
  | { type: "user.created"; data: ClerkUserCreatedData }
  | { type: string; data: unknown };

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Webhook] CLERK_WEBHOOK_SECRET is not set.");
    return new Response("Webhook secret not configured.", { status: 500 });
  }

  // ── 1. Verify Svix signature ───────────────────────────────────────────────
  const svixId        = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing required Svix headers.", { status: 400 });
  }

  const body = await req.text();
  const wh   = new Webhook(secret);
  let event: WebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id":        svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("[Webhook] Signature verification failed:", err);
    return new Response("Invalid webhook signature.", { status: 400 });
  }

  // ── 2. Handle user.created ─────────────────────────────────────────────────
  if (event.type !== "user.created") {
    // We only subscribed to this event — return 200 to acknowledge receipt
    return new Response("Event type ignored.", { status: 200 });
  }

  const { id, unsafe_metadata } = event.data as ClerkUserCreatedData;

  // role and nickname were written to unsafeMetadata by the sign-up form
  const role     = (unsafe_metadata?.role     as string | undefined) ?? "student";
  const nickname = (unsafe_metadata?.nickname as string | undefined) ?? `user_${id.slice(-6)}`;

  // ── 3. Insert into Supabase profiles ──────────────────────────────────────
  // upsert guards against duplicate webhook deliveries (Svix at-least-once)
  const { error: dbError } = await supabaseAdmin
    .from("profiles")
    .upsert({ id, role, nickname }, { onConflict: "id" });

  if (dbError) {
    console.error("[Webhook] Supabase upsert failed:", dbError.message);
    // Return 500 so Svix retries the delivery
    return new Response("Database error.", { status: 500 });
  }

  // ── 4. Promote role to publicMetadata so it appears in JWT claims ──────────
  // Once publicMetadata is set, clerkMiddleware can read it as
  // sessionClaims.metadata.role on every subsequent request — no extra DB
  // round-trip needed in the middleware hot path.
  try {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(id, {
      publicMetadata: { role },
    });
  } catch (err) {
    // Non-fatal: the profile is already created in Supabase.
    // The user will still work; role-based redirects will activate on
    // next sign-in once the metadata propagates.
    console.error("[Webhook] Clerk metadata update failed:", err);
  }

  return new Response("OK", { status: 200 });
}
