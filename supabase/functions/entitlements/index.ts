// Edge Function: entitlements
// Handles entitlement state, trial bootstrapping, paywall dismissal, and AI usage checks

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { activateProEntitlement, FREE_AI_MESSAGES_PER_DAY } from "../_shared/entitlements.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

console.log("[entitlements] Init - URL:", supabaseUrl);
console.log("[entitlements] Init - Service Key Present:", !!supabaseServiceKey, "Length:", supabaseServiceKey ? supabaseServiceKey.length : 0);

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
        console.error("[entitlements] Missing Authorization header");
        throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    console.log("[entitlements] Verifying token (length):", token.length);

    // Use the admin client to verify the user token
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
        console.error("[entitlements] Auth verification ERROR details:", JSON.stringify(error));
        throw new Error(`Unauthorized: ${error.message}`);
    }

    if (!data.user) {
        console.error("[entitlements] Auth verification: No user returned (and no error?)");
        throw new Error("Unauthorized: No user found");
    }

    console.log("[entitlements] User verified successfully:", data.user.id);
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
        console.error("[entitlements] Verification exception:", e);
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
            // GET /entitlements — Get current entitlement state
            const { data, error } = await supabase.rpc("get_entitlement", {
                p_user_id: userId,
            });

            if (error) {
                console.error("[entitlements] Error fetching entitlement:", error);
                return new Response(
                    JSON.stringify({ error: error.message }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // RPC returns array for RETURNS TABLE; extract first row
            const row = Array.isArray(data) ? data[0] : data;

            // If no entitlement exists (null status), auto-bootstrap a trial
            if (!row || row.entitlement_status === null) {
                console.log("[entitlements] No entitlement found, auto-bootstrapping trial for user:", userId);
                const { data: bootstrapData, error: bootstrapError } = await supabase.rpc("bootstrap_trial", {
                    p_user_id: userId,
                });

                if (bootstrapError) {
                    console.error("[entitlements] Error bootstrapping trial:", bootstrapError);
                    return new Response(
                        JSON.stringify({ error: bootstrapError.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                const bRow = Array.isArray(bootstrapData) ? bootstrapData[0] : bootstrapData;
                return new Response(
                    JSON.stringify({
                        ok: true,
                        data: {
                            status: bRow?.entitlement_status ?? null,
                            source: 'trial',
                            expires_at: bRow?.expires_at ?? null,
                            trial_days_remaining: 7,
                            subscription_id: null,
                            paywall_dismissed: bRow?.paywall_dismissed ?? false,
                            apple_product_id: null,
                        },
                    }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return new Response(
                JSON.stringify({
                    ok: true,
                    data: {
                        status: row.entitlement_status,
                        source: row.entitlement_source,
                        expires_at: row.expires_at,
                        trial_days_remaining: row.trial_days_remaining ?? 0,
                        subscription_id: row.subscription_id ?? null,
                        paywall_dismissed: row.paywall_dismissed ?? false,
                        apple_product_id: row.apple_product_id ?? null,
                    },
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (req.method === "POST") {
            const body = await req.json();
            const { action } = body;

            // POST { action: "bootstrap" } — Create trial (idempotent)
            if (action === "bootstrap") {
                const { data, error } = await supabase.rpc("bootstrap_trial", {
                    p_user_id: userId,
                });

                if (error) {
                    console.error("[entitlements] Error bootstrapping trial:", error);
                    return new Response(
                        JSON.stringify({ error: error.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                const bRow = Array.isArray(data) ? data[0] : data;
                return new Response(
                    JSON.stringify({
                        ok: true,
                        data: {
                            status: bRow?.entitlement_status ?? null,
                            expires_at: bRow?.expires_at ?? null,
                            is_new_trial: bRow?.is_new_trial ?? false,
                            paywall_dismissed: bRow?.paywall_dismissed ?? false,
                        },
                    }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // POST { action: "dismiss_paywall" } — User tapped "Skip — Try 1 Week Free"
            if (action === "dismiss_paywall") {
                const { error } = await supabase
                    .from("user_entitlements")
                    .update({ paywall_dismissed: true })
                    .eq("user_id", userId);

                if (error) {
                    console.error("[entitlements] Error dismissing paywall:", error);
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

            // POST { action: "check_ai_usage" } — Check AI message count for today
            if (action === "check_ai_usage") {
                // Get AI usage count
                const { data: usageData, error: usageError } = await supabase.rpc("get_ai_usage", {
                    p_user_id: userId,
                });

                if (usageError) {
                    console.error("[entitlements] Error checking AI usage:", usageError);
                    return new Response(
                        JSON.stringify({ error: usageError.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                // Get entitlement to check if user is pro
                const { data: entitlementData, error: entitlementError } = await supabase.rpc("get_entitlement", {
                    p_user_id: userId,
                });

                if (entitlementError) {
                    console.error("[entitlements] Error fetching entitlement for AI usage check:", entitlementError);
                    return new Response(
                        JSON.stringify({ error: entitlementError.message }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                const row = Array.isArray(entitlementData) ? entitlementData[0] : entitlementData;
                // Trial = full pro: unlimited AI, counter not consulted.
                const isPro = row?.entitlement_status === "sub_active" ||
                    row?.entitlement_status === "trial_active";
                const count = usageData ?? 0;
                const limit = isPro ? -1 : FREE_AI_MESSAGES_PER_DAY;
                const remaining = isPro ? -1 : Math.max(0, FREE_AI_MESSAGES_PER_DAY - count);

                return new Response(
                    JSON.stringify({
                        ok: true,
                        data: { count, limit, is_pro: isPro, remaining },
                    }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // POST { action: "sync_revenuecat" } — Pull the caller's subscriber state
            // from RevenueCat's REST API and materialize it into user_entitlements.
            // Called by the client right after a purchase/restore so the server is
            // pro immediately (the webhook is the durable path; this closes the gap).
            if (action === "sync_revenuecat") {
                const rcApiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
                if (!rcApiKey) {
                    console.error("[entitlements] REVENUECAT_SECRET_API_KEY not configured");
                    return new Response(
                        JSON.stringify({ error: "RevenueCat sync not configured" }),
                        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                const rcRes = await fetch(
                    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
                    { headers: { Authorization: `Bearer ${rcApiKey}` } }
                );

                if (!rcRes.ok) {
                    console.error("[entitlements] RevenueCat API error:", rcRes.status);
                    return new Response(
                        JSON.stringify({ error: "RevenueCat lookup failed" }),
                        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }

                const rcBody = await rcRes.json();
                const rcEntitlements = rcBody?.subscriber?.entitlements ?? {};

                // Must match REVENUECAT.ENTITLEMENT_ALIASES in constants/revenuecat.ts
                const ENTITLEMENT_ALIASES = ["Coach Kettle Pro", "pro", "coach_kettle_pro"];
                let activeExpiresAt: string | null = null;
                for (const alias of ENTITLEMENT_ALIASES) {
                    const ent = rcEntitlements[alias];
                    if (ent?.expires_date && new Date(ent.expires_date).getTime() > Date.now()) {
                        activeExpiresAt = new Date(ent.expires_date).toISOString();
                        break;
                    }
                }

                if (activeExpiresAt) {
                    const { error: provisionError } = await activateProEntitlement(supabase, {
                        userId,
                        expiresAt: activeExpiresAt,
                    });
                    if (provisionError) {
                        console.error("[entitlements] Sync provision failed:", provisionError);
                        return new Response(
                            JSON.stringify({ error: provisionError.message }),
                            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                        );
                    }
                }
                // If RevenueCat shows no active entitlement, do NOT expire here —
                // expiry is webhook-driven (EXPIRATION event) to avoid clobbering
                // legacy receipt-verified subscriptions RevenueCat doesn't know about.

                return new Response(
                    JSON.stringify({ ok: true, data: { is_pro: activeExpiresAt !== null, expires_at: activeExpiresAt } }),
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
        console.error("[entitlements] Error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
