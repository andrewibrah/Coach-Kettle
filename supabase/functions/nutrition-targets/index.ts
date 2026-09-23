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

import { readSavedNutritionTargetSet } from "../_shared/nutritionTargetLoading.ts";

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

const DURABLE_SOURCES = ["manual", "backend_suggested", "imported_existing"];
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const onlyKeys = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every((key) => keys.includes(key));
const finiteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const durableSource = (v: unknown) => typeof v === "string" && DURABLE_SOURCES.includes(v);

function validMacro(v: unknown): boolean {
  return isObject(v) && "calories" in v &&
    onlyKeys(v, ["calories", "protein_g", "carbs_g", "fat_g"]) &&
    Object.values(v).every((n) => finiteNumber(n) && n > 0);
}

function validOverrides(v: unknown): boolean {
  if (!Array.isArray(v) || v.length > 7) return false;
  const days = new Set<number>();
  return v.every((o) => {
    if (!isObject(o) || !onlyKeys(o, ["day_of_week", "target", "source", "updated_at"]) ||
      !finiteNumber(o.day_of_week) || !Number.isInteger(o.day_of_week) ||
      o.day_of_week < 0 || o.day_of_week > 6 || days.has(o.day_of_week) || !validMacro(o.target) ||
      ("source" in o && !durableSource(o.source)) ||
      ("updated_at" in o && typeof o.updated_at !== "string")) return false;
    days.add(o.day_of_week);
    return true;
  });
}

// Mirror the SQL boundary; do not sanitize, coerce, default or filter a save.
// SQL remains authoritative and validates again before any writes.
function validSavePayload(v: unknown): boolean {
  if (!isObject(v) || !onlyKeys(v, ["action", "source", "suggestion_id", "targets", "macro_preference", "provenance", "derivation_inputs", "explanation"]) ||
    v.action !== "save_set" || !durableSource(v.source)) return false;
  const p = v.provenance;
  if (!isObject(p) || !onlyKeys(p, ["user_confirmed", "edited_after_suggestion", "imported_from_existing"]) ||
    p.user_confirmed !== true || typeof p.edited_after_suggestion !== "boolean" ||
    ("imported_from_existing" in p && typeof p.imported_from_existing !== "boolean") ||
    (v.source === "imported_existing" && p.imported_from_existing !== true) ||
    (v.source === "backend_suggested" && p.edited_after_suggestion !== false)) return false;
  if (("suggestion_id" in v && (typeof v.suggestion_id !== "string" || v.suggestion_id.replace(/^ +| +$/g, "") === "")) ||
    ("macro_preference" in v && typeof v.macro_preference !== "string")) return false;
  const t = v.targets;
  const parents = ["base", "training_day", "rest_day"];
  if (!isObject(t) || !onlyKeys(t, [...parents, "day_overrides"]) ||
    !parents.some((key) => key in t) || !parents.every((key) => !(key in t) || validMacro(t[key])) ||
    ("day_overrides" in t && !validOverrides(t.day_overrides))) return false;
  if ("derivation_inputs" in v) {
    const d = v.derivation_inputs;
    if (!isObject(d) || !onlyKeys(d, ["age_range", "sex", "height_cm_present", "weight_kg_present", "activity_level", "goal_type", "training_days_per_week", "user_entered_calorie_target", "macro_preference"]) ||
      !Object.entries(d).every(([key, value]) =>
        ["height_cm_present", "weight_kg_present"].includes(key) ? typeof value === "boolean" :
        ["training_days_per_week", "user_entered_calorie_target"].includes(key) ? finiteNumber(value) : typeof value === "string")) return false;
  }
  if ("explanation" in v) {
    const e = v.explanation;
    if (!isObject(e) || !onlyKeys(e, ["summary", "assumptions", "missing_inputs", "calculation_basis", "safety_notes"]) ||
      !["summary", "assumptions", "missing_inputs", "calculation_basis"].every((key) => key in e) ||
      !Object.entries(e).every(([key, value]) => ["summary", "calculation_basis"].includes(key)
        ? typeof value === "string" : Array.isArray(value) && value.every((item) => typeof item === "string"))) return false;
  }
  return true;
}

// Verify the receipt, then return it untouched: never refetch a newer snapshot.
function validSaveReceipt(v: unknown, userId: string, preservesOverrides: boolean): boolean {
  const uuid = (id: unknown) => typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const timestamp = (value: unknown) => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
  if (!isObject(v) || !uuid(v.saved_target_set_id) || !uuid(v.user_id) ||
    v.user_id !== userId || !durableSource(v.source) || !timestamp(v.updated_at) ||
    !isObject(v.targets)) return false;
  const t = v.targets;
  // to_jsonb(saved) includes nullable columns as explicit nulls, never omits
  // them. Unlike a legacy GET row, every save receipt has confirmed provenance.
  const p = t.provenance;
  if (!timestamp(t.created_at) ||
    (t.macro_preference !== null && typeof t.macro_preference !== "string") ||
    (t.suggestion_id !== null && (typeof t.suggestion_id !== "string" || t.suggestion_id.replace(/^ +| +$/g, "") === "")) ||
    (v.source === "backend_suggested" ? !timestamp(t.stale_after) : t.stale_after !== null) ||
    !isObject(p) || !onlyKeys(p, ["user_confirmed", "edited_after_suggestion", "imported_from_existing"]) ||
    p.user_confirmed !== true || typeof p.edited_after_suggestion !== "boolean" ||
    ("imported_from_existing" in p && typeof p.imported_from_existing !== "boolean") ||
    (v.source === "imported_existing" && p.imported_from_existing !== true) ||
    (v.source === "backend_suggested" && p.edited_after_suggestion !== false)) return false;
  const d = t.derivation_inputs_snapshot;
  if (d !== null && (!isObject(d) ||
    !onlyKeys(d, ["age_range", "sex", "height_cm_present", "weight_kg_present", "activity_level", "goal_type", "training_days_per_week", "user_entered_calorie_target", "macro_preference"]) ||
    !Object.entries(d).every(([key, value]) =>
      ["height_cm_present", "weight_kg_present"].includes(key) ? typeof value === "boolean" :
      ["training_days_per_week", "user_entered_calorie_target"].includes(key) ? finiteNumber(value) : typeof value === "string"))) return false;
  const e = t.explanation;
  if (e !== null && (!isObject(e) ||
    !onlyKeys(e, ["summary", "assumptions", "missing_inputs", "calculation_basis", "safety_notes"]) ||
    !["summary", "assumptions", "missing_inputs", "calculation_basis"].every((key) => key in e) ||
    !Object.entries(e).every(([key, value]) => ["summary", "calculation_basis"].includes(key)
      ? typeof value === "string" : Array.isArray(value) && value.every((item) => typeof item === "string")))) return false;
  const parents = ["base_target", "training_day_target", "rest_day_target"];
  return t.id === v.saved_target_set_id && t.user_id === userId && t.source === v.source &&
    t.updated_at === v.updated_at && parents.some((key) => validMacro(t[key])) &&
    parents.every((key) => t[key] === null || validMacro(t[key])) &&
    Array.isArray(t.day_overrides) && t.day_overrides.length <= 7 &&
    new Set(t.day_overrides.map((o) => isObject(o) ? o.day_of_week : null)).size === t.day_overrides.length &&
    t.day_overrides.every((o) => isObject(o) && finiteNumber(o.day_of_week) &&
      Number.isInteger(o.day_of_week) && o.day_of_week >= 0 && o.day_of_week <= 6 &&
      // Old saves rounded positive fractions to zero. Omitted children are
      // historical data, not newly approved targets; the resolver separately
      // withholds incomplete targets. Validate without repairing the receipt.
      (preservesOverrides
        ? isObject(o.target) && "calories" in o.target &&
          onlyKeys(o.target, ["calories", "protein_g", "carbs_g", "fat_g"]) &&
          Object.values(o.target).every((n) => finiteNumber(n) && n >= 0)
        : validMacro(o.target)) && typeof o.source === "string" &&
      // Omitted overrides can retain historical local_draft rows.
      [...DURABLE_SOURCES, "local_draft"].includes(o.source) && timestamp(o.updated_at));
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
    const url = new URL(req.url);

    // ---- GET ----
    if (req.method === "GET") {
      const action = url.searchParams.get("action");

      if (action === "get_set") {
        const set = await readSavedNutritionTargetSet(admin, userId);
        if (!set) return jsonRes({ has_saved_targets: false });
        // Keep the existing public child projection; ownership/IDs were checked
        // against the same snapshot in the shared read boundary.
        const overrides = set.day_overrides.map(({ day_of_week, target, source, updated_at }) =>
          ({ day_of_week, target, source, updated_at }));

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
        if (!validSavePayload(body)) return jsonRes({ error: "Invalid target set" }, 400);
        const { data, error } = await admin.rpc("save_nutrition_target_set_atomic", {
          p_user_id: userId,
          p_payload: body,
        });
        if (error) {
          return jsonRes({ error: error.code === "22023" ? "Invalid target set" : "Internal server error" }, error.code === "22023" ? 400 : 500);
        }
        if (!validSaveReceipt(data, userId, !("day_overrides" in body.targets))) return jsonRes({ error: "Internal server error" }, 500);
        return jsonRes(data);
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
  } catch {
    // Never log private request, auth or provider error contents.
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
