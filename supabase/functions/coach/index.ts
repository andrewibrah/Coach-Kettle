// Edge Function: coach
// OpenAI-powered coach Q&A

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.2.0";

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
Keep answers under 60 words.
Do NOT use bold text (stars), italics, or markdown formatting. Use plain text only.`;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const JWKS = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));

async function verifyAuth(req: Request) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    try {
        await jwtVerify(token, JWKS, {
            issuer: `${supabaseUrl}/auth/v1`,
            audience: "authenticated",
        });
    } catch (error) {
        console.error("[coach] JWT verification failed:", error);
        throw new Error("Unauthorized");
    }
}

serve(async (req) => {
    console.log("[coach] Function started (Stream + Manual Auth)");

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

    // Manual JWT Verification
    try {
        await verifyAuth(req);
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
                stream: true, // Enable streaming
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
