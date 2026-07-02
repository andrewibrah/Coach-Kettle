// Hybrid nutrition target provenance model.
//
// Coach Kettle resolves "today's target" from several layers, each carrying an
// explicit source so the dashboard can always explain where a number came from.
//
// Naming note: the simple per-day macro shape is called `NutritionMacroTarget`
// here (not `NutritionTargets`) to avoid colliding with the existing
// `NutritionTargets` DB-row interface in `types/nutrition.ts`, which models the
// legacy training/rest-split nutrition_targets table and is used app-wide.

export type NutritionTargetSource =
  | 'manual'
  | 'backend_suggested'
  | 'local_draft'
  | 'imported_existing';

// A single day's calorie + macro goal. Calories required; macros optional so a
// user can enter "calories only" and let macros auto-fill later.
export interface NutritionMacroTarget {
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

export interface NutritionTargetStatus {
  source: NutritionTargetSource;
  user_entered: boolean;
  auto_suggested: boolean;
  stale: boolean;
  fallback: boolean;
  updated_at: string;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface NutritionDayOverride {
  day_of_week: DayOfWeek;
  target: NutritionMacroTarget;
  source: NutritionTargetSource;
  updated_at: string;
}

// Coarse, purpose-bound metadata only. Never stores DOB or raw sensitive values
// unless explicitly approved; height/weight are recorded as presence booleans.
export interface NutritionDerivationInputsSnapshot {
  age_range?: string;
  sex?: string;
  height_cm_present?: boolean;
  weight_kg_present?: boolean;
  activity_level?: string;
  goal_type?: string;
  training_days_per_week?: number;
  user_entered_calorie_target?: number;
  macro_preference?: string;
}

export interface NutritionTargetExplanation {
  summary: string;
  assumptions: string[];
  missing_inputs: string[];
  calculation_basis: string;
  safety_notes?: string[];
}

export interface SavedNutritionTargetSet {
  id: string;
  user_id: string;
  source: NutritionTargetSource;
  base_target?: NutritionMacroTarget;
  training_day_target?: NutritionMacroTarget;
  rest_day_target?: NutritionMacroTarget;
  day_overrides?: NutritionDayOverride[];
  macro_preference?: string;
  explanation?: NutritionTargetExplanation;
  derivation_inputs_snapshot?: NutritionDerivationInputsSnapshot;
  stale_after?: string | null;
  created_at: string;
  updated_at: string;
}

// Unconfirmed local edit. Lives in AsyncStorage draft slot only, never durable.
export interface DraftNutritionTargetSet {
  source: 'local_draft';
  base_target?: NutritionMacroTarget;
  training_day_target?: NutritionMacroTarget;
  rest_day_target?: NutritionMacroTarget;
  day_overrides?: NutritionDayOverride[];
  macro_preference?: string;
  updated_at: string;
}

// Dashboard-ready resolved target for a specific date.
export interface ResolvedNutritionTarget {
  target: NutritionMacroTarget | null;
  source: NutritionTargetSource | null;
  stale: boolean;
  fallback: boolean;
  explanation: string;
}

// ---------- Backend API contract ----------

export type NutritionAgeRange =
  | 'under_18'
  | '18_24'
  | '25_34'
  | '35_44'
  | '45_54'
  | '55_64'
  | '65_plus';

export type NutritionSex = 'male' | 'female' | 'other' | 'prefer_not_to_say';

export type NutritionActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type NutritionGoalType =
  | 'fat_loss'
  | 'maintenance'
  | 'muscle_gain'
  | 'performance'
  | 'general_health';

export type MacroPreference =
  | 'balanced'
  | 'high_protein'
  | 'lower_carb'
  | 'higher_carb'
  | 'custom';

export interface NutritionTargetSuggestRequest {
  age_range?: NutritionAgeRange;
  sex?: NutritionSex;
  height_cm?: number;
  weight_kg?: number;
  activity_level?: NutritionActivityLevel;
  goal_type?: NutritionGoalType;
  training_days_per_week?: number;
  user_entered_calorie_target?: number;
  macro_preference?: MacroPreference;
  units?: { height?: 'cm' | 'ft_in'; weight?: 'kg' | 'lb' };
}

export interface NutritionTargetSuggestResponse {
  suggestion_id: string;
  source: 'backend_suggested';
  stale: false;
  fallback: boolean;
  confidence: 'low' | 'medium' | 'high';
  targets: {
    base?: NutritionMacroTarget;
    training_day?: NutritionMacroTarget;
    rest_day?: NutritionMacroTarget;
  };
  explanation: NutritionTargetExplanation;
  input_usage: {
    used: string[];
    omitted: string[];
    not_required: string[];
  };
}

export interface NutritionTargetSaveRequest {
  source: NutritionTargetSource;
  suggestion_id?: string;
  targets: {
    base?: NutritionMacroTarget;
    training_day?: NutritionMacroTarget;
    rest_day?: NutritionMacroTarget;
    day_overrides?: NutritionDayOverride[];
  };
  macro_preference?: string;
  provenance: {
    user_confirmed: true;
    edited_after_suggestion: boolean;
    imported_from_existing?: boolean;
  };
  derivation_inputs?: NutritionDerivationInputsSnapshot;
}

export interface NutritionTargetSaveResponse {
  saved_target_set_id: string;
  user_id: string;
  source: NutritionTargetSource;
  updated_at: string;
  targets: SavedNutritionTargetSet;
}

export interface NutritionTargetsGetResponse {
  target_set?: SavedNutritionTargetSet;
  has_saved_targets: boolean;
  updated_at?: string;
}
