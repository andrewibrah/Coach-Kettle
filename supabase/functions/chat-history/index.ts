// Edge Function: chat-history
// CRUD operations for user-scoped chat history

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

interface ChatMessage {
    id?: string;
    user_id: string;
    role: "user" | "assistant";
    content: string;
    source: "workout_chat" | "coach_modal";
    created_at?: string;
}

function getSupabaseClient(authHeader?: string) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl) {
        throw new Error("Missing SUPABASE_URL");
    }

    // If auth header provided, use it to create user-scoped client
    if (authHeader) {
        return createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: { Authorization: authHeader }
            }
        });
    }

    // Fallback to service role for server-side operations
    return createClient(supabaseUrl, supabaseServiceKey);
}

function getUserIdFromToken(authHeader: string): string | null {
    try {
        // Extract JWT token from "Bearer <token>"
        const token = authHeader.replace("Bearer ", "");
        // Decode JWT payload (middle part)
        const payloadBase64 = token.split('.')[1];
        const payload = JSON.parse(atob(payloadBase64));
        return payload.sub || null;
    } catch {
        return null;
    }
}

// POST: Save chat messages
async function saveChat(messages: ChatMessage[], authHeader: string): Promise<Response> {
    const userId = getUserIdFromToken(authHeader);
    if (!userId) {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Validate message count (prevent abuse)
    if (messages.length > 10) {
        return new Response(
            JSON.stringify({ error: "Too many messages (max 10)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = getSupabaseClient(authHeader);

    // Ensure all messages have the correct user_id and validate/sanitize content
    const messagesWithUser = messages.map(msg => {
        // Validate role
        if (msg.role !== 'user' && msg.role !== 'assistant') {
            throw new Error('Invalid role');
        }
        // Validate source
        if (msg.source !== 'workout_chat' && msg.source !== 'coach_modal') {
            throw new Error('Invalid source');
        }
        // Sanitize and limit content
        const content = (msg.content || '').slice(0, 5000).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

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
        return new Response(
            JSON.stringify({ error: "Database error", details: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}


// GET: List chat history for authenticated user
async function listChats(authHeader: string, source?: string): Promise<Response> {
    const userId = getUserIdFromToken(authHeader);
    if (!userId) {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = getSupabaseClient(authHeader);

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
        return new Response(
            JSON.stringify({ error: "Database error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
        JSON.stringify(data || []),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

// DELETE: Delete chat message by ID (only if owned by user)
async function deleteChat(chatId: string, authHeader: string): Promise<Response> {
    const userId = getUserIdFromToken(authHeader);
    if (!userId) {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = getSupabaseClient(authHeader);

    const { error } = await supabase
        .from("chat_history")
        .delete()
        .eq("id", chatId)
        .eq("user_id", userId); // Ensure user owns this chat

    if (error) {
        console.error("[chat-history] Database error:", error);
        return new Response(
            JSON.stringify({ error: "Database error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

// DELETE: Clear all chat history for user
async function clearAllChats(authHeader: string): Promise<Response> {
    const userId = getUserIdFromToken(authHeader);
    if (!userId) {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = getSupabaseClient(authHeader);

    const { error } = await supabase
        .from("chat_history")
        .delete()
        .eq("user_id", userId);

    if (error) {
        console.error("[chat-history] Database error:", error);
        return new Response(
            JSON.stringify({ error: "Database error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return new Response(
            JSON.stringify({ error: "Missing Authorization header" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

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
                return new Response(
                    JSON.stringify({ error: "Invalid JSON" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (!payload.messages || !Array.isArray(payload.messages)) {
                return new Response(
                    JSON.stringify({ error: "messages array is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return await saveChat(payload.messages, authHeader);
        }

        if (req.method === "GET") {
            return await listChats(authHeader, source || undefined);
        }

        if (req.method === "DELETE") {
            if (clearAll) {
                return await clearAllChats(authHeader);
            }

            if (!chatId) {
                return new Response(
                    JSON.stringify({ error: "chat id is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            return await deleteChat(chatId, authHeader);
        }

        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[chat-history] Error:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
