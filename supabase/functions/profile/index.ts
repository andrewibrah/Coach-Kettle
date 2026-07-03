// Edge Function: profile
// Handles all profile-related database operations

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

console.log("[profile] Init - URL:", supabaseUrl);
// Log presence and length, but NOT the key itself for security
console.log("[profile] Init - Service Key Present:", !!supabaseServiceKey, "Length:", supabaseServiceKey ? supabaseServiceKey.length : 0);

// Create a single service role client for the function
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function verifyAuth(req: Request): Promise<string> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        console.error("[profile] Missing Authorization header");
        throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    console.log("[profile] Verifying token (length):", token.length);

    // Use the admin client to verify the user token
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
        console.error("[profile] Auth verification ERROR details:", JSON.stringify(error));
        throw new Error(`Unauthorized: ${error.message}`);
    }

    if (!data.user) {
        console.error("[profile] Auth verification: No user returned (and no error?)");
        throw new Error("Unauthorized: No user found");
    }

    console.log("[profile] User verified successfully:", data.user.id);
    return data.user.id;
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Verify auth and get user ID
    let userId: string;
    try {
        userId = await verifyAuth(req);
    } catch (e) {
        // Log the full error to help debug
        console.error("[profile] Verification exception:", e);
        return new Response(
            JSON.stringify({ error: "Unauthorized", details: String(e) }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Use the admin client for database operations (RLS bypass enabled by service key)
    // We filter by user_id manually in queries to ensure safety
    const supabase = supabaseAdmin;

    try {
        if (req.method === "GET") {
            const url = new URL(req.url);
            const action = url.searchParams.get("action") || "fetch";

            if (action === "fetch") {
                const { data, error } = await supabase
                    .from("profiles")
                    .select("*")
                    .eq("user_id", userId)
                    .single();

                if (error && error.code !== "PGRST116") {
                    console.error("[profile] Error fetching:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ profile: data || null }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return new Response(
                JSON.stringify({ error: "Unknown action" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (req.method === "POST") {
            const body = await req.json();
            const { action } = body;

            if (action === "create") {
                // Try RPC first
                const { data: rpcData, error: rpcError } = await supabase.rpc("create_profile_for_user", {
                    p_user_id: userId,
                });

                if (!rpcError && rpcData) {
                    return new Response(
                        JSON.stringify({ id: rpcData }),
                        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                // Fallback: direct insert
                const { data, error } = await supabase
                    .from("profiles")
                    .insert({
                        user_id: userId,
                        onboarding_completed: false,
                        onboarding_step: 0,
                    })
                    .select("id")
                    .single();

                if (error) {
                    if (error.code === "23505") {
                        // Profile already exists, fetch it
                        const { data: existing } = await supabase
                            .from("profiles")
                            .select("id")
                            .eq("user_id", userId)
                            .single();
                        return new Response(
                            JSON.stringify({ id: existing?.id || null }),
                            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                        );
                    }
                    console.error("[profile] Error creating:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ id: data?.id }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "update") {
                const { updates } = body;
                const ALLOWED_FIELDS = [
                    'display_name', 'focus', 'focus_other', 'experience', 'training_days', 'ai_context', 'unit_preference',
                    'sex', 'activity_level', 'goal_type',
                    'height_value', 'height_unit', 'dob',
                    'current_weight', 'goal_weight', 'weight_unit',
                    'dietary_preferences', 'dietary_allergies', 'disliked_foods', 'preferred_cuisines',
                    'available_equipment', 'training_days_per_week', 'session_minutes_target',
                    'measurement_system', 'calorie_target_override', 'protein_g_per_lb'
                ];
                const safeUpdates = Object.fromEntries(
                    Object.entries(updates).filter(([key]) => ALLOWED_FIELDS.includes(key))
                );
                const { data, error } = await supabase
                    .from("profiles")
                    .update(safeUpdates)
                    .eq("user_id", userId)
                    .select()
                    .single();

                if (error) {
                    console.error("[profile] Error updating:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                // Keep compact AI prompt context in sync with profile preference changes.
                await supabase.rpc("refresh_ai_context", { p_user_id: userId });

                return new Response(
                    JSON.stringify({ profile: data }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "complete_onboarding") {
                const { error } = await supabase
                    .from("profiles")
                    .update({ onboarding_completed: true })
                    .eq("user_id", userId);

                if (error) {
                    console.error("[profile] Error completing onboarding:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                // Refresh AI context
                await supabase.rpc("refresh_ai_context", { p_user_id: userId });

                return new Response(
                    JSON.stringify({ ok: true }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "update_step") {
                const { step } = body;
                const { error } = await supabase
                    .from("profiles")
                    .update({ onboarding_step: step })
                    .eq("user_id", userId);

                if (error) {
                    console.error("[profile] Error updating step:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ ok: true }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "refresh_ai_context") {
                const { error } = await supabase.rpc("refresh_ai_context", { p_user_id: userId });

                if (error) {
                    console.error("[profile] Error refreshing AI context:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ ok: true }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Batch onboarding - saves all onboarding data in one call
            if (action === "batch_onboarding") {
                console.log("[profile] Starting batch onboarding for user:", userId);
                const {
                    profile: profileData,
                    tracked_lifts,
                    pr_values,
                    workout_templates,
                } = body;

                const errors: string[] = [];

                // 1. Update profile fields (if any provided)
                if (profileData && Object.keys(profileData).length > 0) {
                    const ALLOWED_PROFILE_FIELDS = [
                        'height_value', 'height_unit', 'dob',
                        'current_weight', 'goal_weight', 'weight_unit',
                        'focus', 'focus_other',
                        'sex', 'activity_level', 'goal_type',
                        'dietary_preferences', 'dietary_allergies', 'disliked_foods', 'preferred_cuisines',
                        'available_equipment', 'training_days_per_week', 'session_minutes_target',
                        'measurement_system', 'calorie_target_override', 'protein_g_per_lb'
                    ];
                    const safeProfileUpdates = Object.fromEntries(
                        Object.entries(profileData).filter(([key]) => ALLOWED_PROFILE_FIELDS.includes(key))
                    );

                    if (Object.keys(safeProfileUpdates).length > 0) {
                        const { error: profileError } = await supabase
                            .from("profiles")
                            .update(safeProfileUpdates)
                            .eq("user_id", userId);

                        if (profileError) {
                            console.error("[profile] Batch: Error updating profile:", profileError);
                            errors.push(`profile: ${profileError.message}`);
                        }
                    }
                }

                // 2. Add tracked lifts (if any)
                if (tracked_lifts && Array.isArray(tracked_lifts) && tracked_lifts.length > 0) {
                    for (const liftName of tracked_lifts) {
                        const { error: liftError } = await supabase
                            .from("pr_tracked_lifts")
                            .upsert(
                                {
                                    user_id: userId,
                                    lift_name: liftName,
                                    is_active: true,
                                },
                                { onConflict: "user_id,lift_name" }
                            );

                        if (liftError) {
                            console.error("[profile] Batch: Error adding tracked lift:", liftError);
                            errors.push(`tracked_lift(${liftName}): ${liftError.message}`);
                        }
                    }
                }

                // 3. Set PR values (if any)
                if (pr_values && Array.isArray(pr_values) && pr_values.length > 0) {
                    for (const pr of pr_values) {
                        const { lift_name, weight_lbs, reps } = pr;
                        // Calculate e1rm using Epley formula
                        const estimated_1rm = reps <= 0 ? weight_lbs : Math.round(weight_lbs * (1 + reps / 30) * 10) / 10;

                        const { error: prError } = await supabase
                            .from("pr_lifts")
                            .upsert(
                                {
                                    user_id: userId,
                                    lift_name,
                                    weight_lbs,
                                    reps,
                                    estimated_1rm,
                                    achieved_at: new Date().toISOString(),
                                },
                                { onConflict: "user_id,lift_name" }
                            );

                        if (prError) {
                            console.error("[profile] Batch: Error setting PR:", prError);
                            errors.push(`pr(${lift_name}): ${prError.message}`);
                        }
                    }
                }

                // 4. Create workout templates (if any)
                if (workout_templates && Array.isArray(workout_templates) && workout_templates.length > 0) {
                    for (const template of workout_templates) {
                        const { name, lifts } = template;

                        // Create template
                        const { data: templateData, error: templateError } = await supabase
                            .from("workout_templates")
                            .insert({
                                user_id: userId,
                                name,
                            })
                            .select("id")
                            .single();

                        if (templateError) {
                            console.error("[profile] Batch: Error creating template:", templateError);
                            errors.push(`template(${name}): ${templateError.message}`);
                            continue;
                        }

                        // Add template items
                        if (templateData && lifts && Array.isArray(lifts)) {
                            for (let i = 0; i < lifts.length; i++) {
                                const lift = lifts[i];
                                const { error: itemError } = await supabase
                                    .from("workout_template_items")
                                    .insert({
                                        template_id: templateData.id,
                                        user_id: userId,
                                        lift_name: lift.name,
                                        target_sets: lift.sets,
                                        target_reps: lift.reps,
                                        display_order: i,
                                    });

                                if (itemError) {
                                    console.error("[profile] Batch: Error adding template item:", itemError);
                                    errors.push(`template_item(${lift.name}): ${itemError.message}`);
                                }
                            }
                        }
                    }
                }

                // 5. Mark onboarding as complete
                const { error: completeError } = await supabase
                    .from("profiles")
                    .update({ onboarding_completed: true })
                    .eq("user_id", userId);

                if (completeError) {
                    console.error("[profile] Batch: Error completing onboarding:", completeError);
                    errors.push(`complete: ${completeError.message}`);
                }

                // 6. Refresh AI context (don't fail on this)
                try {
                    await supabase.rpc("refresh_ai_context", { p_user_id: userId });
                } catch (aiError) {
                    console.warn("[profile] Batch: AI context refresh failed (non-critical):", aiError);
                }

                // Return result
                if (errors.length > 0) {
                    console.error("[profile] Batch onboarding completed with errors:", errors);
                    // Still return 200 if onboarding was marked complete (partial success)
                    if (!completeError) {
                        return new Response(
                            JSON.stringify({ ok: true, warnings: errors }),
                            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                        );
                    }
                    return new Response(
                        JSON.stringify({ error: "Batch onboarding failed", details: errors }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                console.log("[profile] Batch onboarding completed successfully");
                return new Response(
                    JSON.stringify({ ok: true }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return new Response(
                JSON.stringify({ error: "Unknown action" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[profile] Error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
