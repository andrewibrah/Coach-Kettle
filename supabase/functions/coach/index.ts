// Edge Function: coach
// OpenAI-powered coach Q&A with user workout history context

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";
import { gateAiRequest } from "../_shared/entitlements.ts";
import { coachTextStream } from "./coachStream.ts";
import { COACHING_POLICY, disclosureBlock, readCoachingContext } from "../_shared/coachingPolicy.ts";

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
    context?: unknown;
}

// Transport-safety bounds, not coaching policy: 10 entries is the client's existing
// window and 5000 chars matches lib/chatStorage sanitizeContent. Older turns fall out
// of this window, which is why disclosures travel separately (flag-gated).
const MAX_HISTORY_ENTRIES = 10;
const MAX_HISTORY_CONTENT = 5000;

const SYSTEM_PROMPT = `You are Coach, a direct, knowledgeable strength coach for Coach Kettle, a workout tracking app.

You have access to the user's profile, recent workout history, and personal records. Use that data to give specific, personalized advice.

CONTENT
- Reference the user's actual numbers, exercises, and patterns.
- When asked about a lift, cite their recent performance and PR for that lift.
- Name the trend explicitly: progressing, plateauing, or regressing.
- Recommend one concrete next step (a weight increase, a volume change, a deload).
- Align advice with the goals stated in their profile.
- If you have no history for what they asked, say so plainly. Never invent numbers.

WRITING
- Write 100-200 words. Never exceed 200.
- Use complete, grammatical sentences in the second person.
- One idea per sentence. Prefer short sentences to long ones.
- Use the app's terms exactly: set, rep, e1RM, PR, deload, volume, intensity.
- Write weights as "225 lb" and sets as "3x5".
- No filler openers ("Great question!"), no hedging, no rhetorical questions.
- Plain text only. No markdown, bold, italics, bullets, or emoji.`;

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
    if (typeof question !== "string" || !question) {
        return new Response(
            JSON.stringify({ error: "question is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
    // Ignored entirely while the D09 policy flag is off.
    const coachingContext = COACHING_POLICY.contextualDisclosures && payload.context !== undefined
        ? readCoachingContext(payload.context) : undefined;
    if (coachingContext === null) {
        return new Response(
            JSON.stringify({ error: "Invalid coaching context." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
    const disclosures = coachingContext ? disclosureBlock(coachingContext) : null;

    // --- Entitlement + AI usage gating (fail closed, atomic) ---
    // After all request validation, so a 4xx never consumes AI quota.
    const gate = await gateAiRequest(supabaseAdmin, userId, "coach");
    if (!gate.allowed) {
        return new Response(
            JSON.stringify(gate.body),
            { status: gate.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Drop malformed entries (bad role, non-string, empty or oversized content), keep the last 10.
    const priorMessages = (Array.isArray(chatHistory) ? chatHistory : [])
        .filter((m): m is ChatHistoryMessage => !!m && (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" && m.content.trim().length > 0 && m.content.length <= MAX_HISTORY_CONTENT)
        .slice(-MAX_HISTORY_ENTRIES);
    // Clients append the current question last; it is re-added below with the session rows.
    const lastMessage = priorMessages[priorMessages.length - 1];
    if (lastMessage?.role === "user" && lastMessage.content.trim() === question.trim()) priorMessages.pop();

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
                .select("focus, focus_other, ai_context, current_weight, goal_weight, weight_unit, height_value, height_unit, dob")
                .eq("user_id", userId)
                .single(),
            supabaseAdmin
                .from("workouts")
                .select("part, rows_json, createdAt")
                .eq("user_id", userId)
                .order("createdAt", { ascending: false })
                .limit(10),
            supabaseAdmin
                .from("pr_lifts")
                .select("lift_name, weight_lbs, reps, estimated_1rm")
                .eq("user_id", userId),
        ]);

        if (profileResult.data) userContext.profile = profileResult.data;
        if (workoutsResult.data) userContext.recentWorkouts = workoutsResult.data;
        if (prLiftsResult.data) userContext.prLifts = prLiftsResult.data;

        if (profileResult.error) console.warn("[coach] Profile query error:", profileResult.error.message);
        if (workoutsResult.error) console.warn("[coach] Workouts query error:", workoutsResult.error.message);
        if (prLiftsResult.error) console.warn("[coach] PR lifts query error:", prLiftsResult.error.message);

        console.log(`[coach] Context loaded: profile=${!!profileResult.data}, workouts=${workoutsResult.data?.length ?? 0}, PRs=${prLiftsResult.data?.length ?? 0}`);
    } catch (dbError) {
        console.warn("[coach] DB query failed, continuing with empty context:", dbError);
    }

    // Build context message for the AI
    const contextParts: string[] = [];

    if (userContext.profile) {
        const p = userContext.profile;
        const profileLines: string[] = [];
        if (p.focus) {
            const focusLabel = p.focus === "lean_muscle" ? "lean muscle" : p.focus === "fat_loss" ? "fat loss" : p.focus;
            profileLines.push(`Fitness focus: ${p.focus === "other" && p.focus_other ? p.focus_other : focusLabel}`);
        }
        if (p.height_value && p.height_unit) profileLines.push(`Height: ${p.height_value}${p.height_unit}`);
        if (p.current_weight && p.weight_unit) profileLines.push(`Body weight: ${p.current_weight}${p.weight_unit}`);
        if (p.goal_weight && p.weight_unit) profileLines.push(`Goal weight: ${p.goal_weight}${p.weight_unit}`);
        if (p.dob) {
            const age = Math.floor((Date.now() - new Date(p.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
            profileLines.push(`Age: ${age}`);
        }
        if (p.ai_context && typeof p.ai_context === "object") {
            const ctx = p.ai_context as Record<string, unknown>;
            const notes = Object.entries(ctx)
                .filter(([, v]) => v !== null && v !== undefined && v !== "")
                .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                .join(", ");
            if (notes) profileLines.push(`Additional context: ${notes}`);
        }
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
            const date = w.createdAt ? new Date(Number(w.createdAt)).toLocaleDateString() : "unknown date";
            const part = w.part || "General";
            // Flag-gated: past notes are labeled by date and never presented as current symptoms.
            const historicalNote = (notes: unknown) => COACHING_POLICY.contextualDisclosures && typeof notes === "string" && notes.trim()
                ? ` [note from ${date}, historical, not current: ${JSON.stringify(notes)}]` : "";

            let parsedRows: any[] = [];
            if (w.rows_json) {
                try { parsedRows = JSON.parse(w.rows_json); } catch { /* ignore */ }
            }

            if (parsedRows.length === 0) {
                return `${date} - ${part}: (no sets logged)`;
            }

            // Group rows by exercise, preserving order of first appearance
            const exerciseMap = new Map<string, any[]>();
            for (const row of parsedRows) {
                const name = row.exercise || "Unknown";
                if (!exerciseMap.has(name)) exerciseMap.set(name, []);
                exerciseMap.get(name)!.push(row);
            }

            const exerciseLines: string[] = [];
            for (const [name, sets] of exerciseMap) {
                const firstSet = sets[0];
                if (firstSet.isCardio) {
                    const parts: string[] = [];
                    if (firstSet.durationMins) parts.push(`${firstSet.durationMins} min`);
                    if (firstSet.distance && firstSet.distanceUnit) parts.push(`${firstSet.distance} ${firstSet.distanceUnit}`);
                    if (firstSet.heartRate) parts.push(`HR ${firstSet.heartRate} bpm`);
                    if (firstSet.calories) parts.push(`${firstSet.calories} cal`);
                    if (firstSet.level) parts.push(`level ${firstSet.level}`);
                    exerciseLines.push(`  ${name}: ${parts.length > 0 ? parts.join(", ") : "(cardio)"}${historicalNote(firstSet.notes)}`);
                } else {
                    const setStrings = sets.map((s: any, i: number) => {
                        const w = s.weightLbs || "BW";
                        const r = s.reps || "?";
                        return `Set ${i + 1}: ${w}x${r}${historicalNote(s.notes)}`;
                    });
                    exerciseLines.push(`  ${name}: ${setStrings.join(", ")}`);
                }
            }

            return `${date} - ${part}:\n${exerciseLines.join("\n")}`;
        });
        contextParts.push("RECENT WORKOUTS (newest first):\n" + workoutSummaries.join("\n\n"));
    }

    const userContextStr = contextParts.length > 0
        ? contextParts.join("\n\n")
        : "No workout history or profile data available.";

    try {
        // Build messages array with conversation history for multi-turn context
        const messages: { role: string; content: string }[] = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "system", content: `User Context:\n${userContextStr}` },
            // Labeled context, never replayed as chat turns.
            ...(disclosures ? [{ role: "system", content: disclosures }] : []),
        ];

        // Prior conversation history (bounded and validated above)
        for (const msg of priorMessages) {
            messages.push({ role: msg.role, content: msg.content });
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
                temperature: 0.4,
            }),
        });

        if (!response.ok) {
            // Never log or return the provider body: it can echo keys/org ids.
            await response.body?.cancel();
            console.error("[coach] openai_error status=", response.status);
            return new Response(
                JSON.stringify({ error: "Coach is temporarily unavailable", code: "COACH_UNAVAILABLE" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Keep provider framing separate from transport chunk boundaries.
        const stream = coachTextStream(response.body!);

        return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/plain" },
        });

    } catch {
        console.error("[coach] openai_request_error");
        return new Response(
            JSON.stringify({ error: "Coach is temporarily unavailable", code: "COACH_UNAVAILABLE" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
