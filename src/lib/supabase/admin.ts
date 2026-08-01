import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client for privileged server-only operations
// (e.g. inviting users). NEVER import this into client code — it holds the
// secret key that bypasses RLS.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
