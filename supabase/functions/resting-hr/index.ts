// Edge Function: resting-hr
//   GET ?action=list&days=30                   → recent entries
//   GET ?action=summary&days=30                → avg/min/max/trend via RPC
//   POST {action:'upsert', measured_date, bpm} → insert/update
//   POST {action:'delete', id}                 → delete entry

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function verifyAuth(req: Request): Promise<{ userId: string; token: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return { userId: data.user.id, token };
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampDays(raw: string | null): number {
  const n = Number(raw ?? "30");
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.max(Math.floor(n), 1), 365);
}

function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let userId: string;
  let token: string;
  try {
    ({ userId, token } = await verifyAuth(req));
  } catch {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseServiceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action") ?? "list";

      if (action === "summary") {
        const days = clampDays(url.searchParams.get("days"));
        const { data, error } = await userClient.rpc("get_avg_resting_hr", {
          p_user_id: userId,
          p_days: days,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return jsonRes({
          summary: row
            ? {
                avg_bpm: row.avg_bpm == null ? null : Number(row.avg_bpm),
                min_bpm: row.min_bpm == null ? null : Number(row.min_bpm),
                max_bpm: row.max_bpm == null ? null : Number(row.max_bpm),
                sample_count: Number(row.sample_count ?? 0),
                trend_delta_bpm: row.trend_delta_bpm == null ? null : Number(row.trend_delta_bpm),
                last_measured_date: row.last_measured_date ?? null,
              }
            : null,
        });
      }

      if (action === "list") {
        const days = clampDays(url.searchParams.get("days"));
        const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
        const { data, error } = await supabaseAdmin
          .from("resting_heart_rate")
          .select("*")
          .eq("user_id", userId)
          .gte("measured_date", since)
          .order("measured_date", { ascending: false })
          .limit(365);
        if (error) throw error;
        return jsonRes({ entries: data ?? [] });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;

      if (action === "upsert") {
        if (!isIsoDate(body.measured_date)) {
          return jsonRes({ error: "measured_date must be YYYY-MM-DD" }, 400);
        }
        const bpm = Number(body.bpm);
        if (!Number.isFinite(bpm) || bpm < 25 || bpm > 220) {
          return jsonRes({ error: "bpm must be 25..220" }, 400);
        }
        const source = ["manual", "healthkit", "google_fit", "wearable"].includes(body.source)
          ? body.source
          : "manual";

        const { data, error } = await supabaseAdmin
          .from("resting_heart_rate")
          .upsert(
            {
              user_id: userId,
              measured_date: body.measured_date,
              bpm: Math.round(bpm),
              source,
              notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : null,
            },
            { onConflict: "user_id,measured_date,source" }
          )
          .select()
          .single();
        if (error) throw error;
        return jsonRes({ entry: data });
      }

      if (action === "delete") {
        if (typeof body.id !== "string") return jsonRes({ error: "id required" }, 400);
        const { error } = await supabaseAdmin
          .from("resting_heart_rate")
          .delete()
          .eq("id", body.id)
          .eq("user_id", userId);
        if (error) throw error;
        return jsonRes({ ok: true });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[resting-hr] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
