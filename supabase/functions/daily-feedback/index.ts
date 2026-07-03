// Edge Function: daily-feedback
//   GET ?action=today                    → today's feedback (generate on demand)
//   GET ?action=recent&days=7            → last N days
//   POST { action: 'generate', date? }   → (re)generate for a date
//   POST { action: 'state' }             → current behavior_state
//
// Harshness state machine:
//   0 = supportive   (default)
//   1 = firm         (after 1 bad day or 1 streak break)
//   2 = direct       (after 2 consecutive bad days)
//   3 = accountability (after 3+ consecutive bad days)
//
// A "bad day": nutrition_color === 'red' OR (workout day missed AND not rest day).
// A "good day": nutrition_color === 'green' AND workout (when scheduled) completed.

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

function jsonRes(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

interface NutritionTargets {
  training_calories: number; training_protein_g: number; training_carbs_g: number; training_fat_g: number;
  rest_calories: number; rest_protein_g: number; rest_carbs_g: number; rest_fat_g: number;
  fiber_g_min: number; saturated_fat_g_max: number;
}

interface DayTotals {
  calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; saturated_fat_g: number;
}

function gradeNutrition(t: DayTotals, tg: NutritionTargets, isTrainingDay: boolean): {
  color: 'green' | 'yellow' | 'red'; score: number; gaps: Record<string, unknown>;
} {
  if (!tg) return { color: "yellow", score: 50, gaps: {} };
  const cal = isTrainingDay ? tg.training_calories : tg.rest_calories;
  const prot = isTrainingDay ? tg.training_protein_g : tg.rest_protein_g;
  const carb = isTrainingDay ? tg.training_carbs_g : tg.rest_carbs_g;
  const fat = isTrainingDay ? tg.training_fat_g : tg.rest_fat_g;

  // Score: 0–100 based on macro adherence (closer to target → higher)
  const calScore = scoreNear(t.calories, cal, 0.10);    // ±10% sweet spot
  const protScore = scoreOver(t.protein_g, prot, 0.85); // hitting protein matters most
  const carbScore = scoreNear(t.carbs_g, carb, 0.15);
  const fatScore = scoreNear(t.fat_g, fat, 0.15);
  const fiberScore = t.fiber_g >= tg.fiber_g_min ? 100 : (t.fiber_g / tg.fiber_g_min) * 100;
  const satScore = t.saturated_fat_g <= tg.saturated_fat_g_max ? 100 : Math.max(0, 100 - (t.saturated_fat_g - tg.saturated_fat_g_max) * 5);

  const weighted = calScore * 0.25 + protScore * 0.30 + carbScore * 0.15 + fatScore * 0.15 + fiberScore * 0.10 + satScore * 0.05;
  const score = Math.round(weighted);
  const color: 'green' | 'yellow' | 'red' = score >= 80 ? "green" : score >= 60 ? "yellow" : "red";

  const gaps = {
    calorie_gap: Math.round(t.calories - cal),
    protein_gap_g: Math.round(t.protein_g - prot),
    carb_gap_g: Math.round(t.carbs_g - carb),
    fat_gap_g: Math.round(t.fat_g - fat),
    fiber_status: t.fiber_g < tg.fiber_g_min ? "low" : "ok",
    saturated_fat_status: t.saturated_fat_g > tg.saturated_fat_g_max ? "high" : "ok",
  };
  return { color, score, gaps };
}

function scoreNear(actual: number, target: number, tolerance: number): number {
  if (target <= 0) return 50;
  const diff = Math.abs(actual - target) / target;
  if (diff <= tolerance) return 100;
  return Math.max(0, 100 - (diff - tolerance) * 200);
}

function scoreOver(actual: number, target: number, floorPct: number): number {
  if (target <= 0) return 50;
  const ratio = actual / target;
  if (ratio < floorPct) return Math.max(0, (ratio / floorPct) * 60);
  return Math.min(100, 60 + ((ratio - floorPct) / (1 - floorPct)) * 40);
}

function buildNarrative(args: {
  tone: 'supportive' | 'firm' | 'direct' | 'accountability';
  nutritionColor: 'green' | 'yellow' | 'red' | null;
  workoutDone: boolean;
  wasWorkoutDay: boolean;
  gaps: Record<string, unknown>;
  streak: number;
  badStreak: number;
}): { did_well: string; needs_improvement: string; tomorrow_focus: string } {
  const { tone, nutritionColor, workoutDone, wasWorkoutDay, gaps, streak, badStreak } = args;
  const proteinGap = Number(gaps.protein_gap_g ?? 0);
  const calorieGap = Number(gaps.calorie_gap ?? 0);
  const fiberLow = gaps.fiber_status === "low";

  // did_well: pick a genuine positive
  let didWell: string;
  if (nutritionColor === "green" && workoutDone) {
    didWell = `Hit your macros and finished the workout. ${streak > 1 ? `${streak}-day streak.` : "Quality day."}`;
  } else if (nutritionColor === "green") {
    didWell = `Nutrition landed inside targets. Strong logging discipline.`;
  } else if (workoutDone) {
    didWell = `Got the training session done${wasWorkoutDay ? " on a scheduled day" : ""}. That part stayed locked in.`;
  } else if (Math.abs(calorieGap) <= 200) {
    didWell = `Calories were close to target — direction was right, even if macros wobbled.`;
  } else {
    didWell = `You logged. Tracking is the foundation; that part you owned today.`;
  }

  // needs_improvement: name the specific gap
  let needsImprovement: string;
  if (proteinGap < -20) {
    needsImprovement = `Protein finished ${Math.abs(proteinGap)}g under target. That's the muscle-retention lever — non-negotiable when you're training hard.`;
  } else if (calorieGap > 300) {
    needsImprovement = `Calories ran ${calorieGap} over target. One overshoot is fine; pattern matters more than the day.`;
  } else if (calorieGap < -400) {
    needsImprovement = `Calories landed ${Math.abs(calorieGap)} under target. Under-fueling kills recovery and next-day performance.`;
  } else if (fiberLow) {
    needsImprovement = `Fiber under 25g. Trade refined carbs for vegetables / beans / oats tomorrow.`;
  } else if (wasWorkoutDay && !workoutDone) {
    needsImprovement = `Scheduled training day, no workout logged. The plan doesn't work if it doesn't get executed.`;
  } else if (nutritionColor === "yellow") {
    needsImprovement = `Macros were "close enough" — yellow is the trap zone. Tighten one number tomorrow.`;
  } else {
    needsImprovement = `Nothing flagged hard today — push for excellence, not just adequacy.`;
  }

  // Harshness modifier on tone
  if (tone === "direct" || tone === "accountability") {
    if (badStreak >= 2) {
      needsImprovement = `${needsImprovement} This is ${badStreak} days in a row. Pick one habit tomorrow and execute it without negotiation.`;
    }
  }
  if (tone === "accountability") {
    needsImprovement = `${needsImprovement} You know what to do. Stop debating it.`;
  }
  if (tone === "supportive" && badStreak === 0 && streak >= 3) {
    didWell = `${didWell} You've built momentum — protect it.`;
  }

  // tomorrow_focus: one clear directive
  let focus: string;
  if (proteinGap < -20) focus = `Front-load protein tomorrow: 40g at breakfast (eggs + Greek yogurt or shake).`;
  else if (calorieGap > 300) focus = `Tomorrow: same calorie target, drop one snack or one fat-heavy side.`;
  else if (calorieGap < -400) focus = `Eat the planned dinner. Add a 200-cal snack post-workout. Don't undereat.`;
  else if (wasWorkoutDay && !workoutDone) focus = `Get tomorrow's session done within the first half of the day. Don't let it slide twice.`;
  else if (fiberLow) focus = `Add one fiber source per meal tomorrow (oats / beans / a vegetable side).`;
  else if (nutritionColor === "green" && workoutDone) focus = `Repeat today. Don't change a single variable.`;
  else focus = `Lock in protein and the workout. The rest follows.`;

  return { did_well: didWell, needs_improvement: needsImprovement, tomorrow_focus: focus };
}

async function getWorkoutDoneForDate(userId: string, date: string): Promise<boolean> {
  const { count, error } = await admin
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("dateISO", date);
  if (error) return false;
  return (count ?? 0) > 0;
}

async function getNutritionTotals(userClient: ReturnType<typeof createClient>, userId: string, date: string): Promise<DayTotals> {
  const { data } = await userClient.rpc("get_food_daily_totals", { p_user_id: userId, p_date: date });
  const row = Array.isArray(data) ? data[0] : data;
  return {
    calories: Number(row?.calories ?? 0),
    protein_g: Number(row?.protein_g ?? 0),
    carbs_g: Number(row?.carbs_g ?? 0),
    fat_g: Number(row?.fat_g ?? 0),
    fiber_g: Number(row?.fiber_g ?? 0),
    saturated_fat_g: Number(row?.saturated_fat_g ?? 0),
  };
}

type BehaviorEventKind = 'good_day' | 'bad_day' | 'plan_recalibrated' | 'neutral_day';

function deriveStateFromEvents(events: { event_date: string; kind: BehaviorEventKind }[]) {
  let level = 0;
  let goodStreak = 0;
  let badStreak = 0;
  let lastGoodDay: string | null = null;
  let lastBadDay: string | null = null;
  let lastEvaluatedDate: string | null = null;

  for (const ev of events) {
    lastEvaluatedDate = ev.event_date;
    if (ev.kind === "bad_day") {
      badStreak += 1;
      goodStreak = 0;
      lastBadDay = ev.event_date;
      if (badStreak >= 3) level = 3;
      else if (badStreak === 2) level = 2;
      else level = Math.max(level, 1);
    } else if (ev.kind === "good_day") {
      goodStreak += 1;
      badStreak = 0;
      lastGoodDay = ev.event_date;
      level = Math.max(0, level - 1);
    } else if (ev.kind === "neutral_day") {
      // neutral day: no streak change, no level change
    } else {
      // plan_recalibrated: reset both streaks (legacy behavior)
      goodStreak = 0;
      badStreak = 0;
    }
  }

  return { level, goodStreak, badStreak, lastGoodDay, lastBadDay, lastEvaluatedDate };
}

async function updateBehaviorState(
  userId: string,
  dateIso: string,
  isGood: boolean,
  isBad: boolean,
  payload: Record<string, unknown>
) {
  const kind: BehaviorEventKind = isGood ? "good_day" : isBad ? "bad_day" : "neutral_day";

  const { error: eventError } = await admin
    .from("behavior_events")
    .upsert({
      user_id: userId,
      event_date: dateIso,
      kind,
      delta_harshness: 0,
      payload,
    }, { onConflict: "user_id,event_date" });
  if (eventError) throw eventError;

  const since = new Date(`${dateIso}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 90);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data: events, error: eventsError } = await admin
    .from("behavior_events")
    .select("event_date, kind")
    .eq("user_id", userId)
    .gte("event_date", sinceIso)
    .lte("event_date", dateIso)
    .order("event_date", { ascending: true });
  if (eventsError) throw eventsError;

  const { level, goodStreak, badStreak, lastGoodDay, lastBadDay, lastEvaluatedDate } = deriveStateFromEvents(
    ((events ?? []) as { event_date: string; kind: BehaviorEventKind }[])
      .filter((ev) => ["good_day", "bad_day", "plan_recalibrated", "neutral_day"].includes(ev.kind))
  );

  const row = {
    user_id: userId,
    harshness_level: level,
    consecutive_good_days: goodStreak,
    consecutive_bad_days: badStreak,
    last_evaluated_date: lastEvaluatedDate ?? dateIso,
    last_bad_day_date: lastBadDay,
    last_good_day_date: lastGoodDay,
  };

  await admin
    .from("behavior_state")
    .upsert(row, { onConflict: "user_id" });

  return { level, goodStreak, badStreak };
}

/** Calendar date (YYYY-MM-DD) in the given IANA timezone. */
function todayInTz(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  } catch {
    return today();
  }
}

async function generateFeedback(userClient: ReturnType<typeof createClient>, userId: string, requestedDate: string | null) {
  const [{ data: targets }, { data: profile }, { data: notifPrefs }] = await Promise.all([
    admin.from("nutrition_targets").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("notification_preferences").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);

  const timezone = notifPrefs?.timezone ?? "America/New_York";
  const localToday = todayInTz(timezone);
  const date = requestedDate ?? localToday;
  // An in-progress day must never be graded as failed — the user may still
  // train and eat. Only completed (past) days can be "bad".
  const isInProgressDay = date >= localToday;

  const totals = await getNutritionTotals(userClient, userId, date);
  const workoutDone = await getWorkoutDoneForDate(userId, date);

  // Did the user log any food at all for this date? Zero logs must not be
  // graded red — it just means "nothing logged yet".
  const { count: foodLogCount } = await admin
    .from("food_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("log_date", date);
  const hasFoodLogs = (foodLogCount ?? 0) > 0;

  // Determine if this was a workout day: explicit user-selected days win,
  // otherwise fall back to the days-per-week heuristic.
  const dpw = Number(profile?.training_days_per_week ?? 0);

  const localDow = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00Z`));
  const DOW_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = DOW_MAP[localDow] ?? new Date(`${date}T12:00:00Z`).getUTCDay();

  const TRAINING_DAY_MAP_LOCAL: Record<number, number[]> = {
    1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  const explicitDays: number[] | null = Array.isArray(profile?.training_days) && profile.training_days.length > 0
    ? profile.training_days.map((d: unknown) => Number(d))
    : null;
  const wasWorkoutDay = explicitDays
    ? explicitDays.includes(dow)
    : (TRAINING_DAY_MAP_LOCAL[dpw] ?? []).includes(dow);
  // Schedule-based only — spontaneous training on a rest day doesn't change calorie targets
  const isTrainingDay = wasWorkoutDay;

  let nutritionColor: 'green'|'yellow'|'red'|null = null;
  let nutritionScore: number|null = null;
  let gaps: Record<string, unknown> = {};
  if (targets && hasFoodLogs) {
    const g = gradeNutrition(totals, targets as NutritionTargets, isTrainingDay);
    nutritionColor = g.color; nutritionScore = g.score; gaps = g.gaps;
  }

  // Snapshot daily_nutrition_summary
  if (targets && hasFoodLogs) {
    await admin.from("daily_nutrition_summaries").upsert({
      user_id: userId,
      summary_date: date,
      is_training_day: isTrainingDay,
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      fiber_g: totals.fiber_g,
      saturated_fat_g: totals.saturated_fat_g,
      calorie_target: isTrainingDay ? targets.training_calories : targets.rest_calories,
      protein_target: isTrainingDay ? targets.training_protein_g : targets.rest_protein_g,
      carb_target: isTrainingDay ? targets.training_carbs_g : targets.rest_carbs_g,
      fat_target: isTrainingDay ? targets.training_fat_g : targets.rest_fat_g,
      color_grade: nutritionColor,
      score: nutritionScore,
      gap_summary: gaps,
    }, { onConflict: "user_id,summary_date" });
  }

  // Determine good vs bad day.
  // In-progress days can earn "good" but never "bad" — grading a day as
  // failed at breakfast (no food logged, workout not yet done) was both
  // wrong and demoralizing. Bad days are only assessed for completed days.
  const isGood = nutritionColor === "green" && (workoutDone || !wasWorkoutDay);
  const isBad = !isInProgressDay && !isGood
    && (nutritionColor === "red" || (wasWorkoutDay && !workoutDone));

  const { level, goodStreak, badStreak } = await updateBehaviorState(userId, date, isGood, isBad, {
    score: nutritionScore,
    workoutDone,
    wasWorkoutDay,
    nutritionColor,
  });

  const tone: 'supportive' | 'firm' | 'direct' | 'accountability' =
    level === 3 ? "accountability" : level === 2 ? "direct" : level === 1 ? "firm" : "supportive";

  const narrative = buildNarrative({
    tone,
    nutritionColor,
    workoutDone,
    wasWorkoutDay,
    gaps,
    streak: goodStreak,
    badStreak,
  });

  const overallColor: 'green' | 'yellow' | 'red' =
    isGood ? "green" : isBad ? "red" : "yellow";

  const row = {
    user_id: userId,
    feedback_date: date,
    workout_completed: workoutDone,
    nutrition_color: nutritionColor,
    nutrition_score: nutritionScore,
    nutrition_grade: nutritionScore == null ? null : (nutritionScore >= 90 ? "A" : nutritionScore >= 80 ? "B" : nutritionScore >= 70 ? "C" : nutritionScore >= 60 ? "D" : "F"),
    workout_grade: workoutDone ? "✓" : (wasWorkoutDay ? "✗" : "—"),
    overall_color: overallColor,
    did_well: narrative.did_well,
    needs_improvement: narrative.needs_improvement,
    tomorrow_focus: narrative.tomorrow_focus,
    harshness_level: level,
    tone,
    streak_days: goodStreak,
    bad_days_streak: badStreak,
  };

  const { data, error } = await admin
    .from("daily_feedback")
    .upsert(row, { onConflict: "user_id,feedback_date" })
    .select()
    .single();
  if (error) throw error;

  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData.user) return jsonRes({ error: "Unauthorized" }, 401);
  const userId = authData.user.id;

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action") ?? "today";

      if (action === "today") {
        // Always regenerate so it reflects today's logging in real time.
        // null → generateFeedback resolves "today" in the user's timezone.
        const fb = await generateFeedback(userClient, userId, null);
        return jsonRes({ feedback: fb });
      }

      if (action === "recent") {
        const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "7"), 1), 90);
        const { data, error } = await userClient.rpc("get_recent_daily_feedback", {
          p_user_id: userId,
          p_days: days,
        });
        if (error) throw error;
        return jsonRes({ feedback: data ?? [] });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;

      if (action === "generate") {
        if (body.date !== undefined && !isIsoDate(body.date)) {
          return jsonRes({ error: "date YYYY-MM-DD required" }, 400);
        }
        const fb = await generateFeedback(userClient, userId, body.date ?? null);
        return jsonRes({ feedback: fb });
      }

      if (action === "state") {
        const { data } = await admin
          .from("behavior_state")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        return jsonRes({ state: data });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[daily-feedback] error:", e);
    return jsonRes({ error: (e as Error).message || "Internal server error" }, 500);
  }
});
