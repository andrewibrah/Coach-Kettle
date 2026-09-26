// Edge Function: exercise-library
// Read-only catalog endpoints for the canonical exercises table.
//   GET ?action=list&offset=0&limit=200       → paginated list + total count
//   GET ?action=search&q=bench                → name/alias search
//   GET ?action=get&slug=barbell-bench-press  → single
//   GET ?action=by_body_part&body_part=Push   → filter by body part
//
// "list", "search", and "by_body_part" all return the SAME trimmed column
// projection (LIST_COLUMNS) — the client caches whichever one populates its
// list, so a mismatched projection there silently produces cards with
// missing fields depending on which action happened to run last (#11).
// "get" alone returns select("*") — the detail page needs every column.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function verifyAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Shared trimmed projection for list/search/by_body_part (see header note).
const LIST_COLUMNS = "id, slug, name, category, body_part, equipment, cues, difficulty";

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await verifyAuth(req);
  } catch {
    return jsonRes({ error: "Unauthorized" }, 401);
  }

  if (req.method !== "GET") return jsonRes({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "list";

  try {
    if (action === "list") {
      // Back-compat: a 1.0.1 client never sends offset/limit and expects the
      // pre-pagination full-list shape (no total/has_more). Only paginate
      // when the caller opts in by passing a param (the 1.0.2 client always
      // does). PostgREST's max_rows ceiling (1000) still applies here, same
      // as pre-pagination behavior.
      if (!url.searchParams.has("offset") && !url.searchParams.has("limit")) {
        const { data, error } = await supabaseAdmin
          .from("exercises")
          .select(LIST_COLUMNS)
          .order("body_part", { ascending: true })
          .order("name", { ascending: true });
        if (error) throw error;
        return jsonRes({ exercises: data });
      }

      // Paginated: PostgREST enforces a max-rows ceiling (this project's
      // config sets max_rows = 1000) which silently truncates an unranged
      // select — with 1,324 seeded rows that ceiling is below the dataset
      // size, so range() is mandatory here, not precautionary (#11).
      const offsetParam = Number(url.searchParams.get("offset") ?? 0);
      const limitParam = Number(url.searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
      const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? Math.floor(offsetParam) : 0;
      const limit = Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(Math.floor(limitParam), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

      const { data, error, count } = await supabaseAdmin
        .from("exercises")
        .select(LIST_COLUMNS, { count: "exact" })
        .order("body_part", { ascending: true })
        .order("name", { ascending: true })
        // (body_part, name) is not unique — several rows share both (the
        // seed dataset has duplicate names within a body part). Without a
        // unique tiebreaker, range() pagination over a non-unique sort can
        // duplicate or drop a row when a tied pair straddles a page
        // boundary.
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      const total = count ?? data?.length ?? 0;
      return jsonRes({
        exercises: data,
        total,
        offset,
        limit,
        has_more: offset + (data?.length ?? 0) < total,
      });
    }

    if (action === "get") {
      const slug = url.searchParams.get("slug");
      if (!slug) return jsonRes({ error: "slug required" }, 400);
      const { data, error } = await supabaseAdmin
        .from("exercises")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return jsonRes({ error: "not found" }, 404);
      return jsonRes({ exercise: data });
    }

    if (action === "search") {
      const q = (url.searchParams.get("q") ?? "").trim();
      if (!q) return jsonRes({ exercises: [] });
      const safe = q.replace(/[%_\\]/g, (m) => `\\${m}`);
      const { data, error } = await supabaseAdmin
        .from("exercises")
        .select(LIST_COLUMNS)
        .ilike("name", `%${safe}%`)
        .limit(50);
      if (error) throw error;
      return jsonRes({ exercises: data });
    }

    if (action === "by_body_part") {
      const bp = url.searchParams.get("body_part");
      if (!bp) return jsonRes({ error: "body_part required" }, 400);
      const { data, error } = await supabaseAdmin
        .from("exercises")
        .select(LIST_COLUMNS)
        .eq("body_part", bp)
        .order("name", { ascending: true });
      if (error) throw error;
      return jsonRes({ exercises: data });
    }

    return jsonRes({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[exercise-library] error:", e);
    return jsonRes({ error: "Internal server error" }, 500);
  }
});
