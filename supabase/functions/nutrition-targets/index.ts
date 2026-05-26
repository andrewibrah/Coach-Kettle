// Edge Function: nutrition-targets
//   GET                                  → current targets (may be null)
//   POST { action: 'derive' }            → compute from profile + persist
//   POST { action: 'override', ... }     → manual override of any target field
//
// Derivation: Mifflin-St Jeor BMR → TDEE via activity_level → goal-adjusted
// calories → macro split. Training-day calories sit ~5% above rest-day for
// muscle building / strength; equal for maintenance; rest-day low for cuts.

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

const ACTIVITY_MULT: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  athlete: 1.9,
};

function lbsToKg(lbs: number): number { return lbs * 0.453592; }
function inToCm(inches: number): number { return inches * 2.54; }
function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(Math.round(n), lo), hi);
}

function deriveTargets(profile: Record<string, unknown>): {
  training: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  rest:     { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  bmr: number; tdee: number; inputs: Record<string, unknown>;
} {
  const sex = (profile.sex as string) ?? "male";
  const activity = (profile.activity_level as string) ?? "moderate";
  const goal = (profile.goal_type as string) ?? "maintenance";
  const wUnit = (profile.weight_unit as string) ?? "lb";
  const hUnit = (profile.height_unit as string) ?? "in";
  const weight = Number(profile.current_weight);
  const height = Number(profile.height_value);
  const dob = profile.dob as string | null;

  if (!Number.isFinite(weight) || weight <= 0) throw new Error("profile missing current_weight");
  if (!Number.isFinite(height) || height <= 0) throw new Error("profile missing height_value");
  if (!dob) throw new Error("profile missing dob");

  const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400_000));
  if (!Number.isFinite(age) || age < 12 || age > 100) throw new Error("invalid age");

  const wKg = wUnit === "kg" ? weight : lbsToKg(weight);
  const hCm = hUnit === "cm" ? height : inToCm(height);

  // Mifflin-St Jeor
  const bmr = sex === "female"
    ? (10 * wKg) + (6.25 * hCm) - (5 * age) - 161
    : (10 * wKg) + (6.25 * hCm) - (5 * age) + 5;
  const mult = ACTIVITY_MULT[activity] ?? 1.55;
  const tdee = bmr * mult;

  // Goal-adjusted target calories
  let restCals = tdee;
  let trainingCals = tdee;
  switch (goal) {
    case "muscle_building":
      restCals = tdee + 150;     trainingCals = tdee + 350; break;
    case "strength":
      restCals = tdee + 100;     trainingCals = tdee + 300; break;
    case "leaning_out":
      restCals = tdee - 350;     trainingCals = tdee - 150; break;
    case "weight_loss":
      restCals = tdee - 500;     trainingCals = tdee - 300; break;
    case "endurance":
      restCals = tdee;            trainingCals = tdee + 250; break;
    case "maintenance":
    default:
      restCals = tdee;            trainingCals = tdee;       break;
  }

  // Macro split
  // Protein default: 0.9 g/lb bw for muscle/lean, 1.0 g/lb for weight_loss (preserve LBM)
  const proteinGPerLbOverride = Number(profile.protein_g_per_lb);
  const proteinPerLb = Number.isFinite(proteinGPerLbOverride) && proteinGPerLbOverride > 0
    ? proteinGPerLbOverride
    : goal === "weight_loss" ? 1.0 : goal === "leaning_out" ? 1.0 : 0.9;
  const wLbs = wUnit === "lb" ? weight : weight / 0.453592;
  const proteinG = clampInt(wLbs * proteinPerLb, 60, 280);

  // Fat: 25–30% of calories
  const fatPct = goal === "weight_loss" ? 0.30 : 0.25;
  const fatGTraining = clampInt((trainingCals * fatPct) / 9, 30, 200);
  const fatGRest     = clampInt((restCals * fatPct) / 9, 30, 200);

  // Carbs = remaining cals / 4
  const carbsGTraining = clampInt((trainingCals - (proteinG * 4) - (fatGTraining * 9)) / 4, 30, 700);
  const carbsGRest     = clampInt((restCals    - (proteinG * 4) - (fatGRest * 9))     / 4, 30, 700);

  // Allow manual calorie override on top of derivation
  const overrideCal = Number(profile.calorie_target_override);
  if (Number.isFinite(overrideCal) && overrideCal > 0) {
    const delta = overrideCal - tdee;
    restCals = overrideCal + Math.min(delta, 0);
    trainingCals = overrideCal + Math.max(0, 200);
  }

  return {
    training: {
      calories: clampInt(trainingCals, 1000, 5500),
      protein_g: proteinG,
      carbs_g: carbsGTraining,
      fat_g: fatGTraining,
    },
    rest: {
      calories: clampInt(restCals, 1000, 5500),
      protein_g: proteinG,
      carbs_g: carbsGRest,
      fat_g: fatGRest,
    },
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    inputs: { sex, activity, goal, age, weight_lbs: Math.round(wLbs), height_cm: Math.round(hCm), proteinPerLb, fatPct },
  };
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
      const action = body?.action;

      // Always pull current profile from DB (single source of truth)
      const { data: profile, error: pErr } = await admin
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return jsonRes({ error: "Profile not found" }, 404);

      if (action === "derive") {
        let derived;
        try {
          derived = deriveTargets(profile);
        } catch (e) {
          return jsonRes({ error: (e as Error).message }, 400);
        }

        const row = {
          user_id: userId,
          training_calories: derived.training.calories,
          training_protein_g: derived.training.protein_g,
          training_carbs_g: derived.training.carbs_g,
          training_fat_g: derived.training.fat_g,
          rest_calories: derived.rest.calories,
          rest_protein_g: derived.rest.protein_g,
          rest_carbs_g: derived.rest.carbs_g,
          rest_fat_g: derived.rest.fat_g,
          fiber_g_min: 25,
          saturated_fat_g_max: 30,
          bmr: derived.bmr,
          tdee: derived.tdee,
          derivation_inputs: derived.inputs,
          last_recalibrated_at: new Date().toISOString(),
        };

        const { data, error } = await admin
          .from("nutrition_targets")
          .upsert(row, { onConflict: "user_id" })
          .select()
          .single();
        if (error) throw error;
        return jsonRes({ targets: data, derived });
      }

      if (action === "override") {
        // Manual override of any of the numeric fields
        const patch: Record<string, unknown> = {};
        const FIELDS = ["training_calories","training_protein_g","training_carbs_g","training_fat_g",
                        "rest_calories","rest_protein_g","rest_carbs_g","rest_fat_g",
                        "fiber_g_min","saturated_fat_g_max"];
        for (const f of FIELDS) {
          if (body[f] !== undefined) {
            const n = Number(body[f]);
            if (Number.isFinite(n) && n > 0) patch[f] = Math.round(n);
          }
        }
        if (Object.keys(patch).length === 0) return jsonRes({ error: "no fields" }, 400);
        patch.last_recalibrated_at = new Date().toISOString();

        const { data, error } = await admin
          .from("nutrition_targets")
          .update(patch)
          .eq("user_id", userId)
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
