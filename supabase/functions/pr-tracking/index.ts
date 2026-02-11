// Edge Function: pr-tracking
// Handles all PR tracking database operations

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
        console.error("[pr-tracking] Missing Authorization header");
        throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
        console.error("[pr-tracking] Empty token received");
        throw new Error("Missing authentication token");
    }

    console.log("[pr-tracking] Verifying token (length):", token.length);

    // Use the admin client to verify the user token
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
        console.error("[pr-tracking] Auth verification ERROR:", JSON.stringify(error));
        throw new Error("Unauthorized: " + error.message);
    }

    if (!data.user) {
        console.error("[pr-tracking] Auth verification: No user returned");
        throw new Error("Unauthorized: No user found");
    }

    console.log("[pr-tracking] User verified successfully:", data.user.id);
    return data.user.id;
}

serve(async (req) => {
    console.log("[pr-tracking] Function started");

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    let userId: string;
    try {
        userId = await verifyAuth(req);
    } catch (e) {
        console.error("[pr-tracking] Verification exception:", e);
        return new Response(
            JSON.stringify({ error: "Unauthorized", details: String(e) }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = supabaseAdmin;

    try {
        if (req.method === "GET") {
            const url = new URL(req.url);
            const action = url.searchParams.get("action");

            if (action === "tracked_lifts") {
                const { data, error } = await supabase
                    .from("pr_tracked_lifts")
                    .select("*")
                    .eq("user_id", userId)
                    .order("display_order", { ascending: true });

                if (error) {
                    console.error("[pr-tracking] Error fetching tracked lifts:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ lifts: data || [] }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "pr_lifts") {
                const { data, error } = await supabase
                    .from("pr_lifts")
                    .select("*")
                    .eq("user_id", userId)
                    .order("lift_name", { ascending: true });

                if (error) {
                    console.error("[pr-tracking] Error fetching PR lifts:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ lifts: data || [] }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "pr_history") {
                const liftName = url.searchParams.get("lift_name");
                let query = supabase
                    .from("pr_history")
                    .select("*")
                    .eq("user_id", userId)
                    .order("achieved_at", { ascending: false });

                if (liftName) {
                    query = query.eq("lift_name", liftName);
                }

                const { data, error } = await query;

                if (error) {
                    console.error("[pr-tracking] Error fetching PR history:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ history: data || [] }),
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

            if (action === "add_tracked") {
                const { lift_name } = body;

                // Use upsert to handle duplicates
                const { data, error } = await supabase
                    .from("pr_tracked_lifts")
                    .upsert(
                        {
                            user_id: userId,
                            lift_name,
                            is_active: true,
                        },
                        { onConflict: "user_id,lift_name" }
                    )
                    .select()
                    .single();

                if (error) {
                    // If upsert fails, try to find and reactivate existing lift
                    if (error.code === "23505") {
                        const { data: existing } = await supabase
                            .from("pr_tracked_lifts")
                            .select()
                            .eq("user_id", userId)
                            .eq("lift_name", lift_name)
                            .single();

                        if (existing) {
                            if (!existing.is_active) {
                                await supabase
                                    .from("pr_tracked_lifts")
                                    .update({ is_active: true })
                                    .eq("id", existing.id);
                                return new Response(
                                    JSON.stringify({ lift: { ...existing, is_active: true } }),
                                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                                );
                            }
                            return new Response(
                                JSON.stringify({ lift: existing }),
                                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                            );
                        }
                    }
                    console.error("[pr-tracking] Error adding tracked lift:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ lift: data }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "remove_tracked") {
                const { lift_id } = body;
                const { error } = await supabase
                    .from("pr_tracked_lifts")
                    .delete()
                    .eq("id", lift_id);

                if (error) {
                    console.error("[pr-tracking] Error removing tracked lift:", error);
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

            if (action === "toggle_tracked") {
                const { lift_id, is_active } = body;
                const { error } = await supabase
                    .from("pr_tracked_lifts")
                    .update({ is_active })
                    .eq("id", lift_id);

                if (error) {
                    console.error("[pr-tracking] Error toggling tracked lift:", error);
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

            if (action === "set_pr") {
                const { lift_name, weight_lbs, reps } = body;

                // Calculate e1rm using Epley formula
                const estimated_1rm = reps <= 0 ? weight_lbs : Math.round(weight_lbs * (1 + reps / 30) * 10) / 10;

                const { data, error } = await supabase
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
                    )
                    .select()
                    .single();

                if (error) {
                    console.error("[pr-tracking] Error setting PR:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ lift: data }),
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
        console.error("[pr-tracking] Error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
