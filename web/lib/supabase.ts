import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-safe Supabase client (anon key, respects RLS).
 * Import this in "use client" components and client-side hooks.
 */
export const supabase = createClient(url, key);
