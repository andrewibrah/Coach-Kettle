// Edge Function: exercise-library
// Read-only catalog endpoints for the canonical exercises table.
//   GET ?action=list                          → full list
//   GET ?action=search&q=bench                → name/alias search
//   GET ?action=get&slug=barbell-bench-press  → single
//   GET ?action=by_body_part&body_part=Push   → filter by body part

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function verifyAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
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

  if (req.method !== "GET") return jsonRes({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "list";

  try {
    if (action === "list") {
      const { data, error } = await supabaseAdmin
        .from("exercises")
        .select("*")
        .order("body_part", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return jsonRes({ exercises: data });
    }

    if (action === "get") {
      const slug = url.searchParams.get("slug");
      if (!slug) return jsonRes({ error: "slug required" }, 400);
      const { data, error } = await supabaseAdmin
        .from("exercises")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonRes({ error: "not found" }, 404);
      return jsonRes({ exercise: data });
    }

    if (action === "search") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (!q) return jsonRes({ exercises: [] });
      const safe = q.replace(/[%_\\]/g, (m) => `\\${m}`);
      const { data, error } = await supabaseAdmin
        .from("exercises")
        .select("*")
        .ilike("name", `%${safe}%`)
        .limit(25);
      if (error) throw error;
      return jsonRes({ exercises: data });
    }

    if (action === "by_body_part") {
      const bp = url.searchParams.get("body_part");
      if (!bp) return jsonRes({ error: "body_part required" }, 400);
      const { data, error } = await supabaseAdmin
        .from("exercises")
        .select("*")
        .eq("body_part", bp)
        .order("name", { ascending: true });
      if (error) throw error;
      return jsonRes({ exercises: data });
    }

    return jsonRes({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[exercise-library] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
