// Edge Function: profile
// Handles all profile-related database operations

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

interface JWTPayload {
    sub: string;
    [key: string]: unknown;
}

async function verifyAuth(req: Request): Promise<string> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    try {
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: `${supabaseUrl}/auth/v1`,
            audience: "authenticated",
        });
        return (payload as JWTPayload).sub;
    } catch (error) {
        console.error("[profile] JWT verification failed:", error);
        throw new Error("Unauthorized");
    }
}

function createSupabaseClient() {
    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
    });
}

serve(async (req) => {
    console.log("[profile] Function started");

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Verify auth and get user ID
    let userId: string;
    try {
        userId = await verifyAuth(req);
    } catch (e) {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = createSupabaseClient();

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
                const { data, error } = await supabase
                    .from("profiles")
                    .update(updates)
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
