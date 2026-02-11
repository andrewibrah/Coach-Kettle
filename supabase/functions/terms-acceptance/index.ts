// Edge Function: terms-acceptance
// Records and verifies user acceptance of Terms of Service and Privacy Policy

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Current versions - update these when ToS/Privacy Policy changes
const CURRENT_TERMS_VERSION = "1.0.0";
const CURRENT_PRIVACY_VERSION = "1.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    throw new Error("Missing Supabase env vars");
}

// Admin client for auth verification
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

function createUserClient(authHeader: string) {
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: { Authorization: authHeader },
        },
    });
}

interface UserContext {
    supabase: ReturnType<typeof createClient>;
    userId: string;
}

async function getUserContext(authHeader: string | null): Promise<UserContext | Response> {
    if (!authHeader) {
        return respondJson({ code: 401, message: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
        console.error("[terms-acceptance] Auth verification failed:", error.message);
        return respondJson({ code: 401, message: "Invalid JWT" }, 401);
    }

    if (!data.user) {
        console.error("[terms-acceptance] No user returned from auth verification");
        return respondJson({ code: 401, message: "Invalid JWT" }, 401);
    }

    console.log("[terms-acceptance] User verified:", data.user.id);
    const supabase = createUserClient(authHeader);
    return { supabase, userId: data.user.id };
}


interface AcceptanceRequest {
    terms_version?: string;
    privacy_version?: string;
}

interface AcceptanceRecord {
    id: string;
    user_id: string;
    terms_version: string;
    privacy_version: string;
    accepted_at: string;
}

// POST: Record terms acceptance
async function recordAcceptance(
    req: Request,
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<Response> {
    let body: AcceptanceRequest;
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    // Use current versions if not specified
    const termsVersion = body.terms_version || CURRENT_TERMS_VERSION;
    const privacyVersion = body.privacy_version || CURRENT_PRIVACY_VERSION;

    // Extract client info for audit
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        null;
    const userAgent = req.headers.get("user-agent") || null;

    // Insert acceptance record
    const { data, error } = await supabase
        .from("user_terms_acceptance")
        .insert({
            user_id: userId,
            terms_version: termsVersion,
            privacy_version: privacyVersion,
            ip_address: ipAddress,
            user_agent: userAgent,
        })
        .select()
        .single();

    if (error) {
        // Check if it's a unique constraint violation (already accepted)
        if (error.code === "23505") {
            return respondJson({
                ok: true,
                message: "Already accepted",
                terms_version: termsVersion,
                privacy_version: privacyVersion,
            });
        }

        console.error("[terms-acceptance] Database error:", error);
        return respondJson({ error: "Database error", details: error.message }, 500);
    }

    console.log(`[terms-acceptance] User ${userId} accepted terms v${termsVersion}, privacy v${privacyVersion}`);

    return respondJson({
        ok: true,
        accepted_at: data.accepted_at,
        terms_version: termsVersion,
        privacy_version: privacyVersion,
    });
}

// GET: Check acceptance status
async function checkAcceptance(
    supabase: ReturnType<typeof createClient>,
    userId: string
): Promise<Response> {
    // Get the latest acceptance record for this user
    const { data, error } = await supabase
        .from("user_terms_acceptance")
        .select("terms_version, privacy_version, accepted_at")
        .eq("user_id", userId)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .single();

    if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found (not an error condition)
        console.error("[terms-acceptance] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    if (!data) {
        return respondJson({
            accepted: false,
            needs_acceptance: true,
            current_terms_version: CURRENT_TERMS_VERSION,
            current_privacy_version: CURRENT_PRIVACY_VERSION,
        });
    }

    // Check if user has accepted the current versions
    const isCurrentTerms = data.terms_version === CURRENT_TERMS_VERSION;
    const isCurrentPrivacy = data.privacy_version === CURRENT_PRIVACY_VERSION;
    const needsReacceptance = !isCurrentTerms || !isCurrentPrivacy;

    return respondJson({
        accepted: !needsReacceptance,
        needs_acceptance: needsReacceptance,
        accepted_terms_version: data.terms_version,
        accepted_privacy_version: data.privacy_version,
        accepted_at: data.accepted_at,
        current_terms_version: CURRENT_TERMS_VERSION,
        current_privacy_version: CURRENT_PRIVACY_VERSION,
    });
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

    try {
        if (req.method === "POST") {
            return await recordAcceptance(req, supabase, userId);
        }

        if (req.method === "GET") {
            return await checkAcceptance(supabase, userId);
        }

        return respondJson({ error: "Method not allowed" }, 405);
    } catch (error) {
        console.error("[terms-acceptance] Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondJson({ error: message }, 500);
    }
});
