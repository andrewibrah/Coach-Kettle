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

    // JWT verification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return respondJson({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !data.user) {
        console.error("[observability] Auth verification failed:", authError?.message);
        return respondJson({ error: "Unauthorized" }, 401);
    }

    const userId = data.user.id;
    console.log("[observability] User verified:", userId);

    if (req.method !== "POST") {
        return respondJson({ error: "Method not allowed" }, 405);
    }

    let payload: {
        source?: string;
        level?: string;
        message?: string;
        context?: Record<string, unknown>;
    };

    try {
        payload = await req.json();
    } catch {
        return respondJson({ error: "Invalid JSON" }, 400);
    }

    const { source, level, message, context } = payload || {};
    if (!source || !level || !message) {
        return respondJson({ error: "source, level, and message are required" }, 400);
    }

    const { error } = await supabaseAdmin.from("event_logs").insert({
        source,
        level,
        message,
        context: context ?? null,
        user_id: userId,
    });

    if (error) {
        return respondJson({ error: error.message }, 500);
    }

    return respondJson({ ok: true });
});
