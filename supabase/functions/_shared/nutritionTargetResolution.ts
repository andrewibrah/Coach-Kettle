// Runtime-neutral, Deno-local contract. No app imports, I/O, implicit clock,
// macro generation or device-local inputs. Structural projections mirror
// types/nutritionTargets.ts and types/nutrition.ts; parity tests pass real app
// shapes to this module so Edge bundles need not reach outside functions/.
export type TargetSource = 'manual' | 'backend_suggested' | 'local_draft' | 'imported_existing';
export interface MacroTarget {
  calories: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}
export interface SavedTargetInput {
  id: string;
  user_id: string;
  source: TargetSource;
  base_target?: MacroTarget | null;
  training_day_target?: MacroTarget | null;
  rest_day_target?: MacroTarget | null;
  day_overrides?: {
    day_of_week: number;
    target: MacroTarget;
    source: TargetSource;
    updated_at: string;
  }[] | null;
  stale_after?: string | null;
  updated_at: string;
}
export interface LegacyTargetInput {
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
  updated_at: string;
}
export interface ResolveApprovedNutritionTargetArgs {
  date: string; // Strict YYYY-MM-DD calendar date, NOT an instant.
  now: Date; // Explicit evaluation instant, shared across all seven plan dates.
  savedTargets?: SavedTargetInput | null;
  legacyTargets?: LegacyTargetInput | null;
  daysPerWeek?: number | null;
  trainingDays?: number[] | null; // profiles.training_days, not derivation inputs.
}
export type TargetProvenance = 'saved_override' | 'saved_training' | 'saved_rest'
  | 'saved_base' | 'legacy_training' | 'legacy_rest';
interface ResolutionMetadata {
  date: string;
  dayOfWeek: number;
  isTrainingDay: boolean;
  source: Exclude<TargetSource, 'local_draft'> | null;
  provenance: TargetProvenance | null;
  targetSetId: string | null;
  legacyTargetId: string | null;
  updatedAt: string | null;
  stale: boolean;
  fallback: boolean;
}
export type ApprovedNutritionTargetResolution = ResolutionMetadata & (
  | { status: 'available'; target: Required<MacroTarget>; reason: null }
  | { status: 'unavailable'; target: null; reason: 'no_approved_target' | 'incomplete_or_invalid_target' }
);

// Mirror lib/trainingSchedule.ts: nonempty explicit schedule wins; an empty
// explicit array falls through to days/week; missing schedule means no days.
const TRAINING_DAY_MAP: Record<number, number[]> = {
  1: [3], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
};

/**
 * Consumer contract:
 * - Supply only authenticated user's durable DB rows (including joined saved
 *   weekday overrides). This pure function cannot authenticate or prove a save.
 *   A saved backend_suggested row was confirmed via save_set; a suggestion
 *   response is NOT a saved row. local_draft is never approved, even in a row.
 * - Priority: approved saved weekday > scheduled split > base > real legacy.
 *   A present but incomplete/invalid selected target BLOCKS lower layers: ask
 *   for setup/repair, never score or generate meals against fabricated macros.
 * - All four values must be finite positive numbers, matching save_set's
 *   sanitizeMacro positivity rule. No coercion, rounding or arbitrary caps.
 * - Staleness is advisory (strictly now > stale_after), never permission to
 *   replace confirmed data. Missing/unparseable stale_after is not stale,
 *   matching the client. Derivation snapshots never supply the current schedule.
 * - Invalid calendar dates or evaluation clocks throw RangeError. Consumers
 *   must map these to input errors. Unavailable is a normal setup result.
 * - Unlike the client display resolver, no weeklyGoals, draftTargets or
 *   suggestedTargets layer is accepted. Unknown extra properties are ignored.
 * - Coach resolves its calendar date; plans call once per actual plan date,
 *   retaining metadata and refusing generation when any date is unavailable.
 */
export function resolveApprovedNutritionTarget(
  args: ResolveApprovedNutritionTargetArgs,
): ApprovedNutritionTargetResolution {
  const { date, now } = args;
  const calendar = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(calendar.getTime())
    || calendar.toISOString().slice(0, 10) !== date) {
    throw new RangeError('Expected a valid YYYY-MM-DD calendar date');
  }
  if (!Number.isFinite(now.getTime())) throw new RangeError('Expected a valid evaluation instant');
  const dayOfWeek = calendar.getUTCDay();
  const days = args.trainingDays?.length ? args.trainingDays
    : TRAINING_DAY_MAP[args.daysPerWeek ?? 0] ?? [];
  const isTrainingDay = days.includes(dayOfWeek);
  const metadata: ResolutionMetadata = {
    date, dayOfWeek, isTrainingDay, source: null, provenance: null,
    targetSetId: null, legacyTargetId: null, updatedAt: null, stale: false, fallback: false,
  };
  const approved = (source: TargetSource): source is Exclude<TargetSource, 'local_draft'> =>
    source === 'manual' || source === 'backend_suggested' || source === 'imported_existing';
  let target: MacroTarget | null | undefined;
  let selected = false;
  const saved = args.savedTargets;
  if (saved && approved(saved.source)) {
    const override = saved.day_overrides?.find(o => o.day_of_week === dayOfWeek && approved(o.source));
    const split = isTrainingDay ? saved.training_day_target : saved.rest_day_target;
    target = override ? override.target : split ?? saved.base_target;
    // An approved override is selected even if its persisted target is missing.
    selected = override != null || target != null;
    if (selected) {
      metadata.provenance = override ? 'saved_override' : split != null
        ? isTrainingDay ? 'saved_training' : 'saved_rest' : 'saved_base';
      metadata.source = override && approved(override.source) ? override.source : saved.source;
      metadata.targetSetId = saved.id;
      metadata.updatedAt = override?.updated_at ?? saved.updated_at;
      metadata.stale = !!saved.stale_after && now.getTime() > new Date(saved.stale_after).getTime();
    }
  }
  const legacy = args.legacyTargets;
  if (!selected && legacy) {
    selected = true;
    target = isTrainingDay ? {
      calories: legacy.training_calories, protein_g: legacy.training_protein_g,
      carbs_g: legacy.training_carbs_g, fat_g: legacy.training_fat_g,
    } : {
      calories: legacy.rest_calories, protein_g: legacy.rest_protein_g,
      carbs_g: legacy.rest_carbs_g, fat_g: legacy.rest_fat_g,
    };
    metadata.provenance = isTrainingDay ? 'legacy_training' : 'legacy_rest';
    metadata.legacyTargetId = legacy.id;
    metadata.updatedAt = legacy.updated_at;
    metadata.fallback = true;
  }
  if (!selected) {
    return { ...metadata, status: 'unavailable', target: null, reason: 'no_approved_target' };
  }
  if (target == null) {
    return { ...metadata, status: 'unavailable', target: null, reason: 'incomplete_or_invalid_target' };
  }
  const { calories, protein_g, carbs_g, fat_g } = target;
  const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (!positive(calories) || !positive(protein_g) || !positive(carbs_g) || !positive(fat_g)) {
    return { ...metadata, status: 'unavailable', target: null, reason: 'incomplete_or_invalid_target' };
  }
  return { ...metadata, status: 'available', target: { calories, protein_g, carbs_g, fat_g }, reason: null };
}
