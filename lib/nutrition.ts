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
} from '@/types/nutrition';
import type {
  NutritionTargetsGetResponse,
  NutritionTargetSaveRequest,
  NutritionTargetSaveResponse,
  NutritionTargetSuggestRequest,
  NutritionTargetSuggestResponse,
} from '@/types/nutritionTargets';

const API = `${supabaseUrl}/functions/v1`;

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
