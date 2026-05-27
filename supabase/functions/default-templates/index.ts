// Edge Function: default-templates
// Seeds goal-based default workout templates for a user.
// POST { goal: 'muscle_building' | 'leaning_out' | 'weight_loss' }
// No-op if user already has any workout_templates rows.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData.user) return jsonRes({ error: "Unauthorized" }, 401);

  const userId = authData.user.id;

  const body = await req.json().catch(() => ({}));
  const goalRaw = String(body?.goal ?? "muscle_building").toLowerCase();
  const goal = ["muscle_building", "leaning_out", "weight_loss"].includes(goalRaw)
    ? goalRaw
    : "muscle_building";

  // RPC uses auth.uid() — must call via user-scoped client
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await userClient.rpc("seed_default_templates_for_user", {
    p_user_id: userId,
    p_goal: goal,
  });

  if (error) {
    console.error("[default-templates] rpc error:", error.message);
    return jsonRes({ error: "Failed to seed templates" }, 500);
  }

  return jsonRes({ ok: true, goal, templates: data ?? [] });
});
