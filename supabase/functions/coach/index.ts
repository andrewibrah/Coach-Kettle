// Edge Function: coach
// OpenAI-powered coach Q&A

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

interface CoachRequest {
    question: string;
    rows: WorkoutRow[];
}

interface CoachResponse {
    answer: string;
}

const SYSTEM_PROMPT = `You are Coach, a concise strength trainer.
Use the workout table as context when answering the user's question.
- If rows are present, reference trends, gaps, or next steps based on them.
- If no rows are provided, give a short, actionable answer without making up data.
Keep answers under 120 words and prioritize clear, numbered or bulleted guidance when helpful.`;

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

    let payload: CoachRequest;
    try {
        payload = await req.json();
    } catch {
        return new Response(
            JSON.stringify({ error: "Invalid JSON" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const { question, rows = [] } = payload;
    if (!question) {
        return new Response(
            JSON.stringify({ error: "question is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const context = {
        question,
        rows,
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
                max_tokens: 500,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[coach] OpenAI error:", errorText);
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

        // Parse JSON and extract answer
        let parsed: CoachResponse;
        try {
            parsed = JSON.parse(content);
        } catch {
            // If not JSON, use content as answer directly
            parsed = { answer: content };
        }

        // Ensure answer field exists
        if (!parsed.answer && typeof content === "string") {
            parsed = { answer: content };
        }

        return new Response(
            JSON.stringify(parsed),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[coach] Error:", error);
        return new Response(
            JSON.stringify({ error: "OpenAI request failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
