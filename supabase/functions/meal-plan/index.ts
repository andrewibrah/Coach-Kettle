// Edge Function: meal-plan
//   GET                                  → current active weekly plan + meals
//   POST { action: 'generate' }          → generate a new weekly plan via AI
//   POST { action: 'recalibrate' }       → regenerate based on last 7 days logged

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

function getWeekStart(d = new Date(), timeZone = "America/Los_Angeles"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const val = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(val("year"));
  const month = Number(val("month"));
  const dayOfMonth = Number(val("day"));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(val("weekday"));
  const safeWeekday = weekday >= 0 ? weekday : d.getUTCDay();
  const wk = new Date(Date.UTC(year, month - 1, dayOfMonth - safeWeekday));
  return wk.toISOString().slice(0, 10);
}

async function getUserTimezone(userId: string): Promise<string> {
  const { data } = await admin
    .from("notification_preferences")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  return typeof data?.timezone === "string" && data.timezone.length > 0
    ? data.timezone
    : "America/Los_Angeles";
}

interface MealPlanMeal {
  day_of_week: number;
  is_training_day: boolean;
  meal_slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  title: string;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  items: { name: string; grams?: number; servings?: number; calories: number; protein_g: number; carbs_g: number; fat_g: number }[];
}

async function generateAIMealPlan(
  targets: Record<string, number>,
  profile: Record<string, unknown>,
  trainingDays: number[],            // 0..6
  recentLogs: Record<string, unknown>[]
): Promise<MealPlanMeal[]> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    // Fallback: deterministic skeleton (no AI). Cuts cost when key missing.
    return buildSkeletonPlan(targets, trainingDays);
  }

  const prefs = profile.dietary_preferences ?? [];
  const allergies = profile.dietary_allergies ?? [];
  const dislikes = profile.disliked_foods ?? [];
  const cuisines = profile.preferred_cuisines ?? [];

  const sys = `You are a sports nutritionist. Generate a 7-day meal plan as STRICT JSON.

OUTPUT SHAPE:
{"meals":[{"day_of_week":0,"is_training_day":false,"meal_slot":"breakfast","title":"...","description":"...","calories":NUM,"protein_g":NUM,"carbs_g":NUM,"fat_g":NUM,"fiber_g":NUM,"items":[{"name":"...","grams":NUM,"calories":NUM,"protein_g":NUM,"carbs_g":NUM,"fat_g":NUM}]}, ...]}

RULES:
- Exactly 4 meal_slots per day: breakfast, lunch, dinner, snack. 28 meals total.
- day_of_week: 0=Sun, 1=Mon, ..., 6=Sat.
- For each day, sum of meal macros should hit targets within ±5%:
    Training days: ${targets.training_calories} cal / ${targets.training_protein_g}P / ${targets.training_carbs_g}C / ${targets.training_fat_g}F
    Rest days:     ${targets.rest_calories} cal / ${targets.rest_protein_g}P / ${targets.rest_carbs_g}C / ${targets.rest_fat_g}F
- Use real, common foods with specific gram amounts. No vague "side salad".
- Items array must contain individual foods (3–5 per meal typical).
- Respect dietary_preferences=${JSON.stringify(prefs)}, allergies=${JSON.stringify(allergies)}, dislikes=${JSON.stringify(dislikes)}, cuisines=${JSON.stringify(cuisines)}.
- Vary across days. No identical meals twice in the same week.
Return ONLY the JSON. No markdown, no preamble.`;

  const usr = JSON.stringify({
    training_days: trainingDays,
    targets,
    recent_logged_sample: recentLogs.slice(0, 12),
  });

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 4000,
    }),
  });

  if (!resp.ok) {
    console.error("[meal-plan] OpenAI error:", await resp.text().catch(() => "?"));
    return buildSkeletonPlan(targets, trainingDays);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) return buildSkeletonPlan(targets, trainingDays);

  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed?.meals)) throw new Error("bad shape");
    const cleaned: MealPlanMeal[] = parsed.meals
      .filter((m: unknown): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .map((m) => ({
        day_of_week: Math.min(Math.max(Number(m.day_of_week ?? 0), 0), 6),
        is_training_day: Boolean(m.is_training_day),
        meal_slot: ["breakfast", "lunch", "dinner", "snack"].includes(String(m.meal_slot)) ? (m.meal_slot as MealPlanMeal['meal_slot']) : "snack",
        title: String(m.title ?? "Meal").slice(0, 120),
        description: String(m.description ?? "").slice(0, 500),
        calories: Math.max(0, Number(m.calories ?? 0)),
        protein_g: Math.max(0, Number(m.protein_g ?? 0)),
        carbs_g: Math.max(0, Number(m.carbs_g ?? 0)),
        fat_g: Math.max(0, Number(m.fat_g ?? 0)),
        fiber_g: Math.max(0, Number(m.fiber_g ?? 0)),
        items: Array.isArray(m.items)
          ? (m.items as Record<string, unknown>[]).slice(0, 12).map((it) => ({
              name: String(it.name ?? "").slice(0, 80),
              grams: it.grams == null ? undefined : Number(it.grams),
              servings: it.servings == null ? undefined : Number(it.servings),
              calories: Math.max(0, Number(it.calories ?? 0)),
              protein_g: Math.max(0, Number(it.protein_g ?? 0)),
              carbs_g: Math.max(0, Number(it.carbs_g ?? 0)),
              fat_g: Math.max(0, Number(it.fat_g ?? 0)),
            }))
          : [],
      }));

    if (cleaned.length === 0) return buildSkeletonPlan(targets, trainingDays);
    return cleaned;
  } catch (e) {
    console.error("[meal-plan] parse error:", e);
    return buildSkeletonPlan(targets, trainingDays);
  }
}

function buildSkeletonPlan(targets: Record<string, number>, trainingDays: number[]): MealPlanMeal[] {
  // Fallback: 4 meals per day, evenly distributed across day targets.
  const meals: MealPlanMeal[] = [];
  const slots: MealPlanMeal['meal_slot'][] = ["breakfast", "lunch", "dinner", "snack"];
  const distribution = [0.28, 0.32, 0.30, 0.10]; // breakfast, lunch, dinner, snack
  for (let d = 0; d < 7; d++) {
    const isTraining = trainingDays.includes(d);
    const cal = isTraining ? targets.training_calories : targets.rest_calories;
    const prot = isTraining ? targets.training_protein_g : targets.rest_protein_g;
    const carb = isTraining ? targets.training_carbs_g : targets.rest_carbs_g;
    const fat = isTraining ? targets.training_fat_g : targets.rest_fat_g;
    slots.forEach((slot, i) => {
      meals.push({
        day_of_week: d,
        is_training_day: isTraining,
        meal_slot: slot,
        title: `${slot[0].toUpperCase()}${slot.slice(1)} (Day ${d + 1})`,
        description: "Auto-generated placeholder — connect OpenAI key for personalized plan.",
        calories: Math.round(cal * distribution[i]),
        protein_g: Math.round(prot * distribution[i]),
        carbs_g: Math.round(carb * distribution[i]),
        fat_g: Math.round(fat * distribution[i]),
        fiber_g: Math.round(25 * distribution[i]),
        items: [{
          name: "Placeholder meal",
          grams: 0,
          calories: Math.round(cal * distribution[i]),
          protein_g: Math.round(prot * distribution[i]),
          carbs_g: Math.round(carb * distribution[i]),
          fat_g: Math.round(fat * distribution[i]),
        }],
      });
    });
  }
  return meals;
}

async function recentFoodLogs(userId: string): Promise<Record<string, unknown>[]> {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("food_logs")
    .select("food_name, calories, protein_g, carbs_g, fat_g, log_date, meal_slot")
    .eq("user_id", userId)
    .gte("log_date", since)
    .order("log_date", { ascending: false })
    .limit(30);
  return data ?? [];
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
      const { data: plan } = await admin
        .from("meal_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("week_start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!plan) return jsonRes({ plan: null, meals: [] });

      const { data: meals } = await admin
        .from("planned_meals")
        .select("*")
        .eq("plan_id", plan.id)
        .order("day_of_week", { ascending: true })
        .order("sort_order", { ascending: true });

      return jsonRes({ plan, meals: meals ?? [] });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action ?? "generate";

      const [{ data: targets }, { data: profile }] = await Promise.all([
        admin.from("nutrition_targets").select("*").eq("user_id", userId).maybeSingle(),
        admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      ]);

      if (!targets) return jsonRes({ error: "Set nutrition targets first (POST /nutrition-targets {action:'derive'})" }, 400);
      if (!profile) return jsonRes({ error: "Profile not found" }, 404);

      // Training days from profile.training_days_per_week. Default: Mon/Wed/Fri.
      const dpw = Number(profile.training_days_per_week) || 3;
      const TRAINING_DAY_MAP: Record<number, number[]> = {
        1: [3],
        2: [1, 4],
        3: [1, 3, 5],
        4: [1, 2, 4, 5],
        5: [1, 2, 3, 4, 5],
        6: [1, 2, 3, 4, 5, 6],
        7: [0, 1, 2, 3, 4, 5, 6],
      };
      const trainingDays = TRAINING_DAY_MAP[dpw] ?? [1, 3, 5];

      const targetsMap = {
        training_calories: targets.training_calories,
        training_protein_g: targets.training_protein_g,
        training_carbs_g: targets.training_carbs_g,
        training_fat_g: targets.training_fat_g,
        rest_calories: targets.rest_calories,
        rest_protein_g: targets.rest_protein_g,
        rest_carbs_g: targets.rest_carbs_g,
        rest_fat_g: targets.rest_fat_g,
      };

      const logs = action === "recalibrate" ? await recentFoodLogs(userId) : [];
      const meals = await generateAIMealPlan(targetsMap, profile, trainingDays, logs);

      const weekStart = getWeekStart(new Date(), await getUserTimezone(userId));

      // Archive prior active plan for this week
      await admin
        .from("meal_plans")
        .update({ status: "archived" })
        .eq("user_id", userId)
        .eq("week_start_date", weekStart);

      const { data: newPlan, error: insErr } = await admin
        .from("meal_plans")
        .insert({
          user_id: userId,
          week_start_date: weekStart,
          status: "active",
          targets_snapshot: targets,
          notes: action === "recalibrate" ? "Recalibrated from last 7 days logged." : null,
        })
        .select()
        .single();
      if (insErr) {
        if (insErr.code === "23505") {
          // unique constraint — fetch existing
          const { data: existing } = await admin
            .from("meal_plans")
            .select("*")
            .eq("user_id", userId)
            .eq("week_start_date", weekStart)
            .maybeSingle();
          if (existing) {
            await admin.from("meal_plans").update({ status: "active" }).eq("id", existing.id);
            await admin.from("planned_meals").delete().eq("plan_id", existing.id);
            await insertMeals(existing.id, userId, meals);
            return jsonRes({ plan: existing, meals_inserted: meals.length });
          }
        }
        throw insErr;
      }

      await insertMeals(newPlan.id, userId, meals);
      return jsonRes({ plan: newPlan, meals_inserted: meals.length });
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[meal-plan] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});

async function insertMeals(planId: string, userId: string, meals: MealPlanMeal[]): Promise<void> {
  if (meals.length === 0) return;
  const rows = meals.map((m, idx) => ({
    plan_id: planId,
    user_id: userId,
    day_of_week: m.day_of_week,
    is_training_day: m.is_training_day,
    meal_slot: m.meal_slot,
    title: m.title,
    description: m.description,
    calories: m.calories,
    protein_g: m.protein_g,
    carbs_g: m.carbs_g,
    fat_g: m.fat_g,
    fiber_g: m.fiber_g,
    items: m.items,
    sort_order: idx,
  }));
  // Insert in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await admin.from("planned_meals").insert(chunk);
    if (error) throw error;
  }
}
