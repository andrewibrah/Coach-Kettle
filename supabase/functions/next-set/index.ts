// Edge Function: next-set
// Returns the suggested next-set weight/reps for a given exercise,
// based on the user's most recent prior session. Wraps the
// `suggest_next_set` RPC and enforces user_id == auth.uid().

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function verifyAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  // The RPC uses auth.uid(); we need an authenticated client (not service-role)
  // for the RPC's auth.uid() check to pass.
  const userClient = createClient(supabaseUrl, supabaseServiceKey, {
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

  let userId: string;
  let token: string;
  try {
    userId = await verifyAuth(req);
    token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
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

  // Call the RPC with a user-scoped client so auth.uid() matches.
  const userClient = createClient(supabaseUrl, supabaseServiceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await userClient.rpc("suggest_next_set", {
    p_user_id: userId,
    p_exercise: exercise,
  });

  if (error) {
    console.error("[next-set] rpc error:", error.message);
    return jsonRes({ error: "Failed to compute suggestion" }, 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return jsonRes({ suggestion: null });

  return jsonRes({
    suggestion: {
      last_workout_date: row.last_workout_date ?? null,
      last_top_weight_lbs: row.last_top_weight_lbs == null ? null : Number(row.last_top_weight_lbs),
      last_top_reps: row.last_top_reps == null ? null : Number(row.last_top_reps),
      last_top_e1rm: row.last_top_e1rm == null ? null : Number(row.last_top_e1rm),
      suggested_weight_lbs: row.suggested_weight_lbs == null ? null : Number(row.suggested_weight_lbs),
      suggested_reps_low: Number(row.suggested_reps_low ?? 8),
      suggested_reps_high: Number(row.suggested_reps_high ?? 12),
      strategy: row.strategy ?? "no_history",
      rationale: row.rationale ?? "",
    },
  });
});
