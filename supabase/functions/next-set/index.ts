// Edge Function: next-set
// Adaptive recommendations are disabled until D07 policy is approved.
// Keep the existing authentication and request validation barriers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function verifyAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  // The RPC uses auth.uid(); we need an authenticated client (not service-role)
  // for the RPC's auth.uid() check to pass.
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await verifyAuth(req);
  } catch {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  // Get exercise from POST body or GET query
  let exercise = "";
  try {
    if (req.method === "GET") {
      exercise = new URL(req.url).searchParams.get("exercise") ?? "";
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      exercise = String(body?.exercise ?? "");
    } else {
      return jsonRes({ error: "Method not allowed" }, 405);
    }
  } catch {
    return jsonRes({ error: "Invalid request" }, 400);
  }

  exercise = exercise.trim();
  if (!exercise) return jsonRes({ error: "exercise required" }, 400);

  // D07 is unresolved. Logging integrity does not authorize adaptive thresholds.
  // Fail unavailable before calling legacy SQL (including zero/bodyweight increases).
  return jsonRes({ suggestion: null, reason: 'policy_unapproved' });
});
