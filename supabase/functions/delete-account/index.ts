// Edge Function: delete-account
//   POST { confirm: "DELETE", apple_authorization_code?: string } → { ok: true }
//
// Permanently deletes the caller's account. The uid always comes from the verified bearer
// token. Requires a sign-in under 5 minutes old (JWT amr), then: RevenueCat subscriber
// delete → Sign in with Apple revocation (best effort) → workout-media/{uid}/ sweep →
// public.delete_user_data(uid) → auth.admin.deleteUser(uid). See handler.ts.
//
// Clients (docs/security/1.0.2-permission-matrix.md, DA-*):
// - user (anon key + caller JWT): verifies the token and sweeps the caller's own storage
//   folder through the workout-media policies.
// - service role: ONLY for delete_user_data (EXECUTE is granted to service_role alone) and
//   auth.admin.deleteUser. Both are true admin operations across schemas that the user
//   role cannot perform, and both are pinned to the verified uid.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { createHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function createUserClient(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

serve(createHandler({
  createUserClient,
  admin: supabaseAdmin,
  fetch: (url, init) => fetch(url, init),
  env: (name) => Deno.env.get(name),
  now: () => Date.now(),
  log: (line) => console.error(line),
}));
