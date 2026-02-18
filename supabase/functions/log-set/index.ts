// Edge Function: log-set
// Per-set logging with workout_log insert for real-time PR detection
// The PR detection trigger (trg_update_pr_from_workout_log) fires
// automatically on INSERT to workout_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

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
        const today = new Date().toISOString().split("T")[0];

        const { error } = await supabaseAdmin
            .from("workout_log")
            .insert({
                workout_id: `live-${today}`,
                workout_date: today,
                user_id: userId,
                exercise: exercise,
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
            ? `[log-set] Inserted cardio: ${exercise} ${durationMins ?? ''}min ${distance ?? ''}${distanceUnit ?? ''} for user ${userId}`
            : `[log-set] Inserted: ${exercise} ${weightLbs}x${reps} for user ${userId}`;
        console.log(logMsg);

        return new Response(
            JSON.stringify({ ok: true, pr_check: true }),
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
