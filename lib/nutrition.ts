// Client-side API for the nutrition system. Wraps Edge Functions food-log,
// nutrition-targets, and meal-plan. All calls go through fetchWithAuth so JWT
// refresh + 401 retry behave consistently with the rest of the app.

import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import { parseFeatureGateError } from './entitlements';
import type {
  FoodItem,
  FoodLogEntry,
  DailyTotals,
  NutritionTargets,
  MealPlan,
  PlannedMeal,
  MealSlot,
  RecentFood,
  NutritionAnalysisResult,
  ConfirmNutritionAnalysisRequest,
  ConfirmedNutritionLog,
  NutritionAnalysisItem,
  BarcodeLookupResult,
} from '@/types/nutrition';
import type {
  NutritionTargetsGetResponse,
  NutritionTargetSaveRequest,
  NutritionTargetSaveResponse,
  NutritionTargetSuggestRequest,
  NutritionTargetSuggestResponse,
} from '@/types/nutritionTargets';

const API = `${supabaseUrl}/functions/v1`;

// expo/fetch (the global fetch since SDK 56) rejects with its FetchError, a
// plain Error "fetch failed: <native reason>", instead of RN's TypeError. Like
// RN's "Network request failed", every other native start failure counts as
// transport. Only the (English) reason text tells a timeout apart; no error
// code reaches JS.
const EXPO_FETCH_FAILURE = /^fetch failed: /;
const EXPO_FETCH_CANCELED = /^fetch failed: (Fetch request has been canceled|The operation was aborted\.)/;
const EXPO_FETCH_TIMED_OUT = /^fetch failed: .*(timed out|timeout)/i;

/** Queue only recognizable fetch transport failures, not HTTP rejection or bugs. */
export function isRetryableNutritionError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return /network request failed|failed to fetch|fetch failed|load failed/i.test(error.message);
  }
  return error instanceof Error && EXPO_FETCH_FAILURE.test(error.message)
    && !EXPO_FETCH_CANCELED.test(error.message) && !EXPO_FETCH_TIMED_OUT.test(error.message);
}

/**
 * The three classes a text/photo nutrition-analysis failure can honestly be
 * put into, so "couldn't analyze" doesn't conflate them:
 * - `unavailable`: the provider is down (OpenAI non-2xx/timeout -> the
 *   function's 502/503), or the request never got a response (offline,
 *   fetch timeout, abort).
 * - `unreadable`: the input or the model's own output didn't validate (the
 *   function's 400/413/422).
 * - `not_deployed`: the platform's 404 for a function that isn't deployed
 *   (a body that isn't the function's own `{"error": ...}` shape).
 * - `other`: anything else (e.g. 401), left to existing generic handling.
 */
export type NutritionAnalysisErrorClass = 'unavailable' | 'unreadable' | 'not_deployed' | 'other';

const HTTP_STATUS = /^HTTP (\d+):/;

// No response at all: offline/fetch failure, RN's fetch timeout TypeError, or
// an abort. Broader than isRetryableNutritionError, which also gates the
// offline save queue and is deliberately left as is.
function isNoResponseError(error: unknown): boolean {
  if (isRetryableNutritionError(error)) return true;
  if (error instanceof TypeError && /network request timed out/i.test(error.message)) return true;
  if (error instanceof Error && (EXPO_FETCH_CANCELED.test(error.message) || EXPO_FETCH_TIMED_OUT.test(error.message))) return true;
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

// Every nutrition-analyze error body is `{"error": "<string>"}`; the platform's
// not-found for an undeployed function is not.
function hasFunctionErrorBody(message: string): boolean {
  try {
    const body: unknown = JSON.parse(message.replace(HTTP_STATUS, ''));
    return typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string';
  } catch {
    return false;
  }
}

export function classifyNutritionAnalysisError(error: unknown): NutritionAnalysisErrorClass {
  if (isNoResponseError(error)) return 'unavailable';
  if (error instanceof Error) {
    const match = HTTP_STATUS.exec(error.message);
    if (match) {
      const status = Number(match[1]);
      if (status === 404) return hasFunctionErrorBody(error.message) ? 'other' : 'not_deployed';
      if (status === 502 || status === 503) return 'unavailable';
      if (status === 400 || status === 413 || status === 422) return 'unreadable';
    }
  }
  return 'other';
}

export function nutritionAnalysisErrorMessage(error: unknown, mode: 'text' | 'photo'): string {
  switch (classifyNutritionAnalysisError(error)) {
    case 'unavailable':
      return 'Nutrition analysis is temporarily unavailable. Check your connection and try again.';
    case 'unreadable':
      return "We couldn't read that — try a clearer photo or more detail.";
    case 'not_deployed':
      return "This feature isn't available yet. Please update the app or try later.";
    default:
      return mode === 'photo'
        ? 'Could not analyze that photo. Please try again.'
        : 'Could not analyze that description. Please try again.';
  }
}

/**
 * The confirm step (`confirmNutritionAnalysis()` for the analysis-ID branch,
 * `logFood()` for the catalog-exact branch) has its own failure shape,
 * distinct from analyze's:
 * - `expired`: the analysis session is gone by confirm time — expired,
 *   already confirmed (the session row is deleted on success, so a retry
 *   reads as "not found"), or genuinely never existed. The function can't
 *   tell these apart from each other, but it does mark them with the same
 *   "Analysis not found" body, which this distinguishes from a platform
 *   404 (missing deployment) that never contains that text.
 * - `conflict`: the RPC (`confirm_nutrition_analysis`) rejected the request
 *   for a reason other than not-found/expired/invalid-shape — most likely a
 *   race with another confirm of the same session.
 * - `invalid`: the function's own 400 (shape it rejects up front).
 * - `unavailable`: infra trouble (500/502/503) or no response at all
 *   (offline, fetch timeout, abort) — not the user's fault.
 * - `not_deployed`: the platform's 404 for an undeployed function (a body
 *   that isn't the function's own `{"error": ...}` shape).
 * - `other`: anything else (e.g. 401), left to existing generic handling.
 */
export type NutritionConfirmErrorClass = 'expired' | 'conflict' | 'invalid' | 'unavailable' | 'not_deployed' | 'other';

const CONFIRM_NOT_FOUND_MARKER = 'Analysis not found';

export function classifyNutritionConfirmError(error: unknown): NutritionConfirmErrorClass {
  if (isNoResponseError(error)) return 'unavailable';
  if (error instanceof Error) {
    const match = HTTP_STATUS.exec(error.message);
    if (match) {
      const status = Number(match[1]);
      if (status === 404) {
        if (!hasFunctionErrorBody(error.message)) return 'not_deployed';
        return error.message.includes(CONFIRM_NOT_FOUND_MARKER) ? 'expired' : 'other';
      }
      if (status === 410) return 'expired';
      if (status === 409) return 'conflict';
      if (status === 400) return 'invalid';
      if (status === 500 || status === 502 || status === 503) return 'unavailable';
    }
  }
  return 'other';
}

export function nutritionConfirmErrorMessage(error: unknown): string {
  switch (classifyNutritionConfirmError(error)) {
    case 'expired':
      return 'This analysis expired. Please analyze again.';
    case 'conflict':
      return "Could not confirm this log — check today's log before retrying, it may already be saved.";
    case 'invalid':
      return 'Check every food name, weight, calorie, and macro value.';
    case 'unavailable':
      return 'Could not save. Check your connection and try again.';
    case 'not_deployed':
      return "This feature isn't available yet. Please update the app or try later.";
    default:
      return 'Could not add this food log. The analysis may have expired; please try again.';
  }
}

async function get<T>(url: string): Promise<T> {
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    const gateError = parseFeatureGateError(res.status, text);
    if (gateError) throw gateError;
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

// ---------- Food log ----------
export async function fetchFoodLogDay(date: string): Promise<{ entries: FoodLogEntry[]; totals: DailyTotals | null }> {
  return get(`${API}/food-log?action=day&date=${encodeURIComponent(date)}`);
}

export async function fetchFoodLogWeek(endDate: string): Promise<{ entries: FoodLogEntry[]; start_date: string; end_date: string }> {
  return get(`${API}/food-log?action=week&end_date=${encodeURIComponent(endDate)}`);
}

export async function searchFoods(q: string): Promise<{ foods: FoodItem[] }> {
  if (q.trim().length < 2) return { foods: [] };
  return get(`${API}/food-log?action=search_foods&q=${encodeURIComponent(q)}`);
}

export interface LogFoodInput {
  date: string;
  meal_slot: MealSlot;
  food_id?: string | null;
  food_name: string;
  servings?: number;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  saturated_fat_g?: number;
  notes?: string;
}

export async function logFood(input: LogFoodInput): Promise<{ entry: FoodLogEntry }> {
  return post(`${API}/food-log`, { action: 'log', ...input });
}

export async function deleteFoodLog(id: string): Promise<{ ok: boolean }> {
  return post(`${API}/food-log`, { action: 'delete', id });
}

export async function updateFoodLog(id: string, patch: Partial<FoodLogEntry>): Promise<{ entry: FoodLogEntry }> {
  return post(`${API}/food-log`, { action: 'update', id, ...patch });
}

export interface CreateFoodInput {
  name: string;
  brand?: string;
  serving_size_g: number;
  serving_label?: string;
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  saturated_fat_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  tags?: string[];
}

export async function createFood(input: CreateFoodInput): Promise<{ food: FoodItem }> {
  return post(`${API}/food-log`, { action: 'create_food', ...input });
}

// ---------- Nutrition targets (legacy training/rest row) ----------
export async function fetchNutritionTargets(): Promise<{ targets: NutritionTargets | null }> {
  return get(`${API}/nutrition-targets`);
}

// ---------- Hybrid nutrition target sets (provenance-tracked) ----------
export async function fetchNutritionTargetSet(): Promise<NutritionTargetsGetResponse> {
  return get(`${API}/nutrition-targets?action=get_set`);
}

export async function suggestNutritionTargets(
  req: NutritionTargetSuggestRequest,
): Promise<NutritionTargetSuggestResponse> {
  return post(`${API}/nutrition-targets`, { action: 'suggest', ...req });
}

export async function saveNutritionTargetSet(
  req: NutritionTargetSaveRequest,
): Promise<NutritionTargetSaveResponse> {
  return post(`${API}/nutrition-targets`, { action: 'save_set', ...req });
}

// ---------- Meal plan ----------
export async function fetchMealPlan(): Promise<{ plan: MealPlan | null; meals: PlannedMeal[] }> {
  return get(`${API}/meal-plan`);
}

export async function generateMealPlan(): Promise<{ plan: MealPlan; meals_inserted: number }> {
  return post(`${API}/meal-plan`, { action: 'generate' });
}

export async function recalibrateMealPlan(): Promise<{ plan: MealPlan; meals_inserted: number }> {
  return post(`${API}/meal-plan`, { action: 'recalibrate' });
}

export async function fetchRecentFoods(): Promise<{ foods: RecentFood[] }> {
  return get(`${API}/food-log?action=recent`);
}

// ---------- Barcode lookup ----------

/**
 * Resolve a scanned barcode to a loggable food.
 *
 * `barcode` must already be normalized by `normalizeBarcode()`; this re-checks
 * the shape because the value reaches a URL. `signal` lets the caller cancel an
 * in-flight lookup on unmount.
 *
 * Not-found and incomplete are ordinary results, not thrown errors — roughly
 * half of scanned retail barcodes are absent from the upstream database, so the
 * caller must route those to manual entry rather than showing a failure.
 */
export type BarcodeErrorCode =
  | 'BARCODE_LIMIT_REACHED'
  | 'BARCODE_UPSTREAM_UNAVAILABLE'
  | 'BARCODE_GATE_UNAVAILABLE';

/**
 * A lookup failure the server explained. Distinguished from a transport error
 * so the UI never tells a rate-limited user to "check your connection" — the
 * daily gate is increment-first, so every pointless retry pushes them further
 * past the cap.
 */
export class BarcodeLookupError extends Error {
  readonly code: BarcodeErrorCode | null;
  readonly status: number;
  constructor(message: string, code: BarcodeErrorCode | null, status: number) {
    super(message);
    this.name = 'BarcodeLookupError';
    this.code = code;
    this.status = status;
  }
}

const BARCODE_ERROR_CODES: BarcodeErrorCode[] = [
  'BARCODE_LIMIT_REACHED',
  'BARCODE_UPSTREAM_UNAVAILABLE',
  'BARCODE_GATE_UNAVAILABLE',
];

export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<BarcodeLookupResult> {
  if (!/^\d{8,14}$/.test(barcode)) throw new Error('A valid barcode is required');
  const res = await fetchWithAuth(`${API}/food-barcode?barcode=${encodeURIComponent(barcode)}`, {
    method: 'GET',
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    let code: BarcodeErrorCode | null = null;
    let message = '';
    try {
      const body = JSON.parse(text) as { code?: string; error?: string };
      if (typeof body.code === 'string' && (BARCODE_ERROR_CODES as string[]).includes(body.code)) {
        code = body.code as BarcodeErrorCode;
      }
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // Non-JSON body (gateway error page) — fall through to a generic message.
    }
    throw new BarcodeLookupError(message || `HTTP ${res.status}`, code, res.status);
  }
  return (await res.json()) as BarcodeLookupResult;
}

// ---------- Transient text/photo nutrition analysis ----------
const NUTRITION_ANALYZE_URL = `${API}/nutrition-analyze`;
const SUPPORTED_PHOTO_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_PHOTO_BASE64_LENGTH = 8_388_608;
const ANALYSIS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isNutritionAnalysisItem(value: unknown): value is NutritionAnalysisItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  const boundedNumber = (key: string, min: number, max: number) =>
    typeof item[key] === 'number' && Number.isFinite(item[key]) && (item[key] as number) >= min && (item[key] as number) <= max;
  return (
    typeof item.food_type === 'string' && item.food_type.trim().length >= 1 && item.food_type.length <= 120 &&
    boundedNumber('estimated_weight_g', 0.1, 5_000) &&
    boundedNumber('estimated_calories', 0, 10_000) &&
    boundedNumber('protein_g', 0, 500) &&
    boundedNumber('carbs_g', 0, 1_000) &&
    boundedNumber('fat_g', 0, 500) &&
    boundedNumber('confidence', 0, 1) &&
    (item.catalog_match === 'exact' || item.catalog_match === 'none') &&
    typeof item.reason === 'string' && item.reason.trim().length >= 1 && item.reason.length <= 160
  );
}

function validateNutritionAnalysisResult(value: unknown): NutritionAnalysisResult {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid nutrition analysis response');
  const result = value as Record<string, unknown>;
  if (
    (result.mode !== 'text' && result.mode !== 'photo') ||
    !Array.isArray(result.items) ||
    result.items.length < 1 ||
    result.items.length > 10 ||
    !result.items.every(isNutritionAnalysisItem)
  ) {
    throw new Error('Invalid nutrition analysis response');
  }
  const validAnalysisId = result.analysis_id === null
    ? result.mode === 'text' && result.items.length === 1 && result.items[0].catalog_match === 'exact'
    : typeof result.analysis_id === 'string' && ANALYSIS_ID.test(result.analysis_id) &&
      result.items.every((item) => item.catalog_match === 'none');
  if (!validAnalysisId) throw new Error('Invalid nutrition analysis response');
  return result as unknown as NutritionAnalysisResult;
}

export async function analyzeNutritionText(text: string): Promise<NutritionAnalysisResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nutrition text is required');
  if (trimmed.length > 1_000) throw new Error('Nutrition text must be 1000 characters or fewer');

  // The app does not include raw text in results or application persistence.
  return validateNutritionAnalysisResult(
    await post<unknown>(NUTRITION_ANALYZE_URL, { action: 'analyze', mode: 'text', text: trimmed }),
  );
}

export async function analyzeNutritionPhoto(dataUrl: string): Promise<NutritionAnalysisResult> {
  const comma = dataUrl.indexOf(',');
  const base64Length = comma >= 0 ? dataUrl.length - comma - 1 : 0;
  if (
    !SUPPORTED_PHOTO_DATA_URL.test(dataUrl) ||
    base64Length % 4 !== 0 ||
    base64Length > MAX_PHOTO_BASE64_LENGTH
  ) {
    throw new Error('A valid JPEG, PNG, or WebP data URL up to 6 MB is required');
  }

  // The app does not include photo bytes in results or application persistence.
  return validateNutritionAnalysisResult(
    await post<unknown>(NUTRITION_ANALYZE_URL, { action: 'analyze', mode: 'photo', image_data_url: dataUrl }),
  );
}

export async function confirmNutritionAnalysis(
  input: ConfirmNutritionAnalysisRequest,
): Promise<ConfirmedNutritionLog> {
  const parsedDate = ISO_DATE.test(input.date) ? new Date(`${input.date}T00:00:00Z`) : null;
  if (!ANALYSIS_ID.test(input.analysis_id)) throw new Error('A valid analysis ID is required');
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.date) {
    throw new Error('A valid nutrition log date is required');
  }
  if (input.items.length < 1 || input.items.length > 10 || !input.items.every(isNutritionAnalysisItem)) {
    throw new Error('Valid nutrition analysis items are required');
  }
  return post(NUTRITION_ANALYZE_URL, { action: 'confirm', ...input });
}
