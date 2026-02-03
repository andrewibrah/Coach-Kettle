// Edge Function: workout-templates
// Handles all workout template database operations

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
        throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");

    // Use the admin client to verify the user token
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
        console.error("[workout-templates] Auth verification failed:", error);
        throw new Error("Unauthorized");
    }

    return user.id;
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
        console.error("[workout-templates] Auth failed:", e);
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Use the admin client for database operations (RLS bypass enabled by service key)
    // We filter by user_id manually in queries to ensure safety
    const supabase = supabaseAdmin;

    try {
        if (req.method === "GET") {
            const url = new URL(req.url);
            const action = url.searchParams.get("action");
            console.log("[workout-templates] GET action:", action);

            if (action === "list") {
                const { data, error } = await supabase
                    .from("workout_templates")
                    .select("*")
                    .eq("user_id", userId)
                    .order("created_at", { ascending: false });

                if (error) {
                    console.error("[workout-templates] Error fetching templates:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ templates: data || [] }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "items") {
                const templateId = url.searchParams.get("template_id");
                if (!templateId) {
                    return new Response(
                        JSON.stringify({ error: "template_id required" }),
                        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                const { data, error } = await supabase
                    .from("workout_template_items")
                    .select("*")
                    .eq("template_id", templateId)
                    .order("display_order", { ascending: true });

                if (error) {
                    console.error("[workout-templates] Error fetching items:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ items: data || [] }),
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
            console.log("[workout-templates] POST action:", action);

            if (action === "create") {
                const { name, description } = body;
                const { data, error } = await supabase
                    .from("workout_templates")
                    .insert({
                        user_id: userId,
                        name,
                        description,
                    })
                    .select()
                    .single();

                if (error) {
                    console.error("[workout-templates] Error creating template:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ template: data }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "delete") {
                const { template_id } = body;
                const { error } = await supabase
                    .from("workout_templates")
                    .delete()
                    .eq("id", template_id)
                    .eq("user_id", userId);

                if (error) {
                    console.error("[workout-templates] Error deleting template:", error);
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

            if (action === "add_item") {
                const { template_id, lift_name, target_sets, target_reps, target_weight, notes, display_order } = body;
                const { data, error } = await supabase
                    .from("workout_template_items")
                    .insert({
                        template_id,
                        user_id: userId,
                        lift_name,
                        target_sets,
                        target_reps,
                        target_weight,
                        notes,
                        display_order,
                    })
                    .select()
                    .single();

                if (error) {
                    console.error("[workout-templates] Error adding item:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                return new Response(
                    JSON.stringify({ item: data }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (action === "remove_item") {
                const { item_id } = body;
                const { error } = await supabase
                    .from("workout_template_items")
                    .delete()
                    .eq("id", item_id)
                    .eq("user_id", userId);

                if (error) {
                    console.error("[workout-templates] Error removing item:", error);
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
        console.error("[workout-templates] Error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
