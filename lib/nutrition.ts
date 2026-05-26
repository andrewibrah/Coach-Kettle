// Client-side API for the nutrition system. Wraps Edge Functions food-log,
// nutrition-targets, and meal-plan. All calls go through fetchWithAuth so JWT
// refresh + 401 retry behave consistently with the rest of the app.

import { supabaseUrl } from './supabase';
import { fetchWithAuth } from './auth';
import type {
  FoodItem,
  FoodLogEntry,
  DailyTotals,
  NutritionTargets,
  MealPlan,
  PlannedMeal,
  MealSlot,
} from '@/types/nutrition';

const API = `${supabaseUrl}/functions/v1`;

async function get<T>(url: string): Promise<T> {
  const res = await fetchWithAuth(url, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetchWithAuth(url, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
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

// ---------- Nutrition targets ----------
export async function fetchNutritionTargets(): Promise<{ targets: NutritionTargets | null }> {
  return get(`${API}/nutrition-targets`);
}

export async function deriveNutritionTargets(): Promise<{ targets: NutritionTargets; derived: Record<string, unknown> }> {
  return post(`${API}/nutrition-targets`, { action: 'derive' });
}

export async function overrideNutritionTargets(patch: Partial<NutritionTargets>): Promise<{ targets: NutritionTargets }> {
  return post(`${API}/nutrition-targets`, { action: 'override', ...patch });
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
