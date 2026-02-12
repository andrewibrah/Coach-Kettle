// Edge Function: coach
// OpenAI-powered coach Q&A with user workout history context

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

interface ChatHistoryMessage {
    role: string;
    content: string;
}

interface CoachRequest {
    question: string;
    rows: WorkoutRow[];
    chatHistory?: ChatHistoryMessage[];
}

const SYSTEM_PROMPT = `You are Coach, a knowledgeable and direct strength training coach for Coach Kettle, a workout tracking app.

You have access to the user's profile, recent workout history, and personal records (PRs). Use this data to give specific, personalized advice.

Guidelines:
- Reference the user's actual numbers, exercises, and patterns when relevant.
- If they ask about a specific lift, cite their recent performance and PRs for that lift.
- Identify trends: are they progressing, plateauing, or regressing?
- Suggest concrete next steps (weight increases, volume adjustments, deload weeks, etc.).
- If the user has stated goals in their profile, align advice with those goals.
- Keep answers focused and actionable, 100-200 words.
- If no history exists for what they're asking about, say so honestly.
- Do NOT use bold text (stars), italics, or markdown formatting. Use plain text only.`;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function verifyAuth(req: Request): Promise<string> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token) {
        throw new Error("Missing authentication token");
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
        console.error("[coach] Auth verification failed:", error.message);
        throw new Error("Unauthorized: " + error.message);
    }

    if (!data.user) {
        console.error("[coach] Auth verification: No user returned");
        throw new Error("Unauthorized: No user found");
    }

    return data.user.id;
}

serve(async (req) => {
    console.log("[coach] Function started (Stream + DB Context)");

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

    // Manual JWT Verification — now returns userId
    let userId: string;
    try {
        userId = await verifyAuth(req);
    } catch (e) {
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    const { question, rows = [], chatHistory = [] } = payload;
    if (!question) {
        return new Response(
            JSON.stringify({ error: "question is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Fetch user context from DB (errors are non-blocking)
    let userContext: {
        profile: any | null;
        recentWorkouts: any[];
        prLifts: any[];
    } = { profile: null, recentWorkouts: [], prLifts: [] };

    try {
        const [profileResult, workoutsResult, prLiftsResult] = await Promise.all([
            supabaseAdmin
                .from("profiles")
                .select("display_name, ai_context, focus, experience, training_days")
                .eq("id", userId)
                .single(),
            supabaseAdmin
                .from("workouts")
                .select("part, rows, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false })
                .limit(10),
            supabaseAdmin
                .from("pr_lifts")
                .select("lift_name, weight_lbs, reps, estimated_1rm")
                .eq("user_id", userId),
        ]);

        if (profileResult.data) userContext.profile = profileResult.data;
        if (workoutsResult.data) userContext.recentWorkouts = workoutsResult.data;
        if (prLiftsResult.data) userContext.prLifts = prLiftsResult.data;

        console.log(`[coach] Context loaded: profile=${!!profileResult.data}, workouts=${workoutsResult.data?.length ?? 0}, PRs=${prLiftsResult.data?.length ?? 0}`);
    } catch (dbError) {
        console.warn("[coach] DB query failed, continuing with empty context:", dbError);
    }

    // Build context message for the AI
    const contextParts: string[] = [];

    if (userContext.profile) {
        const p = userContext.profile;
        const profileLines: string[] = [];
        if (p.display_name) profileLines.push(`Name: ${p.display_name}`);
        if (p.focus) profileLines.push(`Focus: ${p.focus}`);
        if (p.experience) profileLines.push(`Experience: ${p.experience}`);
        if (p.training_days) profileLines.push(`Training days/week: ${p.training_days}`);
        if (p.ai_context) profileLines.push(`User notes: ${p.ai_context}`);
        if (profileLines.length > 0) {
            contextParts.push("USER PROFILE:\n" + profileLines.join("\n"));
        }
    }

    if (userContext.prLifts.length > 0) {
        const prLines = userContext.prLifts.map(
            (pr: any) => `${pr.lift_name}: ${pr.weight_lbs} lbs x ${pr.reps} (e1RM: ${pr.estimated_1rm})`
        );
        contextParts.push("PERSONAL RECORDS:\n" + prLines.join("\n"));
    }

    if (userContext.recentWorkouts.length > 0) {
        const workoutSummaries = userContext.recentWorkouts.map((w: any) => {
            const date = w.created_at ? new Date(w.created_at).toLocaleDateString() : "unknown date";
            const part = w.part || "General";
            const rowCount = Array.isArray(w.rows) ? w.rows.length : 0;

            // Summarize exercises from rows
            let exerciseSummary = "";
            if (Array.isArray(w.rows) && w.rows.length > 0) {
                const exercises = [...new Set(w.rows.map((r: any) => r.exercise).filter(Boolean))];
                exerciseSummary = exercises.slice(0, 5).join(", ");
                if (exercises.length > 5) exerciseSummary += ` (+${exercises.length - 5} more)`;
            }

            return `${date} - ${part}: ${rowCount} sets${exerciseSummary ? ` [${exerciseSummary}]` : ""}`;
        });
        contextParts.push("RECENT WORKOUTS (newest first):\n" + workoutSummaries.join("\n"));
    }

    const userContextStr = contextParts.length > 0
        ? contextParts.join("\n\n")
        : "No workout history or profile data available.";

    try {
        // Build messages array with conversation history for multi-turn context
        const messages: Array<{ role: string; content: string }> = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "system", content: `User Context:\n${userContextStr}` },
        ];

        // Add prior conversation history (already limited to last 10 by client)
        if (chatHistory.length > 0) {
            // Exclude the current question (last user message) since we add it below
            const priorMessages = chatHistory.slice(0, -1);
            for (const msg of priorMessages) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    messages.push({ role: msg.role, content: msg.content });
                }
            }
        }

        // Add current question with session context
        messages.push({
            role: "user",
            content: rows.length > 0
                ? JSON.stringify({ question, current_session_rows: rows })
                : question,
        });

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openaiApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages,
                stream: true,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[coach] OpenAI error:", errorText);
            return new Response(
                JSON.stringify({ error: "OpenAI request failed", upstream_error: errorText }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create a stream that transforms OpenAI SSE into raw text
        const stream = new ReadableStream({
            async start(controller) {
                const reader = response.body?.getReader();
                if (!reader) {
                    controller.close();
                    return;
                }

                const decoder = new TextDecoder("utf-8");
                const encoder = new TextEncoder();

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value);
                        const lines = chunk.split("\n");

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed === "data: [DONE]") continue;
                            if (trimmed.startsWith("data: ")) {
                                const data = trimmed.slice(6);
                                try {
                                    const json = JSON.parse(data);
                                    const content = json.choices?.[0]?.delta?.content;
                                    if (content) {
                                        controller.enqueue(encoder.encode(content));
                                    }
                                } catch (e) {
                                    console.warn("Failed to parse SSE line:", trimmed);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Stream error:", err);
                    controller.error(err);
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });

    } catch (error) {
        console.error("[coach] Error:", error);
        return new Response(
            JSON.stringify({ error: "OpenAI request failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
