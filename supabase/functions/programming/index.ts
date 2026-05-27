// Edge Function: programming
//   GET                                  → active program with current week
//   GET ?action=list                     → list user's programs
//   GET ?action=week&program_id=&week=N  → expanded week with days + exercises
//   POST {action:'generate', goal_type, split_type, days_per_week, weeks_total?}
//   POST {action:'advance_week', program_id}      → bump current_week
//   POST {action:'archive', program_id}           → set status=archived
//   POST {action:'reactivate', program_id}        → set status=active

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
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const VALID_GOAL = new Set(["muscle_building", "leaning_out", "weight_loss", "maintenance", "strength", "endurance"]);
const VALID_SPLIT = new Set(["ppl_3day", "pp_sh_l_5day", "pp_sh_l_6day", "upper_lower", "full_body", "custom"]);

interface PRStateRow {
  lift_name: string;
  weight_lbs: number;
  reps: number;
  estimated_1rm: number;
}

interface TemplateExercise {
  slug: string;
  sets: number;
  reps: [number, number];
  rest: number;
}

interface TemplateDay {
  day: number;
  body_part: string;
  title: string;
  exercises: TemplateExercise[];
}

interface TemplateStructure {
  days: TemplateDay[];
}

async function generateProgramFromTemplate(
  userId: string,
  goal: string,
  split: string,
  daysPerWeek: number,
  weeksTotal: number,
  periodization: 'linear' | 'undulating' | 'block' | 'none',
  prs: PRStateRow[]
) {
  // Find a matching template
  const { data: tpl } = await admin
    .from("program_templates")
    .select("*")
    .eq("split_type", split)
    .maybeSingle();

  if (!tpl) throw new Error("template not found for split_type " + split);

  const structure: TemplateStructure = tpl.structure as TemplateStructure;
  const exerciseNameBySlug = new Map<string, string>();
  {
    const { data: exs } = await admin
      .from("exercises")
      .select("slug, name")
      .in("slug", structure.days.flatMap((d) => d.exercises.map((e) => e.slug)));
    for (const e of exs ?? []) exerciseNameBySlug.set(e.slug, e.name);
  }
  const prByLower = new Map<string, PRStateRow>();
  for (const p of prs) prByLower.set(p.lift_name.toLowerCase().trim(), p);

  // Archive any existing active program
  await admin.from("workout_programs")
    .update({ status: "archived" })
    .eq("user_id", userId)
    .eq("status", "active");

  const { data: program, error: pErr } = await admin
    .from("workout_programs")
    .insert({
      user_id: userId,
      name: tpl.name,
      goal_type: goal,
      split_type: split,
      days_per_week: daysPerWeek,
      weeks_total: weeksTotal,
      current_week: 1,
      periodization,
      deload_every: periodization !== "none" ? 4 : null,
      status: "active",
      inputs_snapshot: { template_slug: tpl.slug, source: "template" },
    })
    .select()
    .single();

  if (pErr) throw pErr;

  for (let wk = 1; wk <= weeksTotal; wk++) {
    const isDeload = periodization !== "none" && wk % 4 === 0;
    const intensityPct = isDeload ? 0.7 : 1 + Math.min(0.04 * (wk - 1), 0.16);
    const volumePct = isDeload ? 0.6 : 1.0;
    const { data: weekRow, error: wErr } = await admin
      .from("program_weeks")
      .insert({
        program_id: program.id,
        user_id: userId,
        week_number: wk,
        is_deload: isDeload,
        intensity_pct: Number(intensityPct.toFixed(2)),
        volume_pct: Number(volumePct.toFixed(2)),
        notes: isDeload ? "Deload week — back off intensity and volume." : null,
      })
      .select()
      .single();
    if (wErr) throw wErr;

    for (const dayDef of structure.days) {
      const { data: dayRow, error: dErr } = await admin
        .from("program_days")
        .insert({
          week_id: weekRow.id,
          program_id: program.id,
          user_id: userId,
          day_index: dayDef.day,
          body_part: dayDef.body_part,
          title: dayDef.title,
        })
        .select()
        .single();
      if (dErr) throw dErr;

      const exRows = dayDef.exercises.map((ex, idx) => {
        const name = exerciseNameBySlug.get(ex.slug) ?? ex.slug;
        const pr = prByLower.get(name.toLowerCase());
        // Target weight: 70% of e1rm * intensity_pct (rounded to 5)
        let target_w: number | null = null;
        if (pr?.estimated_1rm) {
          const base = pr.estimated_1rm * 0.7 * intensityPct;
          target_w = Math.round(base / 5) * 5;
        }
        // DB constraint: rest_seconds IS NULL OR BETWEEN 30 AND 600.
        // Treat <30 (incl. 0 = "no rest") as NULL rather than crashing the whole insert.
        const rawRest = typeof ex.rest === "number" && Number.isFinite(ex.rest) ? ex.rest : null;
        const rest_seconds = rawRest == null
          ? null
          : rawRest < 30
            ? null
            : rawRest > 600
              ? 600
              : rawRest;
        // Reps constraint: 1..60. Clamp so range-style exercises (planks/cardio) don't crash.
        const clampReps = (n: number | undefined) =>
          typeof n === "number" && Number.isFinite(n) ? Math.min(60, Math.max(1, Math.round(n))) : null;
        return {
          day_id: dayRow.id,
          program_id: program.id,
          user_id: userId,
          exercise_slug: ex.slug,
          exercise_name: name,
          target_sets: isDeload ? Math.max(1, ex.sets - 1) : ex.sets,
          target_reps_low: clampReps(ex.reps?.[0]),
          target_reps_high: clampReps(ex.reps?.[1]),
          target_pct_e1rm: 0.7,
          target_weight_lbs: target_w,
          rest_seconds,
          sort_order: idx,
        };
      });

      if (exRows.length > 0) {
        const { error: exErr } = await admin.from("program_exercises").insert(exRows);
        if (exErr) throw exErr;
      }
    }
  }

  return program;
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
      const url = new URL(req.url);
      const action = url.searchParams.get("action");

      if (action === "list") {
        const { data, error } = await admin
          .from("workout_programs")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return jsonRes({ programs: data ?? [] });
      }

      if (action === "week") {
        const programId = url.searchParams.get("program_id");
        const week = Number(url.searchParams.get("week") ?? "1");
        if (!programId) return jsonRes({ error: "program_id required" }, 400);
        const { data: weekRow, error: wErr } = await admin
          .from("program_weeks")
          .select("*")
          .eq("program_id", programId)
          .eq("user_id", userId)
          .eq("week_number", week)
          .maybeSingle();
        if (wErr) throw wErr;
        if (!weekRow) return jsonRes({ week: null, days: [] });

        const { data: days } = await admin
          .from("program_days")
          .select("*")
          .eq("week_id", weekRow.id)
          .eq("user_id", userId)
          .order("day_index", { ascending: true });

        const dayIds = (days ?? []).map((d) => d.id);
        const { data: exercises } = dayIds.length
          ? await admin
              .from("program_exercises")
              .select("*")
              .in("day_id", dayIds)
              .eq("user_id", userId)
              .order("sort_order", { ascending: true })
          : { data: [] };

        const exByDay = new Map<string, typeof exercises>();
        for (const ex of exercises ?? []) {
          if (!exByDay.has(ex.day_id)) exByDay.set(ex.day_id, []);
          exByDay.get(ex.day_id)!.push(ex);
        }

        const daysOut = (days ?? []).map((d) => ({ ...d, exercises: exByDay.get(d.id) ?? [] }));
        return jsonRes({ week: weekRow, days: daysOut });
      }

      // Default: active program + current week summary
      const { data: program, error: pErr } = await admin
        .from("workout_programs")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (pErr) throw pErr;
      if (!program) return jsonRes({ program: null });
      return jsonRes({ program });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action;

      if (action === "generate") {
        const goal = String(body.goal_type ?? "muscle_building");
        const split = String(body.split_type ?? "ppl_3day");
        const daysPerWeek = Math.min(Math.max(Number(body.days_per_week ?? 3), 1), 7);
        const weeksTotal = Math.min(Math.max(Number(body.weeks_total ?? 8), 1), 24);
        const periodization = ["linear","undulating","block","none"].includes(String(body.periodization))
          ? body.periodization : "linear";

        if (!VALID_GOAL.has(goal)) return jsonRes({ error: "invalid goal_type" }, 400);
        if (!VALID_SPLIT.has(split)) return jsonRes({ error: "invalid split_type" }, 400);

        // Pull PRs to seed target weights
        const { data: prs } = await admin
          .from("pr_lifts")
          .select("lift_name, weight_lbs, reps, estimated_1rm")
          .eq("user_id", userId);

        const program = await generateProgramFromTemplate(
          userId, goal, split, daysPerWeek, weeksTotal, periodization, (prs ?? []) as PRStateRow[]
        );
        return jsonRes({ program });
      }

      if (action === "advance_week") {
        const pid = String(body.program_id ?? "");
        if (!pid) return jsonRes({ error: "program_id required" }, 400);
        const { data: cur } = await admin
          .from("workout_programs")
          .select("*")
          .eq("id", pid)
          .eq("user_id", userId)
          .maybeSingle();
        if (!cur) return jsonRes({ error: "not found" }, 404);
        const next = Math.min(cur.current_week + 1, cur.weeks_total);
        const newStatus = next > cur.weeks_total ? "completed" : cur.status;
        const { data, error } = await admin
          .from("workout_programs")
          .update({ current_week: next, status: newStatus })
          .eq("id", pid)
          .eq("user_id", userId)
          .select()
          .single();
        if (error) throw error;
        return jsonRes({ program: data });
      }

      if (action === "archive" || action === "reactivate") {
        const pid = String(body.program_id ?? "");
        if (!pid) return jsonRes({ error: "program_id required" }, 400);

        if (action === "reactivate") {
          await admin.from("workout_programs")
            .update({ status: "archived" })
            .eq("user_id", userId)
            .eq("status", "active");
        }

        const { data, error } = await admin
          .from("workout_programs")
          .update({ status: action === "archive" ? "archived" : "active" })
          .eq("id", pid)
          .eq("user_id", userId)
          .select()
          .single();
        if (error) throw error;
        return jsonRes({ program: data });
      }

      return jsonRes({ error: "unknown action" }, 400);
    }

    return jsonRes({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("[programming] error:", e);
    return jsonRes({ error: (e as Error).message || "Internal server error" }, 500);
  }
});
