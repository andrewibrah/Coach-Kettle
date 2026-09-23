import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApprovedNutritionTarget } from '../../supabase/functions/_shared/nutritionTargetResolution.ts';
import { resolveTodayNutritionTarget } from '../nutritionTargets.ts';
import { isTrainingDay, resolveTrainingDays } from '../trainingSchedule.ts';
import type { SavedNutritionTargetSet, NutritionMacroTarget } from '../../types/nutritionTargets.ts';
import type { NutritionTargets } from '../../types/nutrition.ts';

const now = new Date('2026-01-01T00:00:00Z');
const date = '2026-06-24'; // Wednesday
const macro = (calories = 2400): Required<NutritionMacroTarget> => ({ calories, protein_g: 180, carbs_g: 240, fat_g: 80 });
const saved = (extra: Partial<SavedNutritionTargetSet> = {}): SavedNutritionTargetSet => ({
  id: 'set-1', user_id: 'user-1', source: 'manual', created_at: now.toISOString(), updated_at: now.toISOString(),
  base_target: macro(), ...extra,
});
const legacy: NutritionTargets = {
  id: 'legacy-1', user_id: 'user-1', training_calories: 2700, training_protein_g: 200,
  training_carbs_g: 280, training_fat_g: 85, rest_calories: 2100, rest_protein_g: 160,
  rest_carbs_g: 200, rest_fat_g: 70, fiber_g_min: 25, saturated_fat_g_max: 20,
  bmr: null, tdee: null, derivation_inputs: null, last_recalibrated_at: now.toISOString(),
  created_at: now.toISOString(), updated_at: now.toISOString(),
};

// Parity deliberately excludes device weeklyGoals, drafts and unsaved suggestions:
// those are display-only client layers, never server authority.
for (const [name, set, days, layer] of [
  ['weekday', saved({ training_day_target: macro(2600), day_overrides: [{ day_of_week: 3, target: macro(2300), source: 'imported_existing', updated_at: now.toISOString() }] }), [3], 'saved_override'],
  ['training', saved({ training_day_target: macro(2600) }), [3], 'saved_training'],
  ['rest', saved({ rest_day_target: macro(2200) }), [1], 'saved_rest'],
  ['base', saved(), [3], 'saved_base'],
  ['legacy training', null, [3], 'legacy_training'],
  ['legacy rest', null, [1], 'legacy_rest'],
  ['empty saved falls back', saved({ base_target: undefined }), [1], 'legacy_rest'],
] as const) {
  test(`approved-data parity: ${name}`, () => {
    const trainingDays = [...days];
    const r = resolveApprovedNutritionTarget({ date, now, savedTargets: set, legacyTargets: legacy, trainingDays });
    const client = resolveTodayNutritionTarget({ date, now, savedTargets: set, legacyTargets: legacy, isTrainingDay: trainingDays.includes(3) });
    assert.equal(r.status, 'available');
    assert.deepEqual(r.target, client.target);
    assert.equal(r.source, client.source);
    assert.equal(r.fallback, client.fallback);
    assert.equal(r.provenance, layer);
    assert.equal(r.isTrainingDay, trainingDays.includes(3));
  });
}

test('no authority means setup; extra client layers cannot supply or override authority', () => {
  const extras = { weeklyGoals: { 3: macro(9000) }, suggestedTargets: { source: 'backend_suggested', stale: false, targets: { base: macro(8000) } }, draftTargets: { source: 'local_draft', base_target: macro(7000) } };
  const empty = resolveApprovedNutritionTarget({ date, now, ...extras });
  assert.equal(empty.status, 'unavailable');
  assert.equal(empty.reason, 'no_approved_target');
  assert.equal(empty.target, null);
  const r = resolveApprovedNutritionTarget({ date, now, savedTargets: saved(), ...extras });
  assert.deepEqual(r.target, macro());
});

test('local_draft set is not authority even with durable-looking IDs', () => {
  assert.equal(resolveApprovedNutritionTarget({ date, now, savedTargets: saved({ source: 'local_draft' }) }).target, null);
  assert.equal(resolveApprovedNutritionTarget({ date, now, savedTargets: saved({ source: 'local_draft' }), legacyTargets: legacy }).provenance, 'legacy_rest');
});

test('local_draft weekday override cannot shadow approved saved base', () => {
  const r = resolveApprovedNutritionTarget({ date, now, savedTargets: saved({ day_overrides: [{ day_of_week: 3, target: macro(3000), source: 'local_draft', updated_at: now.toISOString() }] }) });
  assert.deepEqual(r.target, macro());
  assert.equal(r.provenance, 'saved_base');
});

test('saved suggested provenance remains authoritative after staleness; derivation snapshot is not a schedule', () => {
  const set = saved({ source: 'backend_suggested', stale_after: '2025-12-31T23:59:59Z', derivation_inputs_snapshot: { training_days_per_week: 3 }, training_day_target: macro(2800) });
  const r = resolveApprovedNutritionTarget({ date, now, savedTargets: set, legacyTargets: legacy });
  assert.deepEqual(r.target, macro());
  assert.equal(r.stale, true);
  assert.equal(r.source, 'backend_suggested');
  assert.equal(r.isTrainingDay, false);
  assert.equal(r.targetSetId, set.id);
  assert.equal(r.updatedAt, set.updated_at);
  assert.equal(resolveApprovedNutritionTarget({ date, now: new Date(set.stale_after!), savedTargets: set }).stale, false);
});

for (const field of ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const) {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, -1, 0, '200']) {
    test(`selected target rejects ${field}=${String(value)} without lower-priority fallback`, () => {
      const bad = { ...macro(), [field]: value } as unknown as NutritionMacroTarget;
      const r = resolveApprovedNutritionTarget({ date, now, savedTargets: saved({ rest_day_target: bad }), legacyTargets: legacy });
      assert.equal(r.status, 'unavailable');
      assert.equal(r.reason, 'incomplete_or_invalid_target');
      assert.equal(r.target, null);
      assert.equal(r.provenance, 'saved_rest');
    });
  }
}

test('calories-only override and incomplete legacy return unavailable', () => {
  const r = resolveApprovedNutritionTarget({ date, now, savedTargets: saved({ day_overrides: [{ day_of_week: 3, target: { calories: 2200 }, source: 'manual', updated_at: now.toISOString() }] }) });
  assert.equal(r.reason, 'incomplete_or_invalid_target');
  assert.equal(r.provenance, 'saved_override');
  assert.equal(resolveApprovedNutritionTarget({ date, now, legacyTargets: { ...legacy, rest_fat_g: undefined } as unknown as NutritionTargets }).reason, 'incomplete_or_invalid_target');
});

for (const [name, targetFields] of [
  ['null', { target: null }],
  ['missing', {}],
  ['malformed', { target: {} }],
] as const) {
  for (const withLegacy of [true, false]) {
    for (const training of [true, false]) {
      test(`selected ${name} override blocks lower targets: legacy=${withLegacy}, training=${training}`, () => {
        const updatedAt = '2025-12-30T12:00:00Z';
        // Simulate malformed persisted data despite the compile-time row contract.
        const set = saved({
          base_target: macro(2400),
          training_day_target: macro(2600),
          rest_day_target: macro(2200),
          stale_after: '2025-12-31T23:59:59Z',
          day_overrides: [{
            day_of_week: 3, source: 'imported_existing', updated_at: updatedAt, ...targetFields,
          }] as unknown as SavedNutritionTargetSet['day_overrides'],
        });
        const r = resolveApprovedNutritionTarget({
          date, now, savedTargets: set, legacyTargets: withLegacy ? legacy : undefined,
          trainingDays: training ? [3] : [1],
        });
        assert.deepEqual(r, {
          status: 'unavailable', target: null, reason: 'incomplete_or_invalid_target',
          date, dayOfWeek: 3, isTrainingDay: training,
          source: 'imported_existing', provenance: 'saved_override',
          targetSetId: set.id, legacyTargetId: null, updatedAt, stale: true, fallback: false,
        });
      });
    }
  }
}

test('finite positive values are preserved without invented caps or rounding', () => {
  const target = { calories: 12000.5, protein_g: 1000.5, carbs_g: 1500.5, fat_g: 500.5 };
  assert.deepEqual(resolveApprovedNutritionTarget({ date, now, savedTargets: saved({ base_target: target }) }).target, target);
});

for (const daysPerWeek of [undefined, null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 2.5]) {
  for (const trainingDays of [undefined, null, [], [0, 2, 6]]) {
    test(`seven-date schedule parity: ${daysPerWeek}/${JSON.stringify(trainingDays)}`, () => {
      for (const [dow, day] of ['2026-06-21', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27'].entries()) {
        const r = resolveApprovedNutritionTarget({ date: day, now, daysPerWeek, trainingDays });
        assert.equal(r.isTrainingDay, isTrainingDay(dow, daysPerWeek, trainingDays));
        assert.equal(r.isTrainingDay, resolveTrainingDays(daysPerWeek, trainingDays).includes(dow));
        assert.equal(r.dayOfWeek, dow);
      }
    });
  }
}

for (const invalid of ['2026-02-29', '2024-02-30', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '2026-01-01T00:00:00Z', '', ' 2026-01-01']) {
  test(`reject invalid calendar date: ${invalid}`, () => {
    assert.throws(() => resolveApprovedNutritionTarget({ date: invalid, now }), RangeError);
  });
}

test('calendar dates ignore UTC+14 instant boundary, leap years and machine timezone', () => {
  for (const [day, dow] of [['2024-02-29', 4], ['2000-02-29', 2], ['2026-12-31', 4], ['2027-01-01', 5], ['0099-01-01', 4]] as const) {
    const r = resolveApprovedNutritionTarget({ date: day, now: new Date('2027-01-01T00:30:00+14:00'), trainingDays: [dow] });
    assert.equal(r.dayOfWeek, dow);
    assert.equal(r.isTrainingDay, true);
    assert.equal(r.date, day);
  }
});
