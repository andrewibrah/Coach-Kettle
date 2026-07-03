// Edge Function: log-set
// Per-set logging with workout_log insert for real-time PR detection
// The PR detection trigger (trg_update_pr_from_workout_log) fires
// automatically on INSERT to workout_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { epley1rm, normalizeLiftName, resolveTrackedLift } from "../_shared/liftMatching.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Singleton admin client for auth verification and DB operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

interface WorkoutRow {
    exercise: string;
    set: number;
    weightLbs: string;
    reps: string;
    notes: string;
    // Local calendar date of the session (client-provided; server UTC fallback)
    dateISO?: string;
    // Cardio fields
    isCardio?: boolean;
    durationMins?: number;
    distance?: number;
    distanceUnit?: 'miles' | 'km' | 'meters';
    heartRate?: number;
    calories?: number;
    level?: number;
}

async function verifyAuth(req: Request): Promise<string> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
        console.error("[log-set] Auth verification failed:", error?.message);
        throw new Error("Unauthorized");
    }

    return data.user.id;
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Verify JWT and get user ID
    let userId: string;
    try {
        userId = await verifyAuth(req);
    } catch {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    let payload: WorkoutRow;
    try {
        payload = await req.json();
    } catch {
        return new Response(
            JSON.stringify({ error: "Invalid JSON" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const { exercise, set, weightLbs, reps, notes, isCardio, durationMins, distance, distanceUnit, heartRate, calories, level } = payload;

    // Cardio entries may not have weightLbs/reps, so only require them for non-cardio
    if (!exercise || (!isCardio && !weightLbs && !reps)) {
        return new Response(
            JSON.stringify({ error: "Missing required fields" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    try {
        // Prefer the client's local calendar date — an 8pm EST set belongs to
        // the user's today, not tomorrow's UTC date.
        const today = typeof payload.dateISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.dateISO)
            ? payload.dateISO
            : new Date().toISOString().split("T")[0];

        // ── Canonical lift resolution + deterministic PR pre-check ──────────
        // Resolve typed shorthand ("bench") to the tracked lift's canonical
        // name ("Bench Press") so the PR trigger actually fires, and read the
        // previous e1RM BEFORE inserting so we can tell the client whether
        // this set is a PR in the response (no realtime/race dependency).
        let canonicalExercise = exercise;
        let pr: {
            liftName: string;
            weight: number;
            reps: number;
            newE1rm: number;
            previousE1rm: number | null;
        } | null = null;

        const weightNum = parseFloat(weightLbs ?? "");
        const repsNum = parseInt(reps ?? "", 10);
        const prEligible = !isCardio
            && Number.isFinite(weightNum) && weightNum > 0
            && Number.isFinite(repsNum) && repsNum > 0;

        try {
            const { data: tracked } = await supabaseAdmin
                .from("pr_tracked_lifts")
                .select("lift_name")
                .eq("user_id", userId)
                .eq("is_active", true);
            const trackedNames = (tracked ?? []).map((t: { lift_name: string }) => t.lift_name);
            const resolved = resolveTrackedLift(exercise, trackedNames);

            if (resolved) {
                canonicalExercise = resolved;
                if (prEligible) {
                    const { data: prRows } = await supabaseAdmin
                        .from("pr_lifts")
                        .select("lift_name, estimated_1rm")
                        .eq("user_id", userId);
                    const target = normalizeLiftName(resolved);
                    const current = (prRows ?? []).find(
                        (r: { lift_name: string }) => normalizeLiftName(r.lift_name) === target
                    );
                    const previousE1rm = current ? Number(current.estimated_1rm) : null;
                    const newE1rm = epley1rm(weightNum, repsNum);
                    if (previousE1rm === null || newE1rm > previousE1rm) {
                        pr = { liftName: resolved, weight: weightNum, reps: repsNum, newE1rm, previousE1rm };
                    }
                }
            }
        } catch (matchErr) {
            // PR detection is best-effort — never block set logging.
            console.warn("[log-set] PR pre-check failed:", matchErr);
        }

        const { error } = await supabaseAdmin
            .from("workout_log")
            .insert({
                workout_id: `live-${today}`,
                workout_date: today,
                user_id: userId,
                exercise: canonicalExercise,
                set_number: set || 1,
                weight_lbs: weightLbs || '0',
                reps: reps || '0',
                notes: notes || null,
                created_at: new Date().toISOString(),
                // Cardio fields
                is_cardio: isCardio ?? false,
                duration_mins: durationMins ?? null,
                distance: distance ?? null,
                distance_unit: distanceUnit ?? null,
                heart_rate: heartRate ?? null,
                calories: calories ?? null,
                level: level ?? null,
            });

        if (error) {
            console.error("[log-set] DB insert error:", error);
            return new Response(
                JSON.stringify({ error: "Failed to save set" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const logMsg = isCardio
            ? `[log-set] Inserted cardio: ${canonicalExercise} ${durationMins ?? ''}min ${distance ?? ''}${distanceUnit ?? ''} for user ${userId}`
            : `[log-set] Inserted: ${canonicalExercise} ${weightLbs}x${reps} for user ${userId}${pr ? ' — PR!' : ''}`;
        console.log(logMsg);

        return new Response(
            JSON.stringify({ ok: true, exercise: canonicalExercise, pr }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[log-set] Error:", error);
        return new Response(
            JSON.stringify({ error: "Failed to save set" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
