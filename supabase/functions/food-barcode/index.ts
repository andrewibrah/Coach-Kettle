// Edge Function: food-barcode
//   GET ?barcode=<8-14 digits>  → { status: 'found' | 'incomplete' | 'not_found', ... }
//
// Resolves a scanned product barcode to loggable nutrition via Open Food Facts,
// backed by the shared public.barcode_foods cache.
//
// Deliberately NOT an action on food-log: an independent deploy target cannot
// regress the day / week / search / log paths, and this is the only function in
// the nutrition stack that makes an outbound third-party request.
//
// NOT gated by gateAiRequest — there is no model call here. Charging a barcode
// scan against the free tier's 5 AI messages/day would be a bug. The only limit
// is an abuse gate on cache MISSES.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";

import { mapOpenFoodFactsProduct, type BarcodeFood } from "../_shared/openFoodFacts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Open Food Facts asks integrators to identify themselves. */
const USER_AGENT = "CoachKettle/1.0 (iOS; nutrition barcode lookup; contact@coachkettle.com)";
const OFF_TIMEOUT_MS = 8_000;

/**
 * Cache freshness. Only a complete `found` row is held long — `not_found` and
 * `incomplete` both describe gaps a contributor is likely to fill upstream, so
 * they expire sooner and get another chance.
 */
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000;      // 30 days
const INCOMPLETE_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

/** Daily cap on upstream fetches per user. Cache hits are never counted. */
const DAILY_UPSTREAM_LOOKUP_LIMIT = 300;

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verify(req: Request): Promise<{ userId: string }> {
  const header = req.headers.get("Authorization");
  if (!header) throw new Error("no auth");
  const token = header.replace("Bearer ", "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("bad auth");
  return { userId: data.user.id };
}

// deno-lint-ignore no-explicit-any
type CacheRow = any;

function rowToResponse(row: CacheRow, source: "cache" | "openfoodfacts") {
  if (row.status === "not_found") {
    return { status: "not_found", barcode: row.barcode, source };
  }
  if (row.status === "incomplete") {
    return {
      status: "incomplete",
      barcode: row.barcode,
      name: row.name ?? null,
      brand: row.brand ?? null,
      source,
    };
  }
  return {
    status: "found",
    barcode: row.barcode,
    source,
    food: {
      barcode: row.barcode,
      name: row.name,
      brand: row.brand ?? null,
      serving_size_g: Number(row.serving_size_g),
      serving_label: row.serving_label ?? null,
      calories: Number(row.calories ?? 0),
      protein_g: Number(row.protein_g ?? 0),
      carbs_g: Number(row.carbs_g ?? 0),
      fat_g: Number(row.fat_g ?? 0),
      fiber_g: Number(row.fiber_g ?? 0),
      saturated_fat_g: Number(row.saturated_fat_g ?? 0),
      sugar_g: Number(row.sugar_g ?? 0),
      sodium_mg: Number(row.sodium_mg ?? 0),
      basis: row.basis ?? "100g",
    },
  };
}

function isFresh(row: CacheRow): boolean {
  const fetchedAt = Date.parse(row.fetched_at ?? "");
  if (!Number.isFinite(fetchedAt)) return false;
  const ttl = row.status === "found" ? FOUND_TTL_MS : INCOMPLETE_TTL_MS;
  return Date.now() - fetchedAt < ttl;
}

/**
 * Fetch one product from Open Food Facts.
 * Returns `null` on any transport/parse failure so the caller can fall back to
 * a stale cache row instead of failing the user's scan.
 */
async function fetchFromOpenFoodFacts(
  barcode: string,
): Promise<{ status: "found"; food: BarcodeFood } | { status: "incomplete"; name: string | null; brand: string | null } | { status: "not_found" } | null> {
  // `barcode` is already validated as ^\d{8,14}$ by the caller; encode anyway.
  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=code,product_name,product_name_en,generic_name,generic_name_en,brands,` +
    `serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriments`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });

    // A missing product is a 404 with a JSON body — a normal outcome, not an error.
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) {
      console.warn(`[food-barcode] upstream HTTP ${res.status} for ${barcode}`);
      return null;
    }

    const body = await res.json();
    // Invalid codes come back 200 with status 0.
    if (!body || body.status !== 1 || !body.product) return { status: "not_found" };

    return mapOpenFoodFactsProduct(barcode, body.product);
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    console.warn(`[food-barcode] upstream ${aborted ? "timeout" : "error"} for ${barcode}:`, e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonRes({ error: "Method not allowed" }, 405);

  let userId: string;
  try {
    ({ userId } = await verify(req));
  } catch {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  try {
    const raw = new URL(req.url).searchParams.get("barcode") ?? "";
    // Re-validate server-side before ANY interpolation. The client normalizes,
    // but the client is not a trust boundary.
    if (!/^\d{8,14}$/.test(raw)) {
      return jsonRes({ error: "A numeric barcode of 8-14 digits is required" }, 400);
    }
    const barcode = raw;

    // ---------- 1. Cache ----------
    const { data: cached, error: cacheError } = await admin
      .from("barcode_foods")
      .select("*")
      .eq("barcode", barcode)
      .maybeSingle();
    if (cacheError) {
      console.error("[food-barcode] cache read failed:", cacheError.message);
      // Fall through to a live fetch rather than failing the scan.
    }
    if (cached && isFresh(cached)) {
      return jsonRes(rowToResponse(cached, "cache"));
    }

    // ---------- 2. Abuse gate (misses only) ----------
    const { data: gate, error: gateError } = await admin.rpc(
      "check_and_increment_barcode_lookups",
      { p_user_id: userId, p_limit: DAILY_UPSTREAM_LOOKUP_LIMIT },
    );
    if (gateError) {
      console.error("[food-barcode] lookup gate failed (blocking):", gateError.message);
      return jsonRes(
        { error: "Barcode lookup is unavailable right now", code: "BARCODE_GATE_UNAVAILABLE" },
        503,
      );
    }
    const gateRow = Array.isArray(gate) ? gate[0] : gate;
    if (gateRow && gateRow.allowed === false) {
      // A stale cached answer still beats a hard failure.
      if (cached) return jsonRes(rowToResponse(cached, "cache"));
      return jsonRes(
        {
          error: "Too many barcode lookups today. Try again tomorrow or add the food manually.",
          code: "BARCODE_LIMIT_REACHED",
        },
        429,
      );
    }

    // ---------- 3. Upstream ----------
    const mapped = await fetchFromOpenFoodFacts(barcode);

    if (mapped === null) {
      // Upstream unreachable. Serve stale before failing.
      if (cached) return jsonRes(rowToResponse(cached, "cache"));
      return jsonRes(
        {
          error: "Could not reach the food database. Check your connection or add the food manually.",
          code: "BARCODE_UPSTREAM_UNAVAILABLE",
        },
        503,
      );
    }

    // ---------- 4. Cache the result ----------
    const row: Record<string, unknown> = {
      barcode,
      status: mapped.status,
      source: "openfoodfacts",
      fetched_at: new Date().toISOString(),
      name: null,
      brand: null,
      serving_size_g: null,
      serving_label: null,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      saturated_fat_g: null,
      sugar_g: null,
      sodium_mg: null,
      basis: null,
    };
    if (mapped.status === "found") {
      Object.assign(row, {
        name: mapped.food.name,
        brand: mapped.food.brand,
        serving_size_g: mapped.food.serving_size_g,
        serving_label: mapped.food.serving_label,
        calories: mapped.food.calories,
        protein_g: mapped.food.protein_g,
        carbs_g: mapped.food.carbs_g,
        fat_g: mapped.food.fat_g,
        fiber_g: mapped.food.fiber_g,
        saturated_fat_g: mapped.food.saturated_fat_g,
        sugar_g: mapped.food.sugar_g,
        sodium_mg: mapped.food.sodium_mg,
        basis: mapped.food.basis,
      });
    } else if (mapped.status === "incomplete") {
      Object.assign(row, { name: mapped.name, brand: mapped.brand });
    }

    const { error: upsertError } = await admin
      .from("barcode_foods")
      .upsert(row, { onConflict: "barcode" });
    if (upsertError) {
      // Caching is best-effort; the user still gets their answer.
      console.warn("[food-barcode] cache write failed:", upsertError.message);
    }

    return jsonRes(rowToResponse(row, "openfoodfacts"));
  } catch (e) {
    console.error("[food-barcode] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
