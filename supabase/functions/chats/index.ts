// Edge Function: chats
// List and manage chat threads

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

interface ChatItem {
    id: string;
    title: string;
    role: "user" | "assistant";
    content: string;
    createdAt: number;
    source: string;
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
    console.warn("[chats] Failed to create JWKS, will fallback to secret:", e);
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
        console.log("[chats] Token claims:", { sub: decoded.sub, iss: decoded.iss, aud: decoded.aud });
    } catch (e) {
        console.error("[chats] Failed to decode token:", e);
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
                console.error("[chats] No user ID in token payload");
                return respondJson({ code: 401, message: "Invalid token: no sub claim" }, 401);
            }

            console.log("[chats] JWKS verification successful for user:", userId);
            const supabase = createUserClient(authHeader);
            return { supabase, userId };
        } catch (jwksError) {
            console.warn("[chats] JWKS verification failed, trying secret fallback:", jwksError);
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
                console.error("[chats] No user ID in token payload (secret fallback)");
                return respondJson({ code: 401, message: "Invalid token: no sub claim" }, 401);
            }

            console.log("[chats] Secret verification successful for user:", userId);
            const supabase = createUserClient(authHeader);
            return { supabase, userId };
        } catch (secretError) {
            console.error("[chats] Secret verification also failed:", secretError);
            return respondJson({ code: 401, message: "Invalid JWT" }, 401);
        }
    }

    // No valid verification method succeeded
    console.error("[chats] All JWT verification methods failed");
    return respondJson({ code: 401, message: "Invalid JWT" }, 401);
}

// GET: List all chats for user
async function listChats(supabase: SupabaseClient, userId: string): Promise<Response> {
    // Note: 'chats' table seems to store messages? Or threads? 
    // The previous code selected id, title, role, content... title implies threads.
    // Assuming this table stores chat sessions/threads.

    const { data, error } = await supabase
        .from("chats")
        .select("id, title, role, content, createdAt, source")
        .eq("user_id", userId) // Filter by user_id!
        .order("createdAt", { ascending: false })
        .limit(100);

    if (error) {
        console.error("[chats] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    const chats: ChatItem[] = (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt,
        source: row.source,
    }));

    return respondJson(chats);
}

// POST: Save a chat message
async function saveChat(payload: ChatItem, supabase: SupabaseClient, userId: string): Promise<Response> {
    const { error } = await supabase
        .from("chats")
        .upsert({
            id: payload.id,
            title: payload.title,
            role: payload.role,
            content: payload.content,
            createdAt: payload.createdAt,
            source: payload.source,
            user_id: userId, // Ensure user ownership
        }, { onConflict: "id" });

    if (error) {
        console.error("[chats] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    return respondJson({ ok: true });
}

// DELETE: Delete a chat by id
async function deleteChat(chatId: string, supabase: SupabaseClient, userId: string): Promise<Response> {
    const { error } = await supabase
        .from("chats")
        .delete()
        .eq("id", chatId)
        .eq("user_id", userId); // Ensure user owns the chat

    if (error) {
        console.error("[chats] Database error:", error);
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
    const path = url.pathname;

    try {
        if (req.method === "GET" && path === "/chats") {
            return await listChats(supabase, userId);
        } else if (req.method === "POST" && path === "/chats") {
            const payload: ChatItem = await req.json();
            return await saveChat(payload, supabase, userId);
        } else if (req.method === "DELETE" && path.startsWith("/chats/")) {
            const chatId = path.split("/chats/")[1];
            if (!chatId) {
                return respondJson({ error: "Chat ID is required" }, 400);
            }
            return await deleteChat(chatId, supabase, userId);
        } else {
            return respondJson({ error: "Method not allowed" }, 405);
        }
    } catch (error) {
        console.error("[chats] Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondJson({ error: message }, 500);
    }
});


