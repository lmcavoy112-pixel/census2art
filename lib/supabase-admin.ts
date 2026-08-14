// Importing this from a client component is a build error, not a runtime surprise. The
// comment below used to be the only thing preventing it, and a comment cannot fail a build.
import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only: uses the service-role key, which bypasses RLS entirely.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
