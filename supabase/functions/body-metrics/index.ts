// Edge Function: body-metrics
//   GET ?action=list&days=180             → recent body metrics entries
//   GET ?action=latest                    → most recent entry
//   GET ?action=photos&days=180           → body photos (with signed URLs)
//   POST {action:'upsert', ...metrics}    → insert/update body metrics for date
//   POST {action:'delete', id}            → delete entry
//   POST {action:'add_photo', storage_path, pose, ...}
//   POST {action:'delete_photo', id}
//
// All scoped to auth user. Body photos stored in 'workout-media' bucket
// (reuses existing private bucket) under prefix '{user_id}/body/{filename}'.

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

const PHOTO_BUCKET = "workout-media";
const SIGNED_URL_TTL = 60 * 60;

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

function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clampNum(v: unknown, lo: number, hi: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < lo || n > hi) return null;
  return Math.round(n * 100) / 100;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let userId: string;
  try {
    userId = await verifyAuth(req);
  } catch {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action") ?? "list";

      if (action === "list") {
        const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "180"), 1), 1000);
        const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
        const { data, error } = await supabaseAdmin
          .from("body_metrics")
          .select("*")
          .eq("user_id", userId)
          .gte("measured_date", since)
          .order("measured_date", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return jsonRes({ entries: data ?? [] });
      }

      if (action === "latest") {
        const { data, error } = await supabaseAdmin
          .from("body_metrics")
          .select("*")
          .eq("user_id", userId)
          .order("measured_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return jsonRes({ entry: data });
      }

      if (action === "photos") {
        const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "180"), 1), 1000);
        const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
        const { data, error } = await supabaseAdmin
          .from("body_photos")
          .select("*")
          .eq("user_id", userId)
          .gte("captured_date", since)
          .order("captured_date", { ascending: false });
        if (error) throw error;

        // Sign URLs in batch
        const out = await Promise.all(
          (data ?? []).map(async (row) => {
            const { data: signed } = await supabaseAdmin.storage
              .from(PHOTO_BUCKET)
              .createSignedUrl(row.storage_path, SIGNED_URL_TTL);
            return { ...row, signed_url: signed?.signedUrl ?? null };
          })
        );
        return jsonRes({ photos: out });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;

      if (action === "upsert") {
        if (!isIsoDate(body.measured_date)) {
          return jsonRes({ error: "measured_date required (YYYY-MM-DD)" }, 400);
        }
        const row = {
          user_id: userId,
          measured_date: body.measured_date,
          measured_at: new Date().toISOString(),
          weight_lbs: clampNum(body.weight_lbs, 50, 800),
          body_fat_pct: clampNum(body.body_fat_pct, 2, 60),
          waist_in: clampNum(body.waist_in, 15, 80),
          chest_in: clampNum(body.chest_in, 20, 80),
          hips_in: clampNum(body.hips_in, 20, 80),
          arm_in: clampNum(body.arm_in, 5, 30),
          thigh_in: clampNum(body.thigh_in, 10, 50),
          neck_in: clampNum(body.neck_in, 8, 25),
          notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
        };
        const { data, error } = await supabaseAdmin
          .from("body_metrics")
          .upsert(row, { onConflict: "user_id,measured_date" })
          .select()
          .single();
        if (error) throw error;
        return jsonRes({ entry: data });
      }

      if (action === "delete") {
        if (typeof body.id !== "string") return jsonRes({ error: "id required" }, 400);
        const { error } = await supabaseAdmin
          .from("body_metrics")
          .delete()
          .eq("id", body.id)
          .eq("user_id", userId);
        if (error) throw error;
        return jsonRes({ ok: true });
      }

      if (action === "add_photo") {
        // storage_path must begin with `{userId}/body/` for path-scope safety
        const storagePath = String(body.storage_path ?? "");
        const expectedPrefix = `${userId}/body/`;
        if (!storagePath.startsWith(expectedPrefix)) {
          return jsonRes({ error: "storage_path must be in user body/ namespace" }, 400);
        }
        if (!isIsoDate(body.captured_date)) {
          return jsonRes({ error: "captured_date required (YYYY-MM-DD)" }, 400);
        }
        const pose = ["front", "side", "back", "custom"].includes(body.pose) ? body.pose : null;
        const { data, error } = await supabaseAdmin
          .from("body_photos")
          .insert({
            user_id: userId,
            captured_date: body.captured_date,
            pose,
            storage_path: storagePath,
            mime_type: typeof body.mime_type === "string" ? body.mime_type.slice(0, 64) : "image/jpeg",
            width: clampNum(body.width, 1, 16384),
            height: clampNum(body.height, 1, 16384),
            size_bytes: clampNum(body.size_bytes, 1, 50_000_000),
            notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : null,
          })
          .select()
          .single();
        if (error) throw error;
        return jsonRes({ photo: data });
      }

      if (action === "delete_photo") {
        if (typeof body.id !== "string") return jsonRes({ error: "id required" }, 400);
        const { data: photo } = await supabaseAdmin
          .from("body_photos")
          .select("storage_path")
          .eq("id", body.id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!photo) return jsonRes({ error: "not found" }, 404);

        const { error: delDbErr } = await supabaseAdmin
          .from("body_photos")
          .delete()
          .eq("id", body.id)
          .eq("user_id", userId);
        if (delDbErr) throw delDbErr;

        // Best-effort storage cleanup
        await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
        return jsonRes({ ok: true });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[body-metrics] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
