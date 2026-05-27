// Edge Function: food-log
//   GET ?action=day&date=YYYY-MM-DD                  → entries + totals for date
//   GET ?action=week&end_date=YYYY-MM-DD             → entries grouped by day for 7-day window
//   GET ?action=search_foods&q=chicken               → search foods (global + user)
//   POST {action:'log', date, meal_slot, food_id?, food_name, servings, calories, ...}
//   POST {action:'log_quick', name, calories, protein_g, ...}  → ad-hoc log (no food_id)
//   POST {action:'delete', id}
//   POST {action:'update', id, ...fields}
//   POST {action:'create_food', name, serving_size_g, calories, ...}  → user food

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

function jsonRes(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function safeNum(v: unknown, fallback = 0, max = 100_000): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

async function verify(req: Request): Promise<{ userId: string; token: string }> {
  const h = req.headers.get("Authorization");
  if (!h) throw new Error("no auth");
  const token = h.replace("Bearer ", "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("bad auth");
  return { userId: data.user.id, token };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let userId: string;
  let token: string;
  try {
    ({ userId, token } = await verify(req));
  } catch {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action") ?? "day";

      if (action === "day") {
        const date = url.searchParams.get("date");
        if (!isIsoDate(date)) return jsonRes({ error: "date YYYY-MM-DD required" }, 400);
        const [{ data: entries, error: e1 }, { data: totals, error: e2 }] = await Promise.all([
          admin.from("food_logs").select("*").eq("user_id", userId).eq("log_date", date)
            .order("consumed_at", { ascending: true }),
          userClient.rpc("get_food_daily_totals", { p_user_id: userId, p_date: date }),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        const t = Array.isArray(totals) ? totals[0] : totals;
        return jsonRes({
          entries: entries ?? [],
          totals: t
            ? {
                calories: Number(t.calories ?? 0),
                protein_g: Number(t.protein_g ?? 0),
                carbs_g: Number(t.carbs_g ?? 0),
                fat_g: Number(t.fat_g ?? 0),
                fiber_g: Number(t.fiber_g ?? 0),
                saturated_fat_g: Number(t.saturated_fat_g ?? 0),
                log_count: Number(t.log_count ?? 0),
              }
            : null,
        });
      }

      if (action === "week") {
        const endRaw = url.searchParams.get("end_date") ?? new Date().toISOString().slice(0, 10);
        if (!isIsoDate(endRaw)) return jsonRes({ error: "end_date YYYY-MM-DD required" }, 400);
        const end = new Date(`${endRaw}T00:00:00Z`);
        const start = new Date(end.getTime() - 6 * 86400_000);
        const startIso = start.toISOString().slice(0, 10);
        const { data, error } = await admin
          .from("food_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("log_date", startIso)
          .lte("log_date", endRaw)
          .order("log_date", { ascending: true })
          .order("consumed_at", { ascending: true });
        if (error) throw error;
        return jsonRes({ entries: data ?? [], start_date: startIso, end_date: endRaw });
      }

      if (action === "search_foods") {
        const q = (url.searchParams.get("q") ?? "").trim();
        if (!q || q.length < 2) return jsonRes({ foods: [] });
        const safe = q.replace(/[%_\\]/g, (m) => `\\${m}`);
        const { data, error } = await admin
          .from("foods")
          .select("*")
          .or(`is_global.eq.true,user_id.eq.${userId}`)
          .ilike("name", `%${safe}%`)
          .order("is_global", { ascending: false })
          .limit(30);
        if (error) throw error;
        return jsonRes({ foods: data ?? [] });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;

      if (action === "log" || action === "log_quick") {
        const date = body.date ?? new Date().toISOString().slice(0, 10);
        if (!isIsoDate(date)) return jsonRes({ error: "date YYYY-MM-DD required" }, 400);
        const meal_slot = String(body.meal_slot ?? "snack");
        if (!MEAL_SLOTS.has(meal_slot)) return jsonRes({ error: "meal_slot invalid" }, 400);
        const food_name = String(body.food_name ?? body.name ?? "").trim();
        if (!food_name) return jsonRes({ error: "food_name required" }, 400);
        const servings = Math.max(0.01, Math.min(safeNum(body.servings, 1, 100), 100));

        const row = {
          user_id: userId,
          food_id: typeof body.food_id === "string" ? body.food_id : null,
          log_date: date,
          meal_slot,
          consumed_at: new Date().toISOString(),
          food_name: food_name.slice(0, 200),
          servings,
          calories: safeNum(body.calories, 0, 10_000),
          protein_g: safeNum(body.protein_g, 0, 500),
          carbs_g: safeNum(body.carbs_g, 0, 1000),
          fat_g: safeNum(body.fat_g, 0, 500),
          fiber_g: safeNum(body.fiber_g, 0, 200),
          saturated_fat_g: safeNum(body.saturated_fat_g, 0, 300),
          notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : null,
        };

        const { data, error } = await admin.from("food_logs").insert(row).select().single();
        if (error) throw error;
        return jsonRes({ entry: data });
      }

      if (action === "delete") {
        if (typeof body.id !== "string") return jsonRes({ error: "id required" }, 400);
        const { error } = await admin
          .from("food_logs")
          .delete()
          .eq("id", body.id)
          .eq("user_id", userId);
        if (error) throw error;
        return jsonRes({ ok: true });
      }

      if (action === "update") {
        if (typeof body.id !== "string") return jsonRes({ error: "id required" }, 400);
        const patch: Record<string, unknown> = {};
        if (body.servings !== undefined) patch.servings = Math.max(0.01, Math.min(safeNum(body.servings, 1, 100), 100));
        if (body.meal_slot !== undefined && MEAL_SLOTS.has(body.meal_slot)) patch.meal_slot = body.meal_slot;
        if (body.calories !== undefined) patch.calories = safeNum(body.calories, 0, 10_000);
        if (body.protein_g !== undefined) patch.protein_g = safeNum(body.protein_g, 0, 500);
        if (body.carbs_g !== undefined) patch.carbs_g = safeNum(body.carbs_g, 0, 1000);
        if (body.fat_g !== undefined) patch.fat_g = safeNum(body.fat_g, 0, 500);
        if (body.fiber_g !== undefined) patch.fiber_g = safeNum(body.fiber_g, 0, 200);
        if (body.saturated_fat_g !== undefined) patch.saturated_fat_g = safeNum(body.saturated_fat_g, 0, 300);
        if (body.notes !== undefined) patch.notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;
        if (Object.keys(patch).length === 0) return jsonRes({ error: "no fields" }, 400);

        const { data, error } = await admin
          .from("food_logs")
          .update(patch)
          .eq("id", body.id)
          .eq("user_id", userId)
          .select()
          .single();
        if (error) throw error;
        return jsonRes({ entry: data });
      }

      if (action === "create_food") {
        const name = String(body.name ?? "").trim();
        if (!name) return jsonRes({ error: "name required" }, 400);
        const serving_size_g = safeNum(body.serving_size_g, 100, 5000);
        if (serving_size_g <= 0) return jsonRes({ error: "serving_size_g must be > 0" }, 400);

        const food = {
          user_id: userId,
          is_global: false,
          name: name.slice(0, 200),
          brand: typeof body.brand === "string" ? body.brand.slice(0, 120) : null,
          serving_size_g,
          serving_label: typeof body.serving_label === "string" ? body.serving_label.slice(0, 60) : null,
          calories: safeNum(body.calories, 0, 10_000),
          protein_g: safeNum(body.protein_g, 0, 500),
          carbs_g: safeNum(body.carbs_g, 0, 1000),
          fat_g: safeNum(body.fat_g, 0, 500),
          fiber_g: safeNum(body.fiber_g, 0, 200),
          saturated_fat_g: safeNum(body.saturated_fat_g, 0, 300),
          sugar_g: safeNum(body.sugar_g, 0, 500),
          sodium_mg: safeNum(body.sodium_mg, 0, 20_000),
          tags: Array.isArray(body.tags) ? body.tags.slice(0, 20).map((t: unknown) => String(t).slice(0, 40)) : [],
        };

        const { data, error } = await admin.from("foods").insert(food).select().single();
        if (error) throw error;
        return jsonRes({ food: data });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[food-log] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
