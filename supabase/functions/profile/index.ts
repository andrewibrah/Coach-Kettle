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
                const ALLOWED_FIELDS = ['display_name', 'focus', 'experience', 'training_days', 'ai_context', 'unit_preference'];
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
