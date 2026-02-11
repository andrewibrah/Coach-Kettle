// Edge Function: history
// CRUD operations for workout history (per-user)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

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

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new Error("Missing Supabase env vars");
}

// Admin client for auth verification and service-level operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

function respondJson(body: unknown, status = 200) {
    return new Response(
        JSON.stringify(body),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

function createUserClient(authHeader: string): SupabaseClient {
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: { Authorization: authHeader },
        },
    });
}

async function getUserContext(authHeader: string | null): Promise<{ supabase: SupabaseClient; userId: string } | Response> {
    if (!authHeader) {
        return respondJson({ code: 401, message: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    // Use Supabase Admin SDK to verify the token (same pattern as profile, pr-tracking, workout-templates)
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
        console.error("[history] Auth verification failed:", error.message);
        return respondJson({ code: 401, message: "Invalid JWT" }, 401);
    }

    if (!data.user) {
        console.error("[history] No user returned from auth verification");
        return respondJson({ code: 401, message: "Invalid JWT" }, 401);
    }

    console.log("[history] User verified:", data.user.id);
    const supabase = createUserClient(authHeader);
    return { supabase, userId: data.user.id };
}





// POST: Save/upsert workout session
async function saveWorkout(session: WorkoutSession, supabase: SupabaseClient, userId: string): Promise<Response> {
    const rows = Array.isArray(session.rows) ? session.rows : [];
    const rowsJson = JSON.stringify(rows);

    const { data, error } = await supabase
        .from("workouts")
        .upsert({
            id: session.id,
            dateISO: session.dateISO,
            part: session.part,
            createdAt: session.createdAt,
            rows_json: rowsJson,
            user_id: userId,
        }, { onConflict: "id" })
        .select()
        .single();

    if (error) {
        console.error("[history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    // Insert rows into workout_log for PR detection trigger
    if (data && rows.length > 0) {
        const workoutLogRows = rows.map((row: WorkoutRow, index: number) => ({
            workout_id: data.id,
            workout_date: data.dateISO,
            user_id: userId,
            exercise: row.exercise,
            set_number: index + 1,
            weight_lbs: row.weightLbs || '0',
            reps: row.reps || '0',
            notes: row.notes || null,
            created_at: new Date().toISOString(),
        }));

        // Use admin client to bypass RLS for workout_log insert
        const { error: logError } = await supabaseAdmin
            .from('workout_log')
            .insert(workoutLogRows);

        if (logError) {
            console.error('[history] Error inserting workout_log (PR detection may not trigger):', logError);
            // Don't fail the entire request - workout is already saved
        } else {
            console.log(`[history] Inserted ${workoutLogRows.length} rows into workout_log for PR detection`);
        }
    }

    return respondJson({ ok: true });
}

// GET: List all workouts
async function listWorkouts(supabase: SupabaseClient, userId: string): Promise<Response> {
    const { data, error } = await supabase
        .from("workouts")
        .select("id, dateISO, part, createdAt, rows_json")
        .eq("user_id", userId)
        .order("createdAt", { ascending: false });

    if (error) {
        console.error("[history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
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

    return respondJson(sessions);
}

// DELETE: Delete workout by ID
async function deleteWorkout(workoutId: string, supabase: SupabaseClient, userId: string): Promise<Response> {
    const { error } = await supabase
        .from("workouts")
        .delete()
        .eq("id", workoutId)
        .eq("user_id", userId);

    if (error) {
        console.error("[history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    return respondJson({ ok: true });
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const authContext = await getUserContext(req.headers.get("Authorization"));
    if (authContext instanceof Response) {
        return authContext;
    }

    const { supabase, userId } = authContext;
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
                return respondJson({ error: "Invalid JSON" }, 400);
            }

            if (!payload.id || !payload.dateISO || !payload.part) {
                return respondJson({ error: "id, dateISO, and part are required" }, 400);
            }

            return await saveWorkout(payload, supabase, userId);
        }

        if (req.method === "GET") {
            return await listWorkouts(supabase, userId);
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
                return respondJson({ error: "workout_id is required" }, 400);
            }

            return await deleteWorkout(idToDelete, supabase, userId);
        }

        return respondJson({ error: "Method not allowed" }, 405);
    } catch (error) {
        console.error("[history] Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondJson({ error: message }, 500);
    }
});
