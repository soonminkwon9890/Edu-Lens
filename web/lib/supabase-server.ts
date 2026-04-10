import { createClient } from "@supabase/supabase-js";

const url           = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
  );
}

/**
 * Server-only Supabase client using the service role key.
 *
 * Bypasses Row Level Security — only use in trusted server contexts
 * (webhook handlers, server actions that run as the system, etc.).
 * NEVER import this module in client components or expose it to the browser.
 */
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: {
    // Webhooks and server actions don't maintain a user session
    autoRefreshToken: false,
    persistSession:   false,
  },
});
