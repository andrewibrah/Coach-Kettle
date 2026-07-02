// Pure target-resolution + macro helpers for the hybrid nutrition target system.
//
// This module intentionally imports ONLY types (erased at runtime) so it has no
// runtime dependencies and can be unit-tested directly with `node --test`.

import type {
  DayOfWeek,
  DraftNutritionTargetSet,
  MacroPreference,
  NutritionMacroTarget,
  NutritionTargetSuggestResponse,
  ResolvedNutritionTarget,
  SavedNutritionTargetSet,
} from '@/types/nutritionTargets';

// ---------- Macro math ----------

// Macro split ratios as fractions of total calories. Mirrors the 30/40/30
// default the manual setup screen has always used.
export function macroRatiosFor(pref?: MacroPreference): { p: number; c: number; f: number } {
  switch (pref) {
    case 'high_protein': return { p: 0.40, c: 0.35, f: 0.25 };
    case 'lower_carb':   return { p: 0.35, c: 0.25, f: 0.40 };
    case 'higher_carb':  return { p: 0.25, c: 0.50, f: 0.25 };
    case 'balanced':
    case 'custom':
    default:             return { p: 0.30, c: 0.40, f: 0.30 };
  }
}

// Derive macro grams from a calorie target. Protein/carbs = 4 cal/g, fat = 9.
export function macrosFromCalories(
  calories: number,
  pref?: MacroPreference,
): { protein_g: number; carbs_g: number; fat_g: number } {
  const r = macroRatiosFor(pref);
  return {
    protein_g: Math.round((calories * r.p) / 4),
    carbs_g:   Math.round((calories * r.c) / 4),
    fat_g:     Math.round((calories * r.f) / 9),
  };
}

// Fill in any missing macros on a calories-only target.
export function withAutoMacros(
  target: NutritionMacroTarget,
  pref?: MacroPreference,
): NutritionMacroTarget {
  if (target.protein_g != null && target.carbs_g != null && target.fat_g != null) return target;
  const m = macrosFromCalories(target.calories, pref);
  return {
    calories: target.calories,
    protein_g: target.protein_g ?? m.protein_g,
    carbs_g: target.carbs_g ?? m.carbs_g,
    fat_g: target.fat_g ?? m.fat_g,
  };
}

// ---------- Date helpers (timezone-independent) ----------

// 0=Sun .. 6=Sat for a YYYY-MM-DD calendar date, independent of machine TZ.
export function dayOfWeekFromIso(date: string): DayOfWeek {
  const d = new Date(`${date}T00:00:00Z`);
  return d.getUTCDay() as DayOfWeek;
}

// ---------- Staleness ----------

export function isTargetSetStale(
  set: Pick<SavedNutritionTargetSet, 'stale_after'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!set || !set.stale_after) return false;
  const after = new Date(set.stale_after).getTime();
  if (!Number.isFinite(after)) return false;
  return now.getTime() > after;
}

// ---------- Resolver ----------

export interface ResolveTargetArgs {
  date: string;                                    // YYYY-MM-DD
  savedTargets?: SavedNutritionTargetSet | null;
  isTrainingDay?: boolean;                         // caller decides via training schedule
  suggestedTargets?: NutritionTargetSuggestResponse | null;
  draftTargets?: DraftNutritionTargetSet | null;
  now?: Date;
}

const EMPTY: ResolvedNutritionTarget = {
  target: null,
  source: null,
  stale: false,
  fallback: false,
  explanation: 'No target set yet. Set your calories or get a suggestion to begin.',
};

/**
 * Deterministically resolve the target to show for `date`.
 *
 * Priority:
 *   1. Specific day override (saved)
 *   2. Training/rest target (saved)
 *   3. Saved base target
 *   4. Backend suggestion (only if present and not stale)
 *   5. Local draft (clearly labeled, never silently durable)
 *   6. Empty setup prompt
 */
export function resolveTodayNutritionTarget(args: ResolveTargetArgs): ResolvedNutritionTarget {
  const { date, savedTargets, isTrainingDay = false, suggestedTargets, draftTargets, now = new Date() } = args;
  const dow = dayOfWeekFromIso(date);
  const saved = savedTargets ?? null;
  const stale = isTargetSetStale(saved, now);

  if (saved) {
    // 1. Specific day override wins over everything within the saved set.
    const override = saved.day_overrides?.find((o) => o.day_of_week === dow);
    if (override) {
      return {
        target: override.target,
        source: override.source,
        stale,
        fallback: false,
        explanation: explain(override.source, stale, `${dayLabel(dow)} override`),
      };
    }

    // 2. Training/rest-specific target.
    const dayTarget = isTrainingDay ? saved.training_day_target : saved.rest_day_target;
    if (dayTarget) {
      return {
        target: dayTarget,
        source: saved.source,
        stale,
        fallback: false,
        explanation: explain(saved.source, stale, isTrainingDay ? 'training-day target' : 'rest-day target'),
      };
    }

    // 3. Saved base target.
    if (saved.base_target) {
      return {
        target: saved.base_target,
        source: saved.source,
        stale,
        fallback: false,
        explanation: explain(saved.source, stale, 'base target'),
      };
    }
  }

  // 4. Backend suggestion — only when present and not stale.
  if (suggestedTargets && !suggestedTargets.stale) {
    const s = suggestedTargets.targets;
    const sTarget = (isTrainingDay ? s.training_day : s.rest_day) ?? s.base;
    if (sTarget) {
      return {
        target: sTarget,
        source: 'backend_suggested',
        stale: false,
        fallback: true,
        explanation: 'Suggested target — based on optional inputs you provided. Not saved yet.',
      };
    }
  }

  // 5. Local draft fallback — clearly labeled, never treated as durable.
  if (draftTargets) {
    const d = (isTrainingDay ? draftTargets.training_day_target : draftTargets.rest_day_target)
      ?? draftTargets.base_target;
    if (d) {
      return {
        target: d,
        source: 'local_draft',
        stale: false,
        fallback: true,
        explanation: 'Draft only — not saved yet.',
      };
    }
  }

  // 6. Nothing to show.
  return EMPTY;
}

function dayLabel(dow: DayOfWeek): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow];
}

function explain(source: SavedNutritionTargetSet['source'], stale: boolean, what: string): string {
  const base =
    source === 'manual'             ? `Custom ${what} — you entered this.`
    : source === 'backend_suggested' ? `Suggested ${what} — based on optional inputs you provided.`
    : source === 'imported_existing' ? `Imported ${what} — saved from this device.`
    : `Draft ${what} — not saved yet.`;
  return stale ? `${base} This target may be stale.` : base;
}
