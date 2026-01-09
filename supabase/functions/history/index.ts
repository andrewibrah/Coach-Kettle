// Edge Function: history
// CRUD operations for workout history

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

interface WorkoutRow {
    id?: string;
    exercise: string;
    weightLbs: string;
    reps: string;
    notes: string;
    timestamp?: number;
}

interface WorkoutSession {
    id: string;
    dateISO: string;
    part: string;
    rows: WorkoutRow[];
    createdAt: number;
}

function getSupabaseClient() {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Missing Supabase env vars");
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

// POST: Save/upsert workout session
async function saveWorkout(session: WorkoutSession): Promise<Response> {
    const supabase = getSupabaseClient();

    const rowsJson = JSON.stringify(session.rows);

    const { error } = await supabase
        .from("workouts")
        .upsert({
            id: session.id,
            dateISO: session.dateISO,
            part: session.part,
            createdAt: session.createdAt,
            rows_json: rowsJson,
        }, { onConflict: "id" });

    if (error) {
        console.error("[history] Database error:", error);
        return new Response(
            JSON.stringify({ error: "Database error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

// GET: List all workouts
async function listWorkouts(): Promise<Response> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
        .from("workouts")
        .select("id, dateISO, part, createdAt, rows_json")
        .order("createdAt", { ascending: false });

    if (error) {
        console.error("[history] Database error:", error);
        return new Response(
            JSON.stringify({ error: "Database error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const sessions: WorkoutSession[] = (data || []).map((row: any) => {
        let rows: WorkoutRow[] = [];
        try {
            rows = JSON.parse(row.rows_json || "[]");
        } catch {
            rows = [];
        }

        return {
            id: row.id,
            dateISO: row.dateISO,
            part: row.part,
            rows,
            createdAt: row.createdAt,
        };
    });

    return new Response(
        JSON.stringify(sessions),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

// DELETE: Delete workout by ID
async function deleteWorkout(workoutId: string): Promise<Response> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
        .from("workouts")
        .delete()
        .eq("id", workoutId);

    if (error) {
        console.error("[history] Database error:", error);
        return new Response(
            JSON.stringify({ error: "Database error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(p => p);
    // Path format: /history or /history/{id}
    // Since Supabase functions use /function-name, we check the last parts
    const workoutId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

    try {
        if (req.method === "POST") {
            let payload: WorkoutSession;
            try {
                payload = await req.json();
            } catch {
                return new Response(
                    JSON.stringify({ error: "Invalid JSON" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (!payload.id || !payload.dateISO || !payload.part) {
                return new Response(
                    JSON.stringify({ error: "id, dateISO, and part are required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return await saveWorkout(payload);
        }

        if (req.method === "GET") {
            return await listWorkouts();
        }

        if (req.method === "DELETE") {
            // Try to get workout ID from path or query param
            let idToDelete = workoutId;

            if (!idToDelete) {
                // Check query param
                idToDelete = url.searchParams.get("id");
            }

            if (!idToDelete) {
                // Check body
                try {
                    const body = await req.json();
                    idToDelete = body.id;
                } catch {
                    // No body
                }
            }

            if (!idToDelete) {
                return new Response(
                    JSON.stringify({ error: "workout_id is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return await deleteWorkout(idToDelete);
        }

        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[history] Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
