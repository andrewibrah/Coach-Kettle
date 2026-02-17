// Edge Function: chat
// Dual-mode: parses workout input OR answers fitness questions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

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
    lastExercise?: string;
}

interface ChatResponse {
    rows?: WorkoutRow[];
    answer?: string;
}

// System prompt handles two modes:
// PARSE MODE → returns { rows: [...] }
// ANSWER MODE → returns { answer: "..." } (max 50 words)
const SYSTEM_PROMPT = `You are a gym workout tracker assistant. Given a user message, choose one of two modes:

PARSE MODE — if the message describes one or more workout sets:
Return: {"rows":[{"exercise":"string","set":1,"weightLbs":"string","reps":"string","notes":"string"}]}
Rules:
- Convert weights to numeric pounds (no units). kg × 2.205. Plates: (plates × 45 × 2) + 45.
- Auto-increment set numbers per exercise based on existing_rows provided.
- Return ONLY new rows inferred from the message.
- If no exercise name is given, use last_exercise from context (if provided).
- "same" or "again" means repeat the last row's exercise, weight, and reps as a new set.
- Multiple sets in one message (e.g. "bench 100 10 120 10" or "100,10,120,10"): return one row per set.
- Empty weightLbs or reps should be "".
- notes: use "warmup", "DS" (dropset), "SS" (superset), or "" as appropriate.

ANSWER MODE — if the message is a question, conversational, or cannot be parsed as a workout:
Return: {"answer":"your response here"}
Rules:
- Maximum 50 words. Be direct and gym-focused.
- No markdown. Plain text only.

Return valid JSON only. No markdown fences, no extra keys, no explanation outside the JSON.`;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase env vars");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // JWT verification
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !data.user) {
        console.error("[chat] Auth verification failed:", authError?.message);
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const userId = data.user.id;
    console.log("[chat] User verified:", userId);

    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
        return new Response(
            JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
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

    const { message, rows = [], lastExercise } = payload;
    if (!message?.trim()) {
        return new Response(
            JSON.stringify({ error: "message is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const context = {
        message,
        existing_rows: rows,
        ...(lastExercise ? { last_exercise: lastExercise } : {}),
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
                max_tokens: 600,
                temperature: 0.2,
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
                JSON.stringify({ error: "No response from model" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        let parsed: ChatResponse;
        try {
            parsed = JSON.parse(content);
        } catch {
            console.error('[chat] Failed to parse OpenAI response:', content);
            return new Response(
                JSON.stringify({ answer: "I couldn't understand that. Try: Exercise Weight Reps." }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate: must have rows OR answer
        if (!parsed.rows && !parsed.answer) {
            console.error("[chat] Model returned neither rows nor answer:", content);
            return new Response(
                JSON.stringify({ answer: "I couldn't understand that. Try: Exercise Weight Reps." }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Sanitize rows if present
        if (parsed.rows) {
            parsed.rows = parsed.rows
                .filter((r) => r.exercise?.trim())
                .map((r) => ({
                    exercise: String(r.exercise).trim(),
                    set: Number.isInteger(r.set) && r.set > 0 ? r.set : 1,
                    weightLbs: String(r.weightLbs ?? "").trim(),
                    reps: String(r.reps ?? "").trim(),
                    notes: String(r.notes ?? "").trim(),
                }));
        }

        return new Response(
            JSON.stringify(parsed),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[chat] Error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
