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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";
import { resolveApprovedNutritionTarget } from '../_shared/nutritionTargetResolution.ts';
import { loadApprovedNutritionTargetInputs } from '../_shared/nutritionTargetLoading.ts';

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
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith("0000")) return false;
  const parsed = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
}

interface NutritionTargets {
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
}

interface DayTotals {
  log_count: number;
  calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; saturated_fat_g: number;
}

function gradeNutrition(t: DayTotals, tg: NutritionTargets): {
  color: 'green' | 'yellow' | 'red'; score: number; gaps: Record<string, unknown>;
} {
  const { calories: cal, protein_g: prot, carbs_g: carb, fat_g: fat } = tg;

  // Score: 0–100 based on macro adherence (closer to target → higher)
  const calScore = scoreNear(t.calories, cal, 0.10);    // ±10% sweet spot
  const protScore = scoreOver(t.protein_g, prot, 0.85); // hitting protein matters most
  const carbScore = scoreNear(t.carbs_g, carb, 0.15);
  const fatScore = scoreNear(t.fat_g, fat, 0.15);
  // Hybrid targets and historical summaries contain only these four approved
  // goals. Normalize existing macro weights; never invent fiber/sat-fat goals
  // or borrow them from a different (legacy/current) target set.
  const weighted = (calScore * 0.25 + protScore * 0.30 + carbScore * 0.15 + fatScore * 0.15) / 0.85;
  const score = Math.round(weighted);
  const color: 'green' | 'yellow' | 'red' = score >= 80 ? "green" : score >= 60 ? "yellow" : "red";

  const gaps = {
    calorie_gap: Math.round(t.calories - cal),
    protein_gap_g: Math.round(t.protein_g - prot),
    carb_gap_g: Math.round(t.carbs_g - carb),
    fat_gap_g: Math.round(t.fat_g - fat),

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
  const { nutritionColor, workoutDone, gaps } = args;
  if (nutritionColor == null || !Number.isFinite(gaps.calorie_gap) || !Number.isFinite(gaps.protein_gap_g)) {
    return {
      did_well: workoutDone ? "A completed workout is recorded for this date." : "No completed workout is recorded for this date.",
      needs_improvement: "Not enough matching-date nutrition evidence to assess intake. Missing data is not a success or a failure.",
      tomorrow_focus: "Review your food entries and saved targets before drawing conclusions about this day.",
    };
  }
  // Logs are observations, not proof that the user recorded every meal.
  const proteinGap = Number(gaps.protein_gap_g);
  const calorieGap = Number(gaps.calorie_gap);
  return {
    did_well: workoutDone
      ? "A completed workout and food entries are recorded for this date."
      : "Food entries are recorded for this date.",
    needs_improvement: `Recorded calories are ${Math.abs(calorieGap)} ${calorieGap < 0 ? "below" : "above"} the saved target; recorded protein is ${Math.abs(proteinGap)}g ${proteinGap < 0 ? "below" : "above"}. Entries may be incomplete — this is not a complete-day assessment.`,
    tomorrow_focus: "Check portions and any missing meals before changing your intake. Use your saved targets as a planning guide.",
  };
}

async function getWorkoutDoneForDate(userId: string, date: string): Promise<boolean> {
  const { count, error } = await admin
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("dateISO", date);
  // Failed/missing evidence is unknown, not a skipped workout. Abort before
  // generating feedback or changing behavior state; retain existing reports.
  if (error || count == null || !Number.isInteger(count) || count < 0) {
    throw new Error("Workout evidence unavailable; please try again.");
  }
  return count > 0;
}

async function getNutritionTotals(userClient: typeof admin, userId: string, date: string): Promise<DayTotals> {
  const { data, error } = await userClient.rpc("get_food_daily_totals", { p_user_id: userId, p_date: date });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const keys = ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "saturated_fat_g", "log_count"];
  if (!row || keys.some(key => row[key] == null || !Number.isFinite(Number(row[key])) || Number(row[key]) < 0)) {
    throw new Error("Nutrition totals unavailable");
  }
  return {
    log_count: Number(row.log_count),
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

async function generateFeedback(userClient: typeof admin, userId: string, requestedDate: string | null) {
  const [profileResult, timezoneResult] = await Promise.all([
    admin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
    admin.from("notification_preferences").select("timezone").eq("user_id", userId).maybeSingle(),
  ]);

  if (profileResult.error || timezoneResult.error) throw new Error("Profile or timezone evidence unavailable");
  const profile = profileResult.data;
  const timezone = timezoneResult.data?.timezone ?? "America/New_York";
  const localToday = todayInTz(timezone);
  const date = requestedDate ?? localToday;
  // An in-progress day must never be graded as failed — the user may still
  // train and eat. Only completed (past) days can be "bad".
  const isInProgressDay = date >= localToday;

  const isHistorical = date < localToday;
  if (isHistorical) {
    const existing = await admin.from("daily_feedback").select("*")
      .eq("user_id", userId).eq("feedback_date", date).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.user_id === userId && existing.data?.feedback_date === date) return existing.data;
  }
  let historicalSnapshot: Record<string, unknown> | null = null;
  const totals = await getNutritionTotals(userClient, userId, date);
  const workoutDone = await getWorkoutDoneForDate(userId, date);

  // Count and totals come from the same matching-date aggregate snapshot.
  const hasFoodLogs = totals.log_count > 0;
  let targets: NutritionTargets | null;
  let wasWorkoutDay: boolean;
  if (isHistorical) {
    // Historical reports are immutable through this endpoint. Do not reinterpret
    // them using today's targets, schedule or behavior state.
    const snapshot = await admin.from("daily_nutrition_summaries").select("*")
      .eq("user_id", userId).eq("summary_date", date).maybeSingle();
    if (snapshot.error) throw snapshot.error;
    const row = snapshot.data;
    if (!row || row.user_id !== userId || row.summary_date !== date
      || typeof row.is_training_day !== 'boolean'
      || [row.calorie_target, row.protein_target, row.carb_target, row.fat_target]
        .some(value => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
      throw new Error('HISTORICAL_TARGET_SNAPSHOT_UNAVAILABLE: Historical feedback cannot be regenerated without its complete saved target snapshot.');
    }
    targets = { calories: row.calorie_target, protein_g: row.protein_target,
      carbs_g: row.carb_target, fat_g: row.fat_target };
    wasWorkoutDay = row.is_training_day;
    historicalSnapshot = row;
  } else {
    const inputs = await loadApprovedNutritionTargetInputs(userClient, userId);
    const resolution = resolveApprovedNutritionTarget({
      ...inputs, date, now: new Date(),
      daysPerWeek: profile?.training_days_per_week,
      trainingDays: profile?.training_days,
    });
    // No approved targets: still produce a workout-only report (skip nutrition
    // grading, no fabricated targets/zeros) rather than failing the whole
    // report. Only the historical path stays hard-blocked (it can never
    // regrade against today's setup state).
    targets = resolution.status === 'available' ? resolution.target : null;
    wasWorkoutDay = resolution.isTrainingDay;
  }
  const isTrainingDay = wasWorkoutDay;

  let nutritionColor: 'green'|'yellow'|'red'|null = null;
  let nutritionScore: number|null = null;
  let gaps: Record<string, unknown> = {};
  if (targets && hasFoodLogs) {
    const g = gradeNutrition(totals, targets);
    nutritionColor = g.color; nutritionScore = g.score; gaps = g.gaps;
  }

  // Never overwrite a historical target snapshot, even after log edits.
  // No summary without targets — there's nothing to grade against.
  const summary = !isHistorical && hasFoodLogs && targets ? {
      user_id: userId,
      summary_date: date,
      is_training_day: isTrainingDay,
      calories: totals.calories,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      fiber_g: totals.fiber_g,
      saturated_fat_g: totals.saturated_fat_g,
      calorie_target: targets.calories,
      protein_target: targets.protein_g,
      carb_target: targets.carbs_g,
      fat_target: targets.fat_g,
      color_grade: nutritionColor,
      score: nutritionScore,
      gap_summary: gaps,
  } : null;

  // Determine good vs bad day.
  // In-progress days can earn "good" but never "bad" — grading a day as
  // failed at breakfast (no food logged, workout not yet done) was both
  // wrong and demoralizing. Bad days are only assessed for completed days.
  const isGood = nutritionColor === "green" && (workoutDone || !wasWorkoutDay);
  const isBad = !isInProgressDay && !isGood
    && (nutritionColor === "red" || (wasWorkoutDay && !workoutDone));

  // Narrative uses evidence only, not mutable behavior state. The transaction
  // derives committed tone/streaks from events under the per-user lock.
  const level = 0, goodStreak = 0, badStreak = 0;
  const tone = "supportive" as const;

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
  };

  const { data, error } = await admin.rpc("persist_coach_feedback", {
    p_user_id: userId, p_date: date, p_historical: isHistorical,
    p_summary: summary, p_snapshot: historicalSnapshot, p_report: row,
    p_event: { kind: isGood ? "good_day" : isBad ? "bad_day" : "neutral_day",
      payload: { score: nutritionScore, workoutDone, wasWorkoutDay, nutritionColor } },
  });
  if (error) throw new Error("Feedback persistence unavailable; please try again.");
  if (data) return data;
  throw new Error('Feedback persistence unavailable; please try again.');
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
        const { data, error } = await admin
          .from("behavior_state")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (error) throw error;
        return jsonRes({ state: data });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[daily-feedback] request failed");
    const message = (e as Error).message || "Internal server error";
    const status = /^(HISTORICAL_TARGET_SNAPSHOT_UNAVAILABLE|NUTRITION_TARGET_SETUP_REQUIRED):/.test(message) ? 409 : 500;
    return jsonRes({ error: status === 409 ? message : "Feedback unavailable; please try again." }, status);
  }
});
