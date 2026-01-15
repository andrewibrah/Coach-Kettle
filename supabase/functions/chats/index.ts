// Edge Function: chats
// List and manage chat history

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function getSupabaseClient() {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error("Missing Supabase environment variables");
    }

    return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: List all chats
async function listChats(): Promise<Response> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
        .from("chats")
        .select("id, title, role, content, createdAt, source")
        .order("createdAt", { ascending: false })
        .limit(100);

    if (error) {
        console.error("[chats] Database error:", error);
        return new Response(
            JSON.stringify({ error: "Database error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const chats: ChatItem[] = (data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt,
        source: row.source,
    }));

    return new Response(
        JSON.stringify(chats),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
}

// POST: Save a chat message
async function saveChat(payload: ChatItem): Promise<Response> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
        .from("chats")
        .upsert({
            id: payload.id,
            title: payload.title,
            role: payload.role,
            content: payload.content,
            createdAt: payload.createdAt,
            source: payload.source,
        }, { onConflict: "id" });

    if (error) {
        console.error("[chats] Database error:", error);
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

// DELETE: Delete a chat by id
async function deleteChat(chatId: string): Promise<Response> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
        .from("chats")
        .delete()
        .eq("id", chatId);

    if (error) {
        console.error("[chats] Database error:", error);
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

    const url = new URL(req.url);
    const path = url.pathname;

    try {
        if (req.method === "GET" && path === "/chats") {
            return await listChats();
        } else if (req.method === "POST" && path === "/chats") {
            const payload: ChatItem = await req.json();
            return await saveChat(payload);
        } else if (req.method === "DELETE" && path.startsWith("/chats/")) {
            const chatId = path.split("/chats/")[1];
            if (!chatId) {
                return new Response(
                    JSON.stringify({ error: "Chat ID is required" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            return await deleteChat(chatId);
        } else {
            return new Response(
                JSON.stringify({ error: "Method not allowed" }),
                { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
    } catch (error) {
        console.error("[chats] Error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

