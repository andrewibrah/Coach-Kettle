// Edge Function: observability
// Accepts log events and inserts into public.event_logs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase env vars");
}

// Singleton admin client
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

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return respondJson({ error: "Method not allowed" }, 405);
    }

    let payload: {
        source?: string;
        level?: string;
        message?: string;
        context?: Record<string, unknown>;
        user_id?: string;
    };

    try {
        payload = await req.json();
    } catch {
        return respondJson({ error: "Invalid JSON" }, 400);
    }

    const { source, level, message, context, user_id } = payload || {};
    if (!source || !level || !message) {
        return respondJson({ error: "source, level, and message are required" }, 400);
    }

    const { error } = await supabaseAdmin.from("event_logs").insert({
        source,
        level,
        message,
        context: context ?? null,
        user_id: user_id ? user_id : null,
    });

    if (error) {
        return respondJson({ error: error.message }, 500);
    }

    return respondJson({ ok: true });
});
