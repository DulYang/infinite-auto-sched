import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side ONLY. A Supabase client authenticated with the service-role key,
// which bypasses RLS. Needed for the anon-facing receipt-verification flow,
// which has to (a) read a client's proof-of-payment out of the PRIVATE
// `receipts` bucket and (b) confirm the booking + write payment/log rows that
// RLS otherwise reserves for authenticated admins.
//
// Returns null when the service-role key isn't configured, so callers can stay
// inert (fall back to manual admin review) instead of crashing. NEVER import
// this into a client component — the key must never reach the browser.
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
