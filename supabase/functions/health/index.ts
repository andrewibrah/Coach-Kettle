// Edge Function: health
// Simple health check endpoint

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    return new Response(
        JSON.stringify({ ok: true }),
        {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
    );
});
