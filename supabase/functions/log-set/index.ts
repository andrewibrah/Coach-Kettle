// Edge Function: log-set
// Per-set logging with workout_log insert for real-time PR detection
// The PR detection trigger (trg_update_pr_from_workout_log) fires
// automatically on INSERT to workout_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";
import { resolveTrackedLift } from "../_shared/liftMatching.ts";
import { numericText, validateWorkoutRow } from '../_shared/workoutValidation.ts';

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
    operation?: 'put' | 'drop' | 'revise';
    sessionId: string;
    rowId: string;
    revision: number;
    operationKey: string;
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
    performance?: 'planned' | 'performed';
    status?: 'syncing' | 'committed';
    isRest?: boolean;
    setKind?: string;
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

    if (!payload.sessionId || !payload.rowId || !payload.operationKey ||
        !Number.isSafeInteger(payload.revision) || payload.revision < 1 || !payload.dateISO) {
        return new Response(JSON.stringify({ error: 'Session operation identity required.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (payload.operation !== undefined && !['put','drop','revise'].includes(payload.operation)) {
        return new Response(JSON.stringify({ error: 'Invalid session operation.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const validationError = validateWorkoutRow(payload, payload.operation !== 'revise');
    if (payload.operation !== 'drop' && (validationError || (payload.operation !== 'revise' &&
        (payload.isRest || payload.status === 'syncing' || payload.performance === 'planned')))) {
        return new Response(JSON.stringify({ error: validationError ?? 'Set is not performed.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { exercise, set, weightLbs, reps, notes, isCardio, durationMins, distance, distanceUnit, heartRate, calories, level } = payload;


    try {
        let canonicalExercise = exercise;
        let pr = null;
        // Resolve canonical tracked names; the SQL transaction owns PR acknowledgement.
        const { data: tracked, error: trackedError } = await supabaseAdmin.from('pr_tracked_lifts')
            .select('lift_name').eq('user_id', userId).eq('is_active', true);
        if (trackedError) throw new Error('Lift resolution unavailable');
        canonicalExercise = resolveTrackedLift(exercise, (tracked ?? []).map((t: { lift_name: string }) => t.lift_name)) ?? exercise;

        // The RPC runs under the verified caller JWT, never a body owner/service bypass.
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
            global: { headers: { Authorization: req.headers.get("Authorization")! } },
            auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: receipt, error } = await userClient.rpc('apply_workout_operation', {
            p_session_id: payload.sessionId,
            p_operation_key: payload.operationKey,
            p_revision: payload.revision,
            p_kind: payload.operation ?? 'put',
            p_row_id: payload.rowId,
            p_payload: { dateISO: payload.dateISO, row: {
                id: payload.rowId, exercise: canonicalExercise, set: set ?? 1,
                weightLbs: isCardio ? String(weightLbs ?? '') : numericText(weightLbs),
                reps: isCardio ? String(reps ?? '') : numericText(reps), notes,
                performance: payload.performance, setKind: payload.setKind,
                isCardio, durationMins, distance, distanceUnit, heartRate, calories, level,
            } },
        });
        // PR precheck is not an acknowledgement. Only the committed RPC can acknowledge.
        pr = receipt?.pr ?? null;
        if (!error && receipt?.ok !== true) throw new Error('Missing committed operation receipt');
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
