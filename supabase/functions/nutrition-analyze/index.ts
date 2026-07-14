// Authenticated transient nutrition analysis and atomic confirmation.
// This function never persists, returns, or logs raw text/photo input. Provider-side
// handling remains governed by the configured provider/account policy.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);
const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_PHOTO_BASE64_LENGTH = 8_388_608;
const MAX_REQUEST_CONTENT_LENGTH = Math.floor(8.5 * 1024 * 1024);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXACT_LOOKUP_TEXT = /^[A-Za-z]+(?:[ -][A-Za-z]+){0,4}$/;
const EXACT_LOOKUP_CONJUNCTION = /(?:^| )(?:and|with|plus|or)(?: |$)/i;

interface AnalysisItem {
  food_type: string;
  estimated_weight_g: number;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  catalog_match: "exact" | "none";
  reason: string;
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function clampModelNumber(value: unknown, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max) throw new Error("invalid model number");
  return Math.round(number * 100) / 100;
}

function sanitizeModelText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new Error(`invalid model ${field}`);
  const sanitized = value.trim().replace(/\s+/g, " ");
  if (!sanitized || sanitized.length > maxLength) throw new Error(`invalid model ${field}`);
  return sanitized;
}

function sanitizeModelItems(value: unknown): AnalysisItem[] {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 10) {
    throw new Error("invalid model result");
  }

  return value.items.map((candidate: unknown) => {
    if (!isRecord(candidate) || candidate.catalog_match !== "none") {
      throw new Error("invalid model item");
    }
    return {
      food_type: sanitizeModelText(candidate.food_type, "food type", 120),
      estimated_weight_g: clampModelNumber(candidate.estimated_weight_g, 0.1, 5_000),
      estimated_calories: clampModelNumber(candidate.estimated_calories, 0, 10_000),
      protein_g: clampModelNumber(candidate.protein_g, 0, 500),
      carbs_g: clampModelNumber(candidate.carbs_g, 0, 1_000),
      fat_g: clampModelNumber(candidate.fat_g, 0, 500),
      confidence: clampModelNumber(candidate.confidence, 0, 1),
      catalog_match: "none",
      reason: sanitizeModelText(candidate.reason, "reason", 160),
    };
  });
}

function isBoundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validateCatalogMatch(value: unknown): AnalysisItem | null {
  if (!isRecord(value) || value.catalog_match !== "exact") return null;
  const items = validateConfirmedItems([value]);
  return items?.[0]?.catalog_match === "exact" ? items[0] : null;
}

function validateConfirmedItems(value: unknown): AnalysisItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;

  const items: AnalysisItem[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.food_type !== "string") return null;
    const foodType = candidate.food_type.trim().replace(/\s+/g, " ");
    if (
      foodType.length < 1 || foodType.length > 120 ||
      !isBoundedNumber(candidate.estimated_weight_g, 0.1, 5_000) ||
      !isBoundedNumber(candidate.estimated_calories, 0, 10_000) ||
      !isBoundedNumber(candidate.protein_g, 0, 500) ||
      !isBoundedNumber(candidate.carbs_g, 0, 1_000) ||
      !isBoundedNumber(candidate.fat_g, 0, 500) ||
      !isBoundedNumber(candidate.confidence, 0, 1) ||
      (candidate.catalog_match !== "exact" && candidate.catalog_match !== "none") ||
      typeof candidate.reason !== "string"
    ) return null;
    const reason = candidate.reason.trim().replace(/\s+/g, " ");
    if (reason.length < 1 || reason.length > 160) return null;

    items.push({
      food_type: foodType,
      estimated_weight_g: Math.round(candidate.estimated_weight_g * 100) / 100,
      estimated_calories: Math.round(candidate.estimated_calories * 100) / 100,
      protein_g: Math.round(candidate.protein_g * 100) / 100,
      carbs_g: Math.round(candidate.carbs_g * 100) / 100,
      fat_g: Math.round(candidate.fat_g * 100) / 100,
      confidence: Math.round(candidate.confidence * 100) / 100,
      catalog_match: candidate.catalog_match,
      reason,
    });
  }
  return items;
}

async function verifyUser(req: Request): Promise<string> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("unauthorized");
  const { data, error } = await admin.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new Error("unauthorized");
  return data.user.id;
}

async function cleanupExpiredSessions(): Promise<void> {
  const { error } = await admin.rpc("cleanup_expired_nutrition_analysis_sessions");
  if (error) throw new Error("session cleanup failed");
}

function normalizeExactLookupText(input: string): string | null {
  const normalized = input.trim().replace(/\s+/g, " ");
  return normalized.length <= 120 && EXACT_LOOKUP_TEXT.test(normalized) &&
      !EXACT_LOOKUP_CONJUNCTION.test(normalized)
    ? normalized
    : null;
}

function hasMatchingImageMagic(mime: string, base64: string): boolean {
  try {
    const prefix = Uint8Array.from(atob(base64.slice(0, 24)), (character) => character.charCodeAt(0));
    if (mime === "jpeg") return prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
    if (mime === "png") {
      const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      return prefix.length >= png.length && png.every((byte, index) => prefix[index] === byte);
    }
    return mime === "webp" && prefix.length >= 12 &&
      prefix[0] === 0x52 && prefix[1] === 0x49 && prefix[2] === 0x46 && prefix[3] === 0x46 &&
      prefix[8] === 0x57 && prefix[9] === 0x45 && prefix[10] === 0x42 && prefix[11] === 0x50;
  } catch {
    return false;
  }
}

async function requestAnalysis(
  mode: "text" | "photo",
  input: string,
): Promise<AnalysisItem[]> {
  if (!openaiApiKey) throw new Error("openai unavailable");

  const userContent = mode === "text"
    ? `Analyze this meal description and estimate each food item:\n${input}`
    : [
      { type: "text", text: "Identify each food in this meal photo and estimate its nutrition." },
      { type: "image_url", image_url: { url: input, detail: "low" } },
    ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1_200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "nutrition_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                minItems: 1,
                maxItems: 10,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "food_type", "estimated_weight_g", "estimated_calories",
                    "protein_g", "carbs_g", "fat_g", "confidence",
                    "catalog_match", "reason",
                  ],
                  properties: {
                    food_type: { type: "string", minLength: 1, maxLength: 120 },
                    estimated_weight_g: { type: "number", minimum: 0.1, maximum: 5_000 },
                    estimated_calories: { type: "number", minimum: 0, maximum: 10_000 },
                    protein_g: { type: "number", minimum: 0, maximum: 500 },
                    carbs_g: { type: "number", minimum: 0, maximum: 1_000 },
                    fat_g: { type: "number", minimum: 0, maximum: 500 },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    catalog_match: { type: "string", enum: ["none"] },
                    reason: { type: "string", minLength: 1, maxLength: 160 },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        {
          role: "system",
          content: "Return strict JSON only. Produce 1-10 distinct food items with numerical estimated serving weight, calories, protein, carbs, fat, and confidence. Set catalog_match to none. Give a short nutrition-estimate reason without echoing source text or image data.",
        },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) throw new Error("openai unavailable");
  const payload = await response.json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("invalid model result");
  return sanitizeModelItems(JSON.parse(content));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const contentLength = req.headers.get("Content-Length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      return jsonResponse({ error: "Invalid Content-Length" }, 400);
    }
    if (parsedLength > MAX_REQUEST_CONTENT_LENGTH) {
      return jsonResponse({ error: "Request body too large" }, 413);
    }
  }

  let userId: string;
  try {
    userId = await verifyUser(req);
  } catch {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body: unknown = await req.json().catch(() => null);
  if (!isRecord(body)) return jsonResponse({ error: "Invalid JSON body" }, 400);

  if (body.action === "analyze") {
    const hasText = Object.prototype.hasOwnProperty.call(body, "text");
    const hasImage = Object.prototype.hasOwnProperty.call(body, "image_data_url");
    let mode: "text" | "photo";
    let transientInput: string;

    if (body.mode === "text" && hasText && !hasImage && typeof body.text === "string") {
      transientInput = body.text.trim();
      if (!transientInput) return jsonResponse({ error: "text is required" }, 400);
      if (transientInput.length > 1_000) return jsonResponse({ error: "text exceeds 1000 characters" }, 413);
      mode = "text";
    } else if (
      body.mode === "photo" && hasImage && !hasText && typeof body.image_data_url === "string"
    ) {
      const match = PHOTO_DATA_URL.exec(body.image_data_url);
      if (!match || match[2].length % 4 !== 0 || !hasMatchingImageMagic(match[1], match[2])) {
        return jsonResponse({ error: "unsupported or invalid image data URL" }, 400);
      }
      if (match[2].length > MAX_PHOTO_BASE64_LENGTH) {
        return jsonResponse({ error: "image exceeds 6 MB" }, 413);
      }
      mode = "photo";
      transientInput = body.image_data_url;
    } else {
      return jsonResponse({ error: "exactly one matching text or photo input is required" }, 400);
    }

    try {
      await cleanupExpiredSessions();

      if (mode === "text") {
        const exactLookupText = normalizeExactLookupText(transientInput);
        if (exactLookupText) {
          const { data: exactData, error: exactError } = await admin.rpc("lookup_global_food_exact", {
            p_name: exactLookupText,
          });
          if (exactError) throw new Error("catalog lookup failed");
          const exactItem = validateCatalogMatch(exactData);
          if (exactData !== null && !exactItem) throw new Error("invalid catalog result");
          if (exactItem) return jsonResponse({ analysis_id: null, mode, items: [exactItem] });
        }
      }

      if (!openaiApiKey) return jsonResponse({ error: "Nutrition analysis is unavailable" }, 503);
      const { data: rateAllowed, error: rateError } = await admin.rpc("consume_nutrition_analysis_rate_limit", {
        p_user_id: userId,
      });
      if (rateError) return jsonResponse({ error: "Nutrition analysis is unavailable" }, 503);
      if (rateAllowed !== true) {
        return jsonResponse({ error: "Nutrition analysis rate limit exceeded" }, 429, { "Retry-After": "3600" });
      }

      const items = await requestAnalysis(mode, transientInput);
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const { data, error } = await admin
        .from("food_analysis_sessions")
        .insert({ user_id: userId, mode, items, expires_at: expiresAt })
        .select("id")
        .single();
      if (error || !data) throw new Error("session write failed");

      return jsonResponse({ analysis_id: data.id, mode, items });
    } catch {
      return jsonResponse({ error: "Nutrition analysis failed" }, 502);
    }
  }

  if (body.action === "confirm") {
    const analysisId = typeof body.analysis_id === "string" ? body.analysis_id : "";
    const date = typeof body.date === "string" ? body.date : "";
    const mealSlot = typeof body.meal_slot === "string" ? body.meal_slot : "";
    const items = validateConfirmedItems(body.items);
    if (!UUID.test(analysisId) || !isIsoDate(date) || !MEAL_SLOTS.has(mealSlot) || !items) {
      return jsonResponse({ error: "Invalid confirmation" }, 400);
    }

    try {
      await cleanupExpiredSessions();
    } catch {
      return jsonResponse({ error: "Confirmation unavailable" }, 503);
    }

    const { data: session, error: sessionError } = await admin
      .from("food_analysis_sessions")
      .select("id,user_id,expires_at")
      .eq("id", analysisId)
      .maybeSingle();
    if (sessionError) return jsonResponse({ error: "Confirmation failed" }, 500);
    if (!session || session.user_id !== userId) return jsonResponse({ error: "Analysis not found" }, 404);
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "Analysis expired" }, 410);
    }

    const { data, error } = await admin.rpc("confirm_nutrition_analysis", {
      p_user_id: userId,
      p_analysis_id: analysisId,
      p_date: date,
      p_meal_slot: mealSlot,
      p_items: items,
    });
    if (error || !data) return jsonResponse({ error: "Confirmation failed" }, 409);
    return jsonResponse(data);
  }

  return jsonResponse({ error: "Unknown action" }, 400);
});
