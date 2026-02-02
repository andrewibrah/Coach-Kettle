// Edge Function: history
// CRUD operations for workout history (per-user)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "https://esm.sh/jose@5.2.0";

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
const supabaseJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase env vars");
}

// JWKS endpoint for ES256 JWT verification (Supabase Auth v2)
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
try {
    JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
} catch (e) {
    console.warn("[history] Failed to create JWKS, will fallback to secret:", e);
}

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

    // Decode token for logging
    try {
        const decoded = decodeJwt(token);
        console.log("[history] Token claims:", { sub: decoded.sub, iss: decoded.iss, aud: decoded.aud });
    } catch (e) {
        console.error("[history] Failed to decode token:", e);
    }

    // Try JWKS verification first (ES256)
    if (JWKS) {
        try {
            const { payload } = await jwtVerify(token, JWKS, {
                issuer: `${supabaseUrl}/auth/v1`,
                audience: "authenticated",
            });

            const userId = payload.sub;
            if (!userId) {
                console.error("[history] No user ID in token payload");
                return respondJson({ code: 401, message: "Invalid token: no sub claim" }, 401);
            }

            console.log("[history] JWKS verification successful for user:", userId);
            const supabase = createUserClient(authHeader);
            return { supabase, userId };
        } catch (jwksError) {
            console.warn("[history] JWKS verification failed, trying secret fallback:", jwksError);
        }
    }

    // Fallback: Try HS256 verification with JWT secret
    if (supabaseJwtSecret) {
        try {
            const encoder = new TextEncoder();
            const secretKey = encoder.encode(supabaseJwtSecret);

            const { payload } = await jwtVerify(token, secretKey, {
                issuer: `${supabaseUrl}/auth/v1`,
                audience: "authenticated",
            });

            const userId = payload.sub;
            if (!userId) {
                console.error("[history] No user ID in token payload (secret fallback)");
                return respondJson({ code: 401, message: "Invalid token: no sub claim" }, 401);
            }

            console.log("[history] Secret verification successful for user:", userId);
            const supabase = createUserClient(authHeader);
            return { supabase, userId };
        } catch (secretError) {
            console.error("[history] Secret verification also failed:", secretError);
            return respondJson({ code: 401, message: "Invalid JWT" }, 401);
        }
    }

    // No valid verification method succeeded
    console.error("[history] All JWT verification methods failed");
    return respondJson({ code: 401, message: "Invalid JWT" }, 401);
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

        const { error: logError } = await supabase
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
