// Edge Function: parse
// Fast local parsing without AI - implements structured_gate.py logic in TypeScript

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Types ---

type ParsedRowKind = "normal" | "warmup" | "dropset" | "superset" | "cardio";
type GateDecisionReason =
    | "empty_message"
    | "multiple_entries_or_sets"
    | "ambiguous_same_as_previous"
    | "unsupported_units"
    | "non_lift_units"
    | "missing_exercise"
    | "missing_reps"
    | "success";
type FastPattern = "single" | "multi" | "dropset" | "superset" | "cardio" | "warmup";

interface ParsedRow {
    exercise: string;
    weightLbs: string;
    reps: string;
    notes: string;
    kind: ParsedRowKind;
}

interface FastDecision {
    kind: "fast";
    reason: "success";
    rows: ParsedRow[];
    meta?: { pattern: FastPattern };
}

interface AiDecision {
    kind: "ai";
    reason: GateDecisionReason;
    userHint?: string;
}

type GateDecision = FastDecision | AiDecision;

interface ParseRequest {
    message: string;
    lastExercise?: string;
}

interface NumberPair {
    weight: string;
    reps: string;
}

interface ParsedPairs {
    pairs: NumberPair[];
    leftoverNumericCount: number;
    numberCount: number;
}

// --- Constants ---

const MULTI_REASON: GateDecisionReason = "multiple_entries_or_sets";
const KG_TO_LB = 2.20462;
const PLATE_WEIGHT = 45;
const BAR_WEIGHT = 45;

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

// --- Helper Functions ---

function normalizeSpaces(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function formatWeight(num: number): string {
    if (!Number.isFinite(num)) return "";
    const rounded = Math.round(num * 10) / 10;
    if (Number.isInteger(rounded)) {
        return String(Math.round(rounded));
    }
    return String(rounded);
}

function normalizeWeightToLbs(value: string, unit?: string): string {
    const raw = parseFloat(value);
    if (!Number.isFinite(raw)) return "";

    if (!unit) return formatWeight(raw);

    const u = unit.toLowerCase();
    if (u.startsWith("kg")) {
        return formatWeight(raw * KG_TO_LB);
    }
    if (u.startsWith("plate")) {
        return formatWeight(raw * PLATE_WEIGHT * 2 + BAR_WEIGHT);
    }

    return formatWeight(raw);
}

function userHintForReason(reason: GateDecisionReason): string | undefined {
    switch (reason) {
        case "empty_message":
            return 'Try something like "Bench 185 x 8".';
        case "multiple_entries_or_sets":
            return "One exercise per message. Format: Exercise Weight Reps.";
        case "ambiguous_same_as_previous":
            return "Say the exercise name or repeat the full set.";
        case "unsupported_units":
            return "Use lbs or kg (we convert). Skip plate math if unsure.";
        case "non_lift_units":
            return 'If cardio, try "Elliptical 15 min". Otherwise log weight/reps.';
        case "missing_exercise":
            return 'What exercise? Try "Bench 185 8" or just "135 10".';
        case "missing_reps":
            return "Add reps. Example: Exercise Weight Reps.";
        default:
            return undefined;
    }
}

function makeAiDecision(reason: GateDecisionReason): AiDecision {
    return {
        kind: "ai",
        reason,
        userHint: userHintForReason(reason),
    };
}

function parsePairsFromTail(tail: string): ParsedPairs {
    const pairs: NumberPair[] = [];
    const pairRegex = /(\d+(?:\.\d+)?)(?:\s*(kg|kgs?|lb|lbs?|plates?|plate))?[\s]*(?:x|×)?[\s]*(\d+(?:\.\d+)?)(?:\s*reps?)?/gi;

    let match;
    while ((match = pairRegex.exec(tail)) !== null) {
        const [, val1, unit, val2] = match;
        pairs.push({
            weight: normalizeWeightToLbs(val1, unit),
            reps: val2,
        });
    }

    const allNumbers = tail.match(/\d+(?:\.\d+)?/g) || [];
    const numberCount = allNumbers.length;
    const leftover = Math.max(0, numberCount - pairs.length * 2);

    return { pairs, leftoverNumericCount: leftover, numberCount };
}

function extractExercises(segment: string, allowMultiple: boolean): string[] {
    let cleaned = segment.replace(/\bsuperset\b/gi, "");
    cleaned = cleaned.replace(/\bss\b/gi, "");
    cleaned = cleaned.trim();

    if (!cleaned) return [];

    if (!allowMultiple) return [cleaned];

    const parts = cleaned.split(/\band\b|\/|,/i)
        .map(p => normalizeSpaces(p))
        .filter(p => p);

    if (parts.length) return parts;
    return [cleaned];
}

function hasMultipleExerciseSignals(segment: string): boolean {
    if (/\b(and|&)\b/i.test(segment)) return true;
    if (/[,/]/.test(segment)) return true;
    return false;
}

function hasCardioSignals(lower: string): boolean {
    if (/\bcardio\b|\belliptical\b|\btreadmill\b|\bbike\b|\brow(er)?\b|\brun\b|\bjog\b/.test(lower)) {
        return true;
    }
    if (/\bmins?\b|\bminutes?\b|\bmiles?\b|\bkm\b/.test(lower)) {
        return true;
    }
    return false;
}

function buildFastDecision(rows: ParsedRow[], pattern?: FastPattern): FastDecision {
    return {
        kind: "fast",
        reason: "success",
        rows,
        meta: pattern ? { pattern } : undefined,
    };
}

// --- Main Parser ---

function decideAndParse(message: string, lastExercise?: string): GateDecision {
    const trimmed = message.trim();
    if (!trimmed) return makeAiDecision("empty_message");
    if (trimmed.includes("\n")) return makeAiDecision(MULTI_REASON);

    const normalized = normalizeSpaces(trimmed);
    const lower = normalized.toLowerCase();
    const tokens = normalized.split(" ");

    let firstNumberIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
        if (/\d/.test(tokens[i])) {
            firstNumberIdx = i;
            break;
        }
    }

    const warmupFlag = /\bwarm\s*-?\s*up\b/.test(lower);
    const isSuperset = /\bsuperset\b/.test(lower) || /\bss\b/.test(lower);
    const isDropset = /\bdrops?et\b/.test(lower) || /\bdrop set\b/.test(lower);
    const isCardio = hasCardioSignals(lower);

    if (/\bsame as\b/.test(lower)) {
        return makeAiDecision("ambiguous_same_as_previous");
    }

    let exerciseSegment = normalized;
    if (firstNumberIdx > -1) {
        exerciseSegment = tokens.slice(0, firstNumberIdx).join(" ");
    }

    if (!isSuperset && exerciseSegment && hasMultipleExerciseSignals(exerciseSegment)) {
        return makeAiDecision(MULTI_REASON);
    }

    const exercises = extractExercises(exerciseSegment, isSuperset);

    if (!exercises.length && lastExercise) {
        exercises.push(lastExercise.trim());
    }

    if (!exercises.length) {
        return makeAiDecision("missing_exercise");
    }

    if (!isSuperset && exercises.length > 1) {
        return makeAiDecision(MULTI_REASON);
    }

    let tail = "";
    if (firstNumberIdx > -1) {
        tail = tokens.slice(firstNumberIdx).join(" ");
    }

    // Check for single number (bodyweight exercise: reps only)
    const singleNumberMatch = tail.match(/^(?:x\s*)?(\d+)$/);
    if (singleNumberMatch && !isSuperset && !isDropset && !isCardio) {
        const reps = singleNumberMatch[1];
        const baseNotes: string[] = [];
        if (warmupFlag) baseNotes.push("warmup");

        return buildFastDecision(
            [{
                exercise: exercises[0],
                weightLbs: "0",
                reps,
                notes: baseNotes.join(" "),
                kind: warmupFlag ? "warmup" : "normal",
            }],
            warmupFlag ? "warmup" : "single"
        );
    }

    const pairsResult = parsePairsFromTail(tail);
    const { pairs, leftoverNumericCount, numberCount } = pairsResult;

    // Cardio handling
    if (isCardio) {
        const minutesMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes)/);
        const distanceMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:mile|miles|km)/);
        const hrMatch = lower.match(/hr\s*(\d+(?:\.\d+)?)/);

        let repsVal = "";
        if (minutesMatch) {
            repsVal = minutesMatch[1];
        } else if (distanceMatch) {
            repsVal = distanceMatch[1];
        } else if (pairs.length > 0) {
            repsVal = pairs[0].reps || pairs[0].weight;
        }

        const intensity = pairs.length > 0 ? pairs[0].weight : "";
        const notesParts = ["cardio"];
        if (hrMatch) notesParts.push(`HR ${hrMatch[1]}`);

        return buildFastDecision(
            [{
                exercise: exercises[0],
                weightLbs: intensity,
                reps: repsVal,
                notes: notesParts.join(" "),
                kind: "cardio",
            }],
            "cardio"
        );
    }

    // Superset handling
    if (isSuperset) {
        if (exercises.length < 2) return makeAiDecision(MULTI_REASON);
        if (pairs.length < 2) return makeAiDecision("missing_reps");

        const rows: ParsedRow[] = [
            { exercise: exercises[0], weightLbs: pairs[0].weight, reps: pairs[0].reps, notes: "SS", kind: "superset" },
            { exercise: exercises[1], weightLbs: pairs[1].weight, reps: pairs[1].reps, notes: "SS", kind: "superset" },
        ];

        if (rows.some(r => !r.reps)) return makeAiDecision("missing_reps");
        if (leftoverNumericCount > 0 && pairs.length < 2) return makeAiDecision(MULTI_REASON);

        return buildFastDecision(rows, "superset");
    }

    // Dropset handling
    if (isDropset && exercises.length === 1) {
        if (pairs.length < 2) return makeAiDecision(MULTI_REASON);

        const rows: ParsedRow[] = pairs.map(pair => ({
            exercise: exercises[0],
            weightLbs: pair.weight,
            reps: pair.reps,
            notes: "DS",
            kind: "dropset" as ParsedRowKind,
        }));

        if (rows.some(r => !r.reps)) return makeAiDecision("missing_reps");

        return buildFastDecision(rows, "dropset");
    }

    // Multiple pairs (multi-set)
    if (pairs.length > 1) {
        const rows: ParsedRow[] = pairs.map(pair => ({
            exercise: exercises[0],
            weightLbs: pair.weight,
            reps: pair.reps,
            notes: "",
            kind: "normal" as ParsedRowKind,
        }));

        if (rows.some(r => !r.reps)) return makeAiDecision("missing_reps");
        if (leftoverNumericCount > 0) return makeAiDecision(MULTI_REASON);

        return buildFastDecision(rows, "multi");
    }

    // Single pair
    if (pairs.length === 1) {
        const baseNotes: string[] = [];
        if (warmupFlag) baseNotes.push("warmup");

        return buildFastDecision(
            [{
                exercise: exercises[0],
                weightLbs: pairs[0].weight,
                reps: pairs[0].reps,
                notes: baseNotes.join(" "),
                kind: warmupFlag ? "warmup" : "normal",
            }],
            warmupFlag ? "warmup" : "single"
        );
    }

    // No valid pairs found
    if (numberCount > 0) {
        return makeAiDecision("missing_reps");
    }

    return makeAiDecision("missing_reps");
}

// --- HTTP Handler ---

serve(async (req) => {
    // Handle CORS preflight
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
        console.error("[parse] Auth verification failed:", authError?.message);
        return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    console.log("[parse] User verified:", data.user.id);

    if (req.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    let payload: ParseRequest;
    try {
        payload = await req.json();
    } catch {
        return new Response(
            JSON.stringify({ error: "Invalid JSON" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const { message, lastExercise } = payload;
    if (message === undefined || message === null) {
        return new Response(
            JSON.stringify({ error: "message is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const result = decideAndParse(message, lastExercise);

    if (result.kind === "fast") {
        // Return in the format expected by the frontend
        return new Response(
            JSON.stringify({
                kind: "fast",
                rows: result.rows.map(row => ({
                    exercise: row.exercise,
                    weightLbs: row.weightLbs,
                    reps: row.reps,
                    notes: row.notes,
                })),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } else {
        return new Response(
            JSON.stringify({
                kind: "ai",
                reason: result.reason,
                userHint: result.userHint,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
