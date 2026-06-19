// Edge Function: nutrition-targets
//   GET                      → current targets (may be null)
//   POST { action: 'save' }  → manual save of any target field (upsert)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function jsonRes(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData.user) return jsonRes({ error: "Unauthorized" }, 401);
  const userId = authData.user.id;

  try {
    if (req.method === "GET") {
      const { data, error } = await admin
        .from("nutrition_targets")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return jsonRes({ targets: data });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));

      // Accept both 'save' and legacy 'override' action names
      const action = body?.action;
      if (action !== "save" && action !== "override") {
        return jsonRes({ error: "unknown action" }, 400);
      }

      const FIELDS = [
        "training_calories", "training_protein_g", "training_carbs_g", "training_fat_g",
        "rest_calories", "rest_protein_g", "rest_carbs_g", "rest_fat_g",
        "fiber_g_min", "saturated_fat_g_max",
      ];

      const patch: Record<string, unknown> = { user_id: userId };
      for (const f of FIELDS) {
        if (body[f] !== undefined) {
          const n = Number(body[f]);
          if (Number.isFinite(n) && n > 0) patch[f] = Math.round(n);
        }
      }

      // Must have at least one nutrition field beyond user_id
      if (Object.keys(patch).length <= 1) return jsonRes({ error: "no fields provided" }, 400);

      patch.last_recalibrated_at = new Date().toISOString();

      const { data, error } = await admin
        .from("nutrition_targets")
        .upsert(patch, { onConflict: "user_id" })
        .select()
        .single();
      if (error) throw error;
      return jsonRes({ targets: data });
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[nutrition-targets] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
