// Edge Function: nutrition-targets
//
// Legacy (unchanged — backs meal-plan snapshots + existing clients):
//   GET                          → legacy nutrition_targets row (may be null)
//   POST { action: 'save' }      → manual upsert of legacy training/rest row
//
// Hybrid target system (provenance-tracked, source of truth):
//   GET  ?action=get_set         → { target_set, has_saved_targets, updated_at }
//   POST { action: 'suggest' }   → privacy-minimized suggestion, NO persistence
//   POST { action: 'save_set' }  → persist explicit, user-approved target set

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

// ---------- Macro helpers (mirror lib/nutritionTargets.ts) ----------

type MacroPref = "balanced" | "high_protein" | "lower_carb" | "higher_carb" | "custom";

function macroRatios(pref?: MacroPref): { p: number; c: number; f: number } {
  switch (pref) {
    case "high_protein": return { p: 0.40, c: 0.35, f: 0.25 };
    case "lower_carb":   return { p: 0.35, c: 0.25, f: 0.40 };
    case "higher_carb":  return { p: 0.25, c: 0.50, f: 0.25 };
    default:             return { p: 0.30, c: 0.40, f: 0.30 };
  }
}

function macrosFromCalories(cal: number, pref?: MacroPref) {
  const r = macroRatios(pref);
  return {
    calories: Math.round(cal),
    protein_g: Math.round((cal * r.p) / 4),
    carbs_g: Math.round((cal * r.c) / 4),
    fat_g: Math.round((cal * r.f) / 9),
  };
}

const round10 = (n: number) => Math.round(n / 10) * 10;

// ---------- Suggestion engine (privacy-minimized, deterministic) ----------

interface SuggestReq {
  age_range?: string;
  sex?: string;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: string;
  goal_type?: string;
  training_days_per_week?: number;
  user_entered_calorie_target?: number;
  macro_preference?: MacroPref;
}

const ACTIVITY_KCAL_PER_KG: Record<string, number> = {
  sedentary: 28, light: 30, moderate: 33, active: 35, very_active: 38,
};
const ACTIVITY_FACTOR: Record<string, number> = {
  sedentary: 0.9, light: 1.0, moderate: 1.1, active: 1.2, very_active: 1.3,
};
const GOAL_ADJ: Record<string, number> = {
  fat_loss: -0.15, maintenance: 0, general_health: 0, muscle_gain: 0.10, performance: 0.08,
};

function buildSuggestion(req: SuggestReq) {
  const used: string[] = [];
  const omitted: string[] = [];
  const not_required = ["date_of_birth", "exact_age"];
  const assumptions: string[] = [];
  const missing_inputs: string[] = [];

  const activity = req.activity_level && ACTIVITY_FACTOR[req.activity_level] ? req.activity_level : "moderate";
  if (req.activity_level) used.push("activity_level"); else { missing_inputs.push("activity_level"); assumptions.push("Assumed a moderate activity level."); }

  const goal = req.goal_type && req.goal_type in GOAL_ADJ ? req.goal_type : "maintenance";
  if (req.goal_type) used.push("goal_type"); else { missing_inputs.push("goal_type"); assumptions.push("Assumed a maintenance goal."); }

  const pref: MacroPref = (req.macro_preference as MacroPref) ?? "balanced";
  if (req.macro_preference) used.push("macro_preference");

  let calories: number;
  let confidence: "low" | "medium" | "high";
  let calculation_basis: string;

  if (Number(req.user_entered_calorie_target) > 0) {
    calories = Number(req.user_entered_calorie_target);
    confidence = "high";
    calculation_basis = "Your entered calorie target.";
    used.push("user_entered_calorie_target");
  } else if (Number(req.weight_kg) > 0) {
    const perKg = ACTIVITY_KCAL_PER_KG[activity] ?? 33;
    const maintenance = Number(req.weight_kg) * perKg;
    calories = round10(maintenance * (1 + (GOAL_ADJ[goal] ?? 0)));
    confidence = "medium";
    calculation_basis = "Body-weight × activity, adjusted for your goal (coarse estimate, not exact TDEE).";
    used.push("weight_kg");
    if (req.height_cm) used.push("height_cm");
    assumptions.push("Used a body-weight based estimate; this is approximate, not a precise BMR/TDEE.");
  } else {
    const sexBase = req.sex === "female" ? 1900 : req.sex === "male" ? 2400 : 2100;
    if (req.sex) used.push("sex"); else { missing_inputs.push("sex"); assumptions.push("Assumed a neutral baseline (no sex provided)."); }
    calories = round10(sexBase * (ACTIVITY_FACTOR[activity] ?? 1.0) * (1 + (GOAL_ADJ[goal] ?? 0)));
    confidence = "low";
    calculation_basis = "Coarse baseline from sex + activity + goal. Add your weight or a calorie target for a better estimate.";
    missing_inputs.push("weight_kg");
  }

  if (req.age_range) used.push("age_range"); else omitted.push("age_range");
  if (req.height_cm && !used.includes("height_cm")) omitted.push("height_cm");
  if (!req.weight_kg && !req.user_entered_calorie_target) { /* already flagged */ }

  // Training vs rest split: lighter on rest days when a weekly schedule exists.
  const days = Number(req.training_days_per_week);
  const hasSchedule = Number.isFinite(days) && days >= 1 && days <= 6;
  if (req.training_days_per_week) used.push("training_days_per_week");
  const restCalories = hasSchedule ? round10(calories * 0.9) : calories;
  if (hasSchedule) assumptions.push("Rest-day calories set ~10% below training days.");

  const base = macrosFromCalories(calories, pref);
  const training_day = base;
  const rest_day = macrosFromCalories(restCalories, pref);

  return {
    suggestion_id: crypto.randomUUID(),
    source: "backend_suggested" as const,
    stale: false as const,
    fallback: confidence === "low",
    confidence,
    targets: { base, training_day, rest_day },
    explanation: {
      summary: `Suggested ~${calories} kcal/day (${confidence} confidence). Review and edit before saving.`,
      assumptions,
      missing_inputs,
      calculation_basis,
      safety_notes: ["These are estimates for general fitness, not medical advice."],
    },
    input_usage: { used, omitted, not_required },
  };
}

// ---------- Save (hybrid target set) ----------

interface MacroTarget { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }
interface DayOverride { day_of_week: number; target: MacroTarget; source?: string }

function sanitizeMacro(t: MacroTarget | undefined | null): MacroTarget | null {
  if (!t || !(Number(t.calories) > 0)) return null;
  const n = (v: unknown) => (Number(v) > 0 ? Math.round(Number(v)) : undefined);
  return { calories: Math.round(Number(t.calories)), protein_g: n(t.protein_g), carbs_g: n(t.carbs_g), fat_g: n(t.fat_g) };
}

const VALID_SOURCES = ["manual", "backend_suggested", "local_draft", "imported_existing"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData.user) return jsonRes({ error: "Unauthorized" }, 401);
  const userId = authData.user.id;

  try {
    const url = new URL(req.url);

    // ---- GET ----
    if (req.method === "GET") {
      const action = url.searchParams.get("action");

      if (action === "get_set") {
        const { data: set, error } = await admin
          .from("nutrition_target_sets")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        if (!set) return jsonRes({ has_saved_targets: false });

        const { data: overrides } = await admin
          .from("nutrition_target_day_overrides")
          .select("day_of_week, target, source, updated_at")
          .eq("target_set_id", set.id);

        return jsonRes({
          has_saved_targets: true,
          updated_at: set.updated_at,
          target_set: { ...set, day_overrides: overrides ?? [] },
        });
      }

      // Legacy default GET (unchanged).
      const { data, error } = await admin
        .from("nutrition_targets")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return jsonRes({ targets: data });
    }

    // ---- POST ----
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;

      // -- Suggest (no persistence) --
      if (action === "suggest") {
        return jsonRes(buildSuggestion(body as SuggestReq));
      }

      // -- Save hybrid target set --
      if (action === "save_set") {
        const source = String(body?.source ?? "manual");
        if (!VALID_SOURCES.includes(source)) return jsonRes({ error: "invalid source" }, 400);
        if (body?.provenance?.user_confirmed !== true) {
          return jsonRes({ error: "save requires explicit user confirmation" }, 400);
        }

        const t = body?.targets ?? {};
        const base = sanitizeMacro(t.base);
        const training = sanitizeMacro(t.training_day);
        const rest = sanitizeMacro(t.rest_day);
        if (!base && !training && !rest) return jsonRes({ error: "no targets provided" }, 400);

        // Suggestions go stale after 60 days; manual/imported targets do not.
        const staleAfter = source === "backend_suggested"
          ? new Date(Date.now() + 60 * 86400_000).toISOString()
          : null;

        const row = {
          user_id: userId,
          source,
          base_target: base,
          training_day_target: training,
          rest_day_target: rest,
          macro_preference: body?.macro_preference ?? null,
          explanation: body?.explanation ?? null,
          derivation_inputs_snapshot: body?.derivation_inputs ?? null,
          stale_after: staleAfter,
          updated_at: new Date().toISOString(),
        };

        const { data: saved, error: upErr } = await admin
          .from("nutrition_target_sets")
          .upsert(row, { onConflict: "user_id" })
          .select()
          .single();
        if (upErr) throw upErr;

        // Replace day overrides for this set.
        await admin.from("nutrition_target_day_overrides").delete().eq("target_set_id", saved.id);
        const overrides: DayOverride[] = Array.isArray(t.day_overrides) ? t.day_overrides : [];
        let savedOverrides: unknown[] = [];
        if (overrides.length > 0) {
          const rows = overrides
            .map((o) => {
              const target = sanitizeMacro(o.target);
              const dow = Number(o.day_of_week);
              if (!target || !(dow >= 0 && dow <= 6)) return null;
              return {
                target_set_id: saved.id,
                user_id: userId,
                day_of_week: dow,
                target,
                source: VALID_SOURCES.includes(String(o.source)) ? o.source : source,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);
          if (rows.length > 0) {
            const { data: ins, error: ovErr } = await admin
              .from("nutrition_target_day_overrides")
              .insert(rows)
              .select("day_of_week, target, source, updated_at");
            if (ovErr) throw ovErr;
            savedOverrides = ins ?? [];
          }
        }

        return jsonRes({
          saved_target_set_id: saved.id,
          user_id: userId,
          source: saved.source,
          updated_at: saved.updated_at,
          targets: { ...saved, day_overrides: savedOverrides },
        });
      }

      // -- Legacy save/override (unchanged) --
      if (action === "save" || action === "override") {
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

      return jsonRes({ error: "unknown action" }, 400);
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[nutrition-targets] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
