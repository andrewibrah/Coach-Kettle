// Edge Function: chat-history
// CRUD operations for user-scoped chat history

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "https://esm.sh/jose@5.2.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

interface ChatMessage {
    id?: string;
    user_id?: string;
    role: "user" | "assistant";
    content: string;
    source: "workout_chat" | "coach_modal";
    created_at?: string;
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
    console.warn("[chat-history] Failed to create JWKS, will fallback to secret:", e);
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
        console.log("[chat-history] Token claims:", { sub: decoded.sub, iss: decoded.iss, aud: decoded.aud });
    } catch (e) {
        console.error("[chat-history] Failed to decode token:", e);
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
                console.error("[chat-history] No user ID in token payload");
                return respondJson({ code: 401, message: "Invalid token: no sub claim" }, 401);
            }

            console.log("[chat-history] JWKS verification successful for user:", userId);
            const supabase = createUserClient(authHeader);
            return { supabase, userId };
        } catch (jwksError) {
            console.warn("[chat-history] JWKS verification failed, trying secret fallback:", jwksError);
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
                console.error("[chat-history] No user ID in token payload (secret fallback)");
                return respondJson({ code: 401, message: "Invalid token: no sub claim" }, 401);
            }

            console.log("[chat-history] Secret verification successful for user:", userId);
            const supabase = createUserClient(authHeader);
            return { supabase, userId };
        } catch (secretError) {
            console.error("[chat-history] Secret verification also failed:", secretError);
            return respondJson({ code: 401, message: "Invalid JWT" }, 401);
        }
    }

    // No valid verification method succeeded
    console.error("[chat-history] All JWT verification methods failed");
    return respondJson({ code: 401, message: "Invalid JWT" }, 401);
}

// POST: Save chat messages
async function saveChat(messages: ChatMessage[], supabase: SupabaseClient, userId: string): Promise<Response> {
    if (messages.length > 10) {
        return respondJson({ error: "Too many messages (max 10)" }, 400);
    }

    // Map to DB schema (chats table)
    // Table: id (text), title (text), role (text), content (text), createdAt (bigint), source (text), user_id (uuid)
    const dbMessages = messages.map(msg => {
        if (msg.role !== "user" && msg.role !== "assistant") throw new Error("Invalid role");
        if (msg.source !== "workout_chat" && msg.source !== "coach_modal") throw new Error("Invalid source");

        const content = (msg.content || "")
            .slice(0, 5000)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

        // Use provided created_at or now. DB stores bigint (ms)
        const createdAt = msg.created_at ? new Date(msg.created_at).getTime() : Date.now();

        return {
            id: crypto.randomUUID(), // App doesn't send ID for new messages usually, generate one
            role: msg.role,
            content,
            source: msg.source,
            "createdAt": createdAt,
            user_id: userId,
        };
    });

    const { error } = await supabase
        .from("chats")
        .insert(dbMessages);

    if (error) {
        console.error("[chat-history] Database error:", error);
        return respondJson({ error: "Database error", details: error.message }, 500);
    }

    return respondJson({ ok: true });
}


// GET: List chat history
async function listChats(supabase: SupabaseClient, userId: string, source?: string): Promise<Response> {
    // Select column mapping
    let query = supabase
        .from("chats")
        .select("id, role, content, source, createdAt")
        .eq("user_id", userId) // Explicitly filter by user_id
        .order("createdAt", { ascending: false })
        .limit(200);

    // Filter by source if provided
    if (source) {
        query = query.eq("source", source);
    }

    const { data, error } = await query;

    if (error) {
        console.error("[chat-history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    // Map back to client schema
    const clientMessages = (data || []).map((row: any) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        source: row.source,
        created_at: new Date(row.createdAt).toISOString(), // Convert bigint -> ISO string
    }));

    return respondJson(clientMessages);
}

// DELETE: Delete chat message by ID
async function deleteChat(chatId: string, supabase: SupabaseClient, userId: string): Promise<Response> {
    const { error } = await supabase
        .from("chats")
        .delete()
        .eq("id", chatId)
        .eq("user_id", userId); // Ensure user owns the chat

    if (error) {
        console.error("[chat-history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    return respondJson({ ok: true });
}

// DELETE: Clear all chat history
async function clearAllChats(supabase: SupabaseClient, userId: string): Promise<Response> {
    const { error } = await supabase
        .from("chats")
        .delete()
        .eq("user_id", userId); // Safe delete for user

    if (error) {
        console.error("[chat-history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    return respondJson({ ok: true });
}

serve(async (req) => {
    console.log("[chat-history] Function started");

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const authContext = await getUserContext(req.headers.get("Authorization"));
    if (authContext instanceof Response) {
        return authContext;
    }

    const { supabase, userId } = authContext;
    const url = new URL(req.url);
    const chatId = url.searchParams.get("id");
    const source = url.searchParams.get("source");
    const clearAll = url.searchParams.get("clear_all") === "true";

    try {
        if (req.method === "POST") {
            let payload: { messages: ChatMessage[] };
            try {
                payload = await req.json();
            } catch {
                return respondJson({ error: "Invalid JSON" }, 400);
            }

            if (!payload.messages || !Array.isArray(payload.messages)) {
                return respondJson({ error: "messages array is required" }, 400);
            }

            return await saveChat(payload.messages, supabase, userId);
        }

        if (req.method === "GET") {
            return await listChats(supabase, userId, source || undefined);
        }

        if (req.method === "DELETE") {
            if (clearAll) {
                return await clearAllChats(supabase, userId);
            }

            if (!chatId) {
                return respondJson({ error: "chat id is required" }, 400);
            }

            return await deleteChat(chatId, supabase, userId);
        }

        return respondJson({ error: "Method not allowed" }, 405);
    } catch (error) {
        console.error("[chat-history] Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return respondJson({ error: message }, 500);
    }
});
