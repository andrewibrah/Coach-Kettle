// Edge Function: history
// CRUD operations for workout history (per-user)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { resolveTrackedLift } from "../_shared/liftMatching.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

interface WorkoutRow {
    id?: string;
    exercise: string;
    weightLbs: string;
    reps: string;
    notes: string;
    timestamp?: number;
    // Cardio-specific fields
    isCardio?: boolean;
    durationMins?: number;
    distance?: number;
    distanceUnit?: 'miles' | 'km' | 'meters';
    heartRate?: number;
    calories?: number;
    level?: number;
}

interface SessionReview {
    rating: number;
    strengths: string[];
    weakness: string;
    nextSessionNote: string;
    generatedAt: number;
}

interface WorkoutSession {
    id: string;
    dateISO: string;
    part: string;
    rows: WorkoutRow[];
    createdAt: number;
    review?: SessionReview;
    reflection?: string;
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

    // Serialize review if present
    const reviewJson = session.review ? JSON.stringify(session.review) : null;

    const { data, error } = await supabase
        .from("workouts")
        .upsert({
            id: session.id,
            dateISO: session.dateISO,
            part: session.part,
            createdAt: session.createdAt,
            rows_json: rowsJson,
            review_json: reviewJson,
            reflection: session.reflection ?? null,
            user_id: userId,
        }, { onConflict: "id" })
        .select()
        .single();

    if (error) {
        console.error("[history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    // Reconcile workout_log: the final saved rows REPLACE the live per-set
    // rows logged during the session (otherwise every set is double-counted
    // and corrected typos live forever). Delete the day's live rows and any
    // previous save of this workout, then insert the final rows.
    if (data && rows.length > 0) {
        const { error: delError } = await supabaseAdmin
            .from("workout_log")
            .delete()
            .eq("user_id", userId)
            .in("workout_id", [`live-${data.dateISO}`, data.id]);
        if (delError) {
            console.error("[history] Failed to clear live workout_log rows:", delError);
            // Continue — worst case we keep the old double-insert behavior.
        }

        // Canonicalize exercise names against tracked lifts so workout_log
        // stores one name per lift (same resolution as log-set).
        let trackedNames: string[] = [];
        try {
            const { data: tracked } = await supabaseAdmin
                .from("pr_tracked_lifts")
                .select("lift_name")
                .eq("user_id", userId)
                .eq("is_active", true);
            trackedNames = (tracked ?? []).map((t: { lift_name: string }) => t.lift_name);
        } catch { /* non-blocking */ }

        const workoutLogRows = rows.map((row: WorkoutRow, index: number) => ({
            workout_id: data.id,
            workout_date: data.dateISO,
            user_id: userId,
            exercise: resolveTrackedLift(row.exercise, trackedNames) ?? row.exercise,
            set_number: index + 1,
            weight_lbs: row.weightLbs || '0',
            reps: row.reps || '0',
            notes: row.notes || null,
            created_at: new Date().toISOString(),
            // Cardio-specific fields
            is_cardio: row.isCardio ?? false,
            duration_mins: row.durationMins ?? null,
            distance: row.distance ?? null,
            distance_unit: row.distanceUnit ?? null,
            heart_rate: row.heartRate ?? null,
            calories: row.calories ?? null,
            level: row.level ?? null,
        }));

        // Use admin client to bypass RLS for workout_log insert
        const { error: logError } = await supabaseAdmin
            .from('workout_log')
            .insert(workoutLogRows);

        if (logError) {
            console.error('[history] Error inserting workout_log (PR detection may not trigger):', logError);
            // Don't fail the entire request - workout is already saved
        } else {
            console.log(`[history] Reconciled ${workoutLogRows.length} rows into workout_log`);

            // Retract any PR recorded today whose backing set was corrected
            // away before this final save (e.g. the "Bench 1850" typo).
            const { error: prError } = await supabaseAdmin.rpc("reconcile_workout_prs", {
                p_user_id: userId,
                p_date: data.dateISO,
            });
            if (prError) {
                console.error("[history] PR reconciliation failed:", prError.message);
            }
        }
    }

    return respondJson({ ok: true });
}

// GET: List all workouts
async function listWorkouts(supabase: SupabaseClient, userId: string): Promise<Response> {
    const { data, error } = await supabase
        .from("workouts")
        .select("id, dateISO, part, createdAt, rows_json, review_json, reflection")
        .eq("user_id", userId)
        .limit(50)
        .order("createdAt", { ascending: false });

    if (error) {
        console.error("[history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    // Fetch all workout_media for this user in one query
    const workoutIds = (data || []).map((row: any) => row.id);
    let mediaByWorkout: Record<string, any[]> = {};

    if (workoutIds.length > 0) {
        const { data: mediaData, error: mediaError } = await supabase
            .from("workout_media")
            .select("id, workout_id, storage_path, media_type, file_size_bytes, created_at")
            .in("workout_id", workoutIds)
            .order("created_at", { ascending: true });

        if (!mediaError && mediaData && mediaData.length > 0) {
            // Generate signed URLs server-side using admin client (bypasses storage RLS).
            // This is more reliable than client-side signed URL generation which
            // depends on the user's JWT having SELECT access to storage.objects.
            const allPaths = mediaData.map((m: any) => m.storage_path);
            const signedUrlMap: Record<string, string> = {};

            const { data: signedData, error: signedError } = await supabaseAdmin.storage
                .from("workout-media")
                .createSignedUrls(allPaths, 3600);

            if (!signedError && signedData) {
                for (let i = 0; i < allPaths.length; i++) {
                    const item = signedData[i] as any;
                    // Handle both SDK versions: signedUrl (v2.5+) and signedURL (older)
                    const url = item?.signedUrl || item?.signedURL || null;
                    if (url) {
                        signedUrlMap[allPaths[i]] = url;
                    }
                }
            } else {
                console.error("[history] Failed to generate signed URLs:", signedError);
            }

            for (const m of mediaData) {
                if (!mediaByWorkout[m.workout_id]) mediaByWorkout[m.workout_id] = [];
                mediaByWorkout[m.workout_id].push({
                    ...m,
                    signed_url: signedUrlMap[m.storage_path] || null,
                });
            }
        }
    }

    const sessions = (data || []).map((row: any) => {
        let rows: WorkoutRow[] = [];
        try {
            rows = JSON.parse(row.rows_json || "[]");
        } catch {
            rows = [];
        }

        let review: SessionReview | undefined;
        if (row.review_json) {
            try {
                review = JSON.parse(row.review_json);
            } catch { /* ignore malformed review */ }
        }

        return {
            id: row.id,
            dateISO: row.dateISO,
            part: row.part,
            rows,
            createdAt: row.createdAt,
            review,
            reflection: row.reflection ?? undefined,
            media: mediaByWorkout[row.id] ?? [],
        };
    });

    return respondJson(sessions);
}

// PATCH: Update workout metadata (reflection, etc.)
async function updateWorkoutMeta(
    workoutId: string,
    body: { reflection?: string },
    supabase: SupabaseClient,
    userId: string
): Promise<Response> {
    const updates: Record<string, unknown> = {};
    if (body.reflection !== undefined) {
        updates.reflection = body.reflection;
    }

    if (Object.keys(updates).length === 0) {
        return respondJson({ error: "No fields to update" }, 400);
    }

    const { error } = await supabase
        .from("workouts")
        .update(updates)
        .eq("id", workoutId)
        .eq("user_id", userId);

    if (error) {
        console.error("[history] PATCH error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    return respondJson({ ok: true });
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

        if (req.method === "PATCH") {
            let body: { reflection?: string };
            try {
                body = await req.json();
            } catch {
                return respondJson({ error: "Invalid JSON" }, 400);
            }

            // Get workout ID from path or query param
            let patchId = workoutId;
            if (!patchId) {
                patchId = url.searchParams.get("id");
            }

            if (!patchId) {
                return respondJson({ error: "workout_id is required (pass as path param or ?id=)" }, 400);
            }

            return await updateWorkoutMeta(patchId, body, supabase, userId);
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
        // error logged above; return generic message to avoid leaking internals
        return respondJson({ error: "Internal server error" }, 500);
    }
});
