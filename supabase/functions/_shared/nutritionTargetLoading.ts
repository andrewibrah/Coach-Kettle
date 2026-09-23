import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';
import type { LegacyTargetInput, SavedTargetInput } from './nutritionTargetResolution.ts';

type SavedSnapshot = SavedTargetInput & {
  day_overrides: NonNullable<SavedTargetInput['day_overrides']>;
};

/** One statement snapshot for parent and ordered children, never two REST reads.
 * Service clients must pin owner from verified auth; authenticated clients are
 * additionally pinned to auth.uid() by SQL. Preserve historical fields raw:
 * loading is not approval, and the resolver decides whether targets are usable.
 */
export async function readSavedNutritionTargetSet(
  client: Pick<SupabaseClient, 'rpc'>,
  verifiedOwnerId: string,
): Promise<SavedSnapshot | null> {
  if (!verifiedOwnerId) throw new Error('Verified target owner required');
  const { data, error } = await client.rpc('read_nutrition_target_set', { p_user_id: verifiedOwnerId });
  if (error || data === undefined) throw new Error('Nutrition target read unavailable; please try again.');
  if (data === null) return null;
  if (typeof data !== 'object' || Array.isArray(data) || !data.id || data.user_id !== verifiedOwnerId) {
    throw new Error('Nutrition target ownership mismatch');
  }
  if (!Array.isArray(data.day_overrides)) throw new Error('Nutrition override read unavailable; please try again.');
  if (data.day_overrides.some((row: { user_id: string; target_set_id: string } | null) =>
    !row || row.user_id !== verifiedOwnerId || row.target_set_id !== data.id)) {
    throw new Error('Nutrition override ownership mismatch');
  }
  return data;
}

/** Legacy remains its actual separately stored row; failures are not absence.
 * Call once per request, then resolve each actual ISO calendar date separately.
 */
export async function loadApprovedNutritionTargetInputs(
  client: Pick<SupabaseClient, 'from' | 'rpc'>,
  verifiedOwnerId: string,
): Promise<{ savedTargets: SavedTargetInput | null; legacyTargets: LegacyTargetInput | null }> {
  if (!verifiedOwnerId) throw new Error('Verified target owner required');
  const [savedTargets, legacy] = await Promise.all([
    readSavedNutritionTargetSet(client, verifiedOwnerId),
    client.from('nutrition_targets').select('*').eq('user_id', verifiedOwnerId).maybeSingle(),
  ]);
  if (legacy.error) throw new Error('Nutrition target read unavailable; please try again.');
  if (legacy.data && legacy.data.user_id !== verifiedOwnerId) throw new Error('Nutrition target ownership mismatch');
  return { savedTargets, legacyTargets: legacy.data };
}
