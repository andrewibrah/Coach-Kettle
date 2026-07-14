// Nutrition domain types. Mirrors DB schema in migration 0033.

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ColorGrade = 'green' | 'yellow' | 'red';

export interface FoodItem {
  id: string;
  user_id: string | null;
  is_global: boolean;
  catalog_key?: string | null;
  source?: string | null;
  name: string;
  brand: string | null;
  serving_size_g: number;
  serving_label: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  saturated_fat_g: number;
  sugar_g: number;
  sodium_mg: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface FoodLogEntry {
  id: string;
  user_id: string;
  food_id: string | null;
  log_date: string;       // 'YYYY-MM-DD'
  meal_slot: MealSlot;
  consumed_at: string;    // ISO timestamp
  food_name: string;
  servings: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  saturated_fat_g: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface NutritionTargets {
  id: string;
  user_id: string;
  training_calories: number;
  training_protein_g: number;
  training_carbs_g: number;
  training_fat_g: number;
  rest_calories: number;
  rest_protein_g: number;
  rest_carbs_g: number;
  rest_fat_g: number;
  fiber_g_min: number;
  saturated_fat_g_max: number;
  bmr: number | null;
  tdee: number | null;
  derivation_inputs: Record<string, unknown> | null;
  last_recalibrated_at: string;
  created_at: string;
  updated_at: string;
}

export interface DailyTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  saturated_fat_g: number;
  log_count: number;
}

export interface DailyNutritionSummary {
  id: string;
  user_id: string;
  summary_date: string;
  is_training_day: boolean;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  saturated_fat_g: number;
  calorie_target: number | null;
  protein_target: number | null;
  carb_target: number | null;
  fat_target: number | null;
  color_grade: ColorGrade | null;
  score: number | null;
  gap_summary: NutritionGapSummary | null;
  created_at: string;
  updated_at: string;
}

export interface NutritionGapSummary {
  calorie_gap: number;
  protein_gap_g: number;
  carb_gap_g: number;
  fat_gap_g: number;
  fiber_status: 'low' | 'ok' | 'high';
  saturated_fat_status: 'ok' | 'high';
  suggested_foods?: SuggestedFood[];
}

export interface SuggestedFood {
  name: string;
  amount: string;
  why: string;
  approx_calories?: number;
  approx_protein_g?: number;
}

export interface MealPlan {
  id: string;
  user_id: string;
  week_start_date: string;
  status: 'active' | 'archived' | 'generating' | 'failed';
  targets_snapshot: NutritionTargets;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannedMealItem {
  name: string;
  grams?: number;
  servings?: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface PlannedMeal {
  id: string;
  plan_id: string;
  user_id: string;
  day_of_week: number;     // 0=Sun..6=Sat
  is_training_day: boolean;
  meal_slot: MealSlot;
  title: string;
  description: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  items: PlannedMealItem[];
  sort_order: number;
  created_at: string;
}

export interface DayGoal {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// Keyed by day-of-week: 0=Sun, 1=Mon … 6=Sat
export type WeeklyGoals = Partial<Record<number, DayGoal>>;

export interface RecentFood {
  food_name: string;
  food_id: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  saturated_fat_g: number;
  servings: number;
  meal_slot: MealSlot;
}

export type NutritionAnalysisMode = 'text' | 'photo';

export interface NutritionAnalysisItem {
  food_type: string;
  estimated_weight_g: number;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  catalog_match: 'exact' | 'none';
  reason: string;
}

// The app does not return or persist raw text/photo input. Provider-side handling
// remains governed by the configured provider/account policy.
export type NutritionAnalysisRequest =
  | { action: 'analyze'; mode: 'text'; text: string }
  | { action: 'analyze'; mode: 'photo'; image_data_url: string };

export interface NutritionAnalysisResult {
  // Exact catalog matches do not create a transient analysis session.
  analysis_id: string | null;
  mode: NutritionAnalysisMode;
  items: NutritionAnalysisItem[];
}

export interface ConfirmNutritionAnalysisRequest {
  analysis_id: string;
  date: string;
  meal_slot: MealSlot;
  items: NutritionAnalysisItem[];
}

export interface ConfirmedNutritionLog {
  analysis_id: string;
  entries: FoodLogEntry[];
}
