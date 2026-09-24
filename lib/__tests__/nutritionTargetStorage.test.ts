import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  targetStorageKey,
  keyBelongsToUser,
  isTargetStorageKey,
  buildImportSaveRequest,
  hasUsableLegacyTargets,
  savedSetToLegacyTargets,
  buildManualSaveRequest,
  ANONYMOUS_NS,
} from '../nutritionTargetStorage.ts';
import type { SavedNutritionTargetSet } from '../../types/nutritionTargets.ts';

test('keys are namespaced per user', () => {
  assert.equal(targetStorageKey('userA', 'draft'), 'coach-kettle:nutrition-targets:userA:draft');
  assert.equal(targetStorageKey('userA', 'cache'), 'coach-kettle:nutrition-targets:userA:cache');
  assert.equal(targetStorageKey('userA', 'pending-save'), 'coach-kettle:nutrition-targets:userA:pending-save');
  assert.equal(targetStorageKey(null, 'draft'), `coach-kettle:nutrition-targets:${ANONYMOUS_NS}:draft`);
});

test('anonymous namespace only supports drafts', () => {
  assert.throws(() => targetStorageKey(null, 'cache'));
  assert.throws(() => targetStorageKey(undefined, 'pending-save'));
});

test('User A cache key does not belong to User B', () => {
  const keyA = targetStorageKey('userA', 'cache');
  assert.equal(keyBelongsToUser(keyA, 'userA'), true);
  assert.equal(keyBelongsToUser(keyA, 'userB'), false);
  assert.equal(isTargetStorageKey(keyA), true);
  assert.equal(isTargetStorageKey('nutrition_targets_local_v1'), false);
});

test('legacy ant2 targets convert to imported_existing save request', () => {
  const legacy = {
    training_calories: 3000, training_protein_g: 200, training_carbs_g: 300, training_fat_g: 90,
    rest_calories: 2200, rest_protein_g: 180, rest_carbs_g: 200, rest_fat_g: 70,
  };
  assert.equal(hasUsableLegacyTargets(legacy), true);
  const req = buildImportSaveRequest(legacy);
  assert.ok(req);
  assert.equal(req!.source, 'imported_existing');
  assert.equal(req!.provenance.imported_from_existing, true);
  assert.equal(req!.targets.training_day?.calories, 3000);
  assert.equal(req!.targets.rest_day?.calories, 2200);
});

test('no legacy targets -> null import request', () => {
  assert.equal(hasUsableLegacyTargets(null), false);
  assert.equal(hasUsableLegacyTargets({}), false);
  assert.equal(buildImportSaveRequest({}), null);
});

test('savedSetToLegacyTargets projects onto big-row shape with base fallback', () => {
  const set: SavedNutritionTargetSet = {
    id: 's', user_id: 'u', source: 'manual',
    base_target: { calories: 2400, protein_g: 180, carbs_g: 240, fat_g: 80 },
    training_day_target: { calories: 2800, protein_g: 200, carbs_g: 300, fat_g: 90 },
    created_at: 'c', updated_at: 'u',
  };
  const row = savedSetToLegacyTargets(set);
  assert.equal(row.training_calories, 2800);
  // rest falls back to base when no rest_day_target
  assert.equal(row.rest_calories, 2400);
  assert.equal(row.fiber_g_min, 25);
  assert.equal(row.saturated_fat_g_max, 30);
});

test('manual save request uses manual source by default', () => {
  const req = buildManualSaveRequest({ calories: 2500 }, { calories: 2000 });
  assert.equal(req!.source, 'manual');
  assert.equal(req!.provenance.user_confirmed, true);
});

test('edited suggestion is saved as manual (and keeps suggestion_id)', () => {
  const edited = buildManualSaveRequest({ calories: 2500 }, { calories: 2000 }, { suggestionId: 'sug-9', editedAfterSuggestion: true });
  assert.equal(edited!.source, 'manual');
  assert.equal(edited!.suggestion_id, 'sug-9');
  assert.equal(edited!.provenance.edited_after_suggestion, true);
});

test('unedited accepted suggestion keeps backend_suggested source', () => {
  const accepted = buildManualSaveRequest({ calories: 2500 }, { calories: 2000 }, { suggestionId: 'sug-9', editedAfterSuggestion: false });
  assert.equal(accepted!.source, 'backend_suggested');
  assert.equal(accepted!.suggestion_id, 'sug-9');
});

test('save requests are complete only when every target carries four positive macros', async () => {
  const storage: any = await import('../nutritionTargetStorage.ts');
  const full = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 };
  assert.equal(typeof storage.hasCompleteMacros, 'function');
  assert.equal(storage.hasCompleteMacros(buildManualSaveRequest(full, full)!), true);
  assert.equal(storage.hasCompleteMacros(buildManualSaveRequest(undefined, full)!), true);
  assert.equal(storage.hasCompleteMacros(buildManualSaveRequest({ calories: 2000 }, undefined)!), false);
  for (const key of ['protein_g', 'carbs_g', 'fat_g']) {
    const partial: any = { ...full }; delete partial[key];
    assert.equal(storage.hasCompleteMacros(buildManualSaveRequest(full, partial)!), false, key);
    assert.equal(storage.hasCompleteMacros({ ...buildManualSaveRequest(full, full)!, targets: { base: full, day_overrides: [{ day_of_week: 2, target: partial, source: 'manual', updated_at: '' }] } }), false, key);
  }
  assert.equal(storage.hasCompleteMacros(buildManualSaveRequest(full, { ...full, fat_g: 0 })!), false);
  assert.equal(storage.hasCompleteMacros(buildImportSaveRequest({ training_calories: 2400 })!), false);
  assert.equal(typeof storage.INCOMPLETE_MACROS_MESSAGE, 'string');
});

test('weekly import refuses to resend a saved calorie-only target', async () => {
  const storage: any = await import('../nutritionTargetStorage.ts');
  const full = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 };
  const saved: any = { id: 's', user_id: 'u', source: 'manual', base_target: { calories: 2000 }, updated_at: '', created_at: '' };
  assert.throws(() => storage.buildWeeklyImportSaveRequest({ 1: full }, saved, true), /add protein, carbs and fat/i);
  const historicOverride = { ...saved, base_target: full, day_overrides: [{ day_of_week: 3, target: { calories: 1800 }, source: 'manual', updated_at: '' }] };
  assert.throws(() => storage.buildWeeklyImportSaveRequest({ 1: full }, historicOverride, true), /add protein, carbs and fat/i);
  // Importing that same weekday replaces the incomplete override, so it is allowed.
  assert.deepEqual(storage.buildWeeklyImportSaveRequest({ 3: full }, historicOverride, true).targets.day_overrides.map((o: any) => o.day_of_week), [3]);
});
