// Edge Function: chat-history
// CRUD operations for user-scoped chat history

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

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

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase env vars");
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
        return respondJson({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createUserClient(authHeader);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
        console.error("[chat-history] Auth error:", error);
        return respondJson({ error: "Unauthorized" }, 401);
    }

    return { supabase, userId: data.user.id };
}

// POST: Save chat messages
async function saveChat(messages: ChatMessage[], supabase: SupabaseClient, userId: string): Promise<Response> {
    // Validate message count (prevent abuse)
    if (messages.length > 10) {
        return respondJson({ error: "Too many messages (max 10)" }, 400);
    }

    // Ensure all messages have the correct user_id and validate/sanitize content
    const messagesWithUser = messages.map(msg => {
        if (msg.role !== "user" && msg.role !== "assistant") {
            throw new Error("Invalid role");
        }
        if (msg.source !== "workout_chat" && msg.source !== "coach_modal") {
            throw new Error("Invalid source");
        }

        const content = (msg.content || "")
            .slice(0, 5000)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

        return {
            user_id: userId,
            role: msg.role,
            content,
            source: msg.source,
            created_at: msg.created_at || new Date().toISOString(),
        };
    });

    const { error } = await supabase
        .from("chat_history")
        .insert(messagesWithUser);

    if (error) {
        console.error("[chat-history] Database error:", error);
        return respondJson({ error: "Database error", details: error.message }, 500);
    }

    return respondJson({ ok: true });
}


// GET: List chat history for authenticated user
async function listChats(supabase: SupabaseClient, userId: string, source?: string): Promise<Response> {
    let query = supabase
        .from("chat_history")
        .select("id, user_id, role, content, source, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

    if (source) {
        query = query.eq("source", source);
    }

    const { data, error } = await query;

    if (error) {
        console.error("[chat-history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    return respondJson(data || []);
}

// DELETE: Delete chat message by ID (only if owned by user)
async function deleteChat(chatId: string, supabase: SupabaseClient, userId: string): Promise<Response> {
    const { error } = await supabase
        .from("chat_history")
        .delete()
        .eq("id", chatId)
        .eq("user_id", userId);

    if (error) {
        console.error("[chat-history] Database error:", error);
        return respondJson({ error: "Database error" }, 500);
    }

    return respondJson({ ok: true });
}

// DELETE: Clear all chat history for user
async function clearAllChats(supabase: SupabaseClient, userId: string): Promise<Response> {
    const { error } = await supabase
        .from("chat_history")
        .delete()
        .eq("user_id", userId);

    if (error) {
        console.error("[chat-history] Database error:", error);
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
