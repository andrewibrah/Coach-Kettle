// Edge Function: history
// CRUD operations for workout history (per-user)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";
import { resolveTrackedLift } from "../_shared/liftMatching.ts";
import { validateWorkoutRow } from '../_shared/workoutValidation.ts';

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
    set?: number;
    performance?: 'planned' | 'performed';
    status?: 'syncing' | 'committed';
    isRest?: boolean;
    setKind?: string;
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
    revision?: number;
    operationKey?: string;
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
    if (!Array.isArray(session.rows)) return respondJson({ error: 'rows must be an array' }, 400);
    const errorMessage = rows.map(row => validateWorkoutRow(row)).find(Boolean);
    if (errorMessage) return respondJson({ error: errorMessage }, 400);
    if (!session.operationKey || !Number.isSafeInteger(session.revision) || session.revision! < 1 ||
        rows.some(row => typeof row.id !== 'string' || !row.id) || new Set(rows.map(row => row.id)).size !== rows.length) {
        return respondJson({ error: 'Session operation identity and unique row IDs required.' }, 400);
    }
    let trackedNames: string[] = [];
    const { data: tracked, error: trackedError } = await supabase
        .from('pr_tracked_lifts').select('lift_name').eq('user_id', userId).eq('is_active', true);
    if (trackedError) return respondJson({ error: 'Database error' }, 500);
    trackedNames = (tracked ?? []).map((t: { lift_name: string }) => t.lift_name);
    // Preserve raw quantities, including number/string, null and absent keys, for
    // SQL's exact snapshot coherence check. Typed insertion normalizes strength
    // text only after validation; cardio display absence never becomes zero.
    const logRows = rows.filter(row => !validateWorkoutRow(row, true) && !row.isRest &&
        row.status !== 'syncing' && row.performance !== 'planned').map(row => ({
            ...row, exercise: resolveTrackedLift(row.exercise, trackedNames) ?? row.exercise,
        }));
    const { data: receipt, error } = await supabase.rpc('apply_workout_operation', {
        p_session_id: session.id, p_operation_key: session.operationKey,
        p_revision: session.revision, p_kind: 'finalize', p_row_id: null,
        p_payload: { dateISO: session.dateISO, part: session.part, createdAt: session.createdAt,
            rows, logRows, review: session.review ?? null, reflection: session.reflection ?? null },
    });
    if (error || receipt?.ok !== true) {
        console.error('[history] Transaction failed:', error);
        return respondJson({ error: 'Database error' }, 500);
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
async function deleteWorkout(workoutId: string, supabase: SupabaseClient, operation: { revision: number; operationKey: string }): Promise<Response> {
    const { data: receipt, error } = await supabase.rpc('apply_workout_operation', {
        p_session_id: workoutId, p_operation_key: operation.operationKey, p_revision: operation.revision,
        p_kind: 'delete', p_row_id: null, p_payload: {},
    });
    if (error || receipt?.ok !== true) return respondJson({ error: 'Database error' }, 500);
    return respondJson(receipt);
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

        if (req.method === 'DELETE') {
            let operation: { id?: string; revision: number; operationKey: string };
            try { operation = await req.json(); } catch { return respondJson({ error: 'Operation identity required' }, 400); }
            const idToDelete = workoutId ?? url.searchParams.get('id') ?? operation.id;
            if (!idToDelete || !operation.operationKey || !Number.isSafeInteger(operation.revision) || operation.revision < 1 ||
                (operation.id !== undefined && operation.id !== idToDelete)) {
                return respondJson({ error: 'Operation identity required' }, 400);
            }
            return await deleteWorkout(idToDelete, supabase, operation);
        }

        return respondJson({ error: "Method not allowed" }, 405);
    } catch (error) {
        console.error("[history] Error:", error);
        // error logged above; return generic message to avoid leaking internals
        return respondJson({ error: "Internal server error" }, 500);
    }
});
