/**
 * Pure program-template selection logic (#7).
 *
 * Mirrors the selection algorithm in `supabase/functions/programming/index.ts`
 * (`generateProgramFromTemplate`): pick an exact (split_type, days_per_week)
 * match, otherwise fall back to the closest available days_per_week for that
 * split. Kept here, independent of any DB/network call, so the algorithm
 * itself is unit-testable without a live database.
 */

export interface TemplateSummary {
  split_type: string;
  days_per_week: number;
}

/** Splits a user can actually request (create-program UI + POST validation),
 * excluding 'custom' — which has no template concept and is not offered in
 * the create-program UI. */
export const REQUESTABLE_SPLITS = [
  'ppl_3day',
  'pp_sh_l_5day',
  'pp_sh_l_6day',
  'upper_lower',
  'full_body',
] as const;

/** The full days-per-week range the create-program UI's stepper allows. */
export const UI_DAYS_PER_WEEK_RANGE = [1, 2, 3, 4, 5, 6, 7] as const;

export function resolveTemplate<T extends TemplateSummary>(
  templates: readonly T[],
  split: string,
  daysPerWeek: number,
): T | null {
  const forSplit = templates.filter((t) => t.split_type === split);
  if (forSplit.length === 0) return null;

  const exact = forSplit.find((t) => t.days_per_week === daysPerWeek);
  if (exact) return exact;

  return forSplit.reduce((best, candidate) =>
    Math.abs(candidate.days_per_week - daysPerWeek) < Math.abs(best.days_per_week - daysPerWeek)
      ? candidate
      : best
  );
}
