// Edge Function: chat
// OpenAI-powered workout row parsing

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface WorkoutRow {
    exercise: string;
    set: number;
    weightLbs: string;
    reps: string;
    notes: string;
}

interface ChatRequest {
    message: string;
    rows: WorkoutRow[];
}

interface ChatResponse {
    rows: WorkoutRow[];
}

const SYSTEM_PROMPT = `You are a Gym Workout Tracker parser.

Return a JSON object with a single key "rows" containing an array of workout rows.
Each row must include: exercise (string), set (integer), weightLbs (string), reps (string), notes (string).
If a field is missing, return an empty string.
If weights are mentioned, convert to numeric pounds with no units.
Set numbers must auto-increment per exercise based on existing rows provided.
Return only new rows inferred from the message.
Do not include extra keys, text, or markdown.`;

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
        return new Response(
            JSON.stringify({ error: "OPENAI_API_KEY is not set on the server" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    let payload: ChatRequest;
    try {
        payload = await req.json();
    } catch {
        return new Response(
            JSON.stringify({ error: "Invalid JSON" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const { message, rows = [] } = payload;
    if (!message) {
        return new Response(
            JSON.stringify({ error: "message is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const context = {
        message,
        existing_rows: rows,
    };

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openaiApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: JSON.stringify(context) },
                ],
                response_format: { type: "json_object" },
                max_tokens: 1000,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[chat] OpenAI error:", errorText);
            return new Response(
                JSON.stringify({ error: "OpenAI request failed" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            return new Response(
                JSON.stringify({ error: "Model did not return structured output" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const parsed: ChatResponse = JSON.parse(content);

        return new Response(
            JSON.stringify(parsed),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[chat] Error:", error);
        return new Response(
            JSON.stringify({ error: "OpenAI request failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
