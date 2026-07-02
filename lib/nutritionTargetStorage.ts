// AsyncStorage namespacing + legacy format bridges for nutrition targets.
//
// Pure module: imports ONLY types (erased at runtime) so it carries no runtime
// dependency on AsyncStorage and can be unit-tested with `node --test`. The
// NutritionContext owns the actual AsyncStorage reads/writes using these keys.
//
// Storage policy:
//   - AsyncStorage holds ONLY: unsaved drafts, last-known cache, pending saves,
//     and an anonymous pre-auth draft.
//   - It is NEVER the durable source of truth for accepted authenticated
//     targets, and NEVER silently overrides Supabase account state.
//   - All authenticated keys are namespaced by user id to prevent cross-account
//     leakage.

import type { NutritionTargets } from '@/types/nutrition';
import type {
  DraftNutritionTargetSet,
  NutritionMacroTarget,
  NutritionTargetSaveRequest,
  SavedNutritionTargetSet,
} from '@/types/nutritionTargets';

export type LocalTargetKind = 'draft' | 'cache' | 'pending-save';

const PREFIX = 'coach-kettle:nutrition-targets';
export const ANONYMOUS_NS = 'anonymous';

// Legacy ant2 keys (global, un-namespaced — being migrated away from).
export const LEGACY_LOCAL_TARGETS_KEY = 'nutrition_targets_local_v1';
export const LEGACY_WEEKLY_GOALS_KEY = 'nutrition_weekly_goals_v1';

/**
 * Build a user-namespaced AsyncStorage key.
 * `cache` and `pending-save` require a real user id; the anonymous namespace
 * may only hold a `draft`.
 */
export function targetStorageKey(userId: string | null | undefined, kind: LocalTargetKind): string {
  const ns = userId ?? ANONYMOUS_NS;
  if (ns === ANONYMOUS_NS && kind !== 'draft') {
    throw new Error(`Anonymous namespace only supports drafts, not "${kind}"`);
  }
  return `${PREFIX}:${ns}:${kind}`;
}

/** True when a key belongs to the nutrition-target namespace for ANY user. */
export function isTargetStorageKey(key: string): boolean {
  return key.startsWith(`${PREFIX}:`);
}

/** True when a stored key belongs to a specific user (not anonymous). */
export function keyBelongsToUser(key: string, userId: string): boolean {
  return key.startsWith(`${PREFIX}:${userId}:`);
}

// ---------- Safe JSON codecs ----------

export function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// ---------- Legacy (ant2) local target migration ----------

// ant2 stored a Partial<NutritionTargets> (the big training/rest DB row) under
// LEGACY_LOCAL_TARGETS_KEY. Detect a usable legacy value.
export function hasUsableLegacyTargets(legacy: Partial<NutritionTargets> | null | undefined): boolean {
  if (!legacy) return false;
  return Number(legacy.training_calories) > 0 || Number(legacy.rest_calories) > 0;
}

function macroFromLegacy(cal?: number, p?: number, c?: number, f?: number): NutritionMacroTarget | undefined {
  if (!(Number(cal) > 0)) return undefined;
  return {
    calories: Math.round(Number(cal)),
    protein_g: Number(p) > 0 ? Math.round(Number(p)) : undefined,
    carbs_g: Number(c) > 0 ? Math.round(Number(c)) : undefined,
    fat_g: Number(f) > 0 ? Math.round(Number(f)) : undefined,
  };
}

/**
 * Convert detected ant2 local targets into an `imported_existing` save request.
 * Returns null when there is nothing worth importing.
 */
export function buildImportSaveRequest(
  legacy: Partial<NutritionTargets> | null | undefined,
): NutritionTargetSaveRequest | null {
  if (!hasUsableLegacyTargets(legacy)) return null;
  const l = legacy as Partial<NutritionTargets>;
  const training = macroFromLegacy(l.training_calories, l.training_protein_g, l.training_carbs_g, l.training_fat_g);
  const rest = macroFromLegacy(l.rest_calories, l.rest_protein_g, l.rest_carbs_g, l.rest_fat_g);
  return {
    source: 'imported_existing',
    targets: {
      training_day: training,
      rest_day: rest,
      base: training ?? rest,
    },
    provenance: {
      user_confirmed: true,
      edited_after_suggestion: false,
      imported_from_existing: true,
    },
  };
}

// ---------- Display bridge: SavedNutritionTargetSet -> legacy big row ----------

// The existing dashboard + grading code consumes the legacy `NutritionTargets`
// row shape. Project a saved hybrid set onto that shape so existing UI keeps
// working without a rewrite. Day-specific targets fall back to base.
export function savedSetToLegacyTargets(
  set: SavedNutritionTargetSet,
): NutritionTargets {
  // Calories-only targets must not project to 0 g macros, or the dashboard
  // rings show 0 and grading drops macro adherence. Fill missing macros from
  // calories with the 30/40/30 P/C/F split the manual form defaults to.
  const fill = (m: NutritionMacroTarget | undefined): NutritionMacroTarget | undefined => {
    if (!m || !(Number(m.calories) > 0)) return m;
    return {
      calories: m.calories,
      protein_g: m.protein_g ?? Math.round((m.calories * 0.30) / 4),
      carbs_g: m.carbs_g ?? Math.round((m.calories * 0.40) / 4),
      fat_g: m.fat_g ?? Math.round((m.calories * 0.30) / 9),
    };
  };
  const train = fill(set.training_day_target ?? set.base_target);
  const rest = fill(set.rest_day_target ?? set.base_target);
  const t = train ?? rest;
  const r = rest ?? train;
  const safe = (n: number | undefined, fallback: number) => (Number(n) > 0 ? Math.round(Number(n)) : fallback);
  return {
    id: set.id,
    user_id: set.user_id,
    training_calories: safe(t?.calories, 0),
    training_protein_g: safe(t?.protein_g, 0),
    training_carbs_g: safe(t?.carbs_g, 0),
    training_fat_g: safe(t?.fat_g, 0),
    rest_calories: safe(r?.calories, 0),
    rest_protein_g: safe(r?.protein_g, 0),
    rest_carbs_g: safe(r?.carbs_g, 0),
    rest_fat_g: safe(r?.fat_g, 0),
    fiber_g_min: 25,
    saturated_fat_g_max: 30,
    bmr: null,
    tdee: null,
    derivation_inputs: null,
    last_recalibrated_at: set.updated_at,
    created_at: set.created_at,
    updated_at: set.updated_at,
  };
}

// Build a save request from manual training/rest macro entry on the targets screen.
export function buildManualSaveRequest(
  training: NutritionMacroTarget | undefined,
  rest: NutritionMacroTarget | undefined,
  opts?: { editedAfterSuggestion?: boolean; suggestionId?: string; macroPreference?: string },
): NutritionTargetSaveRequest | null {
  if (!training && !rest) return null;
  const fromSuggestion = Boolean(opts?.suggestionId);
  const edited = Boolean(opts?.editedAfterSuggestion);
  return {
    // An edited-then-confirmed target is the user's own number -> 'manual'
    // (so it isn't marked stale like a raw suggestion). Only an unedited,
    // accepted suggestion keeps the 'backend_suggested' source.
    source: fromSuggestion && !edited ? 'backend_suggested' : 'manual',
    suggestion_id: opts?.suggestionId,
    macro_preference: opts?.macroPreference,
    targets: {
      training_day: training,
      rest_day: rest,
      base: training ?? rest,
    },
    provenance: {
      user_confirmed: true,
      edited_after_suggestion: edited,
    },
  };
}

// Build a draft set snapshot for the local draft slot.
export function buildDraft(
  training: NutritionMacroTarget | undefined,
  rest: NutritionMacroTarget | undefined,
  macroPreference?: string,
): DraftNutritionTargetSet {
  return {
    source: 'local_draft',
    training_day_target: training,
    rest_day_target: rest,
    base_target: training ?? rest,
    macro_preference: macroPreference,
    updated_at: new Date().toISOString(),
  };
}
