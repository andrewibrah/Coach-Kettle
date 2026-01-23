// Edge Function: terms-acceptance
// Records and verifies user acceptance of Terms of Service and Privacy Policy

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "https://esm.sh/jose@5.2.0";

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
const supabaseJwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase env vars");
}

// JWKS endpoint for ES256 JWT verification (Supabase Auth v2)
let JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
try {
    JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
} catch (e) {
    console.warn("[terms-acceptance] Failed to create JWKS, will fallback to secret:", e);
}

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

    // Decode token header to check algorithm
    let tokenHeader: { alg?: string } = {};
    try {
        const decoded = decodeJwt(token);
        console.log("[terms-acceptance] Token claims:", { sub: decoded.sub, iss: decoded.iss, aud: decoded.aud });
    } catch (e) {
        console.error("[terms-acceptance] Failed to decode token:", e);
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
                console.error("[terms-acceptance] No user ID in token payload");
                return respondJson({ code: 401, message: "Invalid token: no sub claim" }, 401);
            }

            console.log("[terms-acceptance] JWKS verification successful for user:", userId);
            const supabase = createUserClient(authHeader);
            return { supabase, userId };
        } catch (jwksError) {
            console.warn("[terms-acceptance] JWKS verification failed, trying secret fallback:", jwksError);
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
                console.error("[terms-acceptance] No user ID in token payload (secret fallback)");
                return respondJson({ code: 401, message: "Invalid token: no sub claim" }, 401);
            }

            console.log("[terms-acceptance] Secret verification successful for user:", userId);
            const supabase = createUserClient(authHeader);
            return { supabase, userId };
        } catch (secretError) {
            console.error("[terms-acceptance] Secret verification also failed:", secretError);
            return respondJson({ code: 401, message: "Invalid JWT" }, 401);
        }
    }

    // No valid verification method succeeded
    console.error("[terms-acceptance] All JWT verification methods failed");
    return respondJson({ code: 401, message: "Invalid JWT" }, 401);
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
