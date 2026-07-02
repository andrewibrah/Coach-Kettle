import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveTodayNutritionTarget,
  dayOfWeekFromIso,
  isTargetSetStale,
  macrosFromCalories,
  withAutoMacros,
} from '../nutritionTargets.ts';
import type {
  SavedNutritionTargetSet,
  NutritionTargetSuggestResponse,
} from '../../types/nutritionTargets.ts';

const DATE = '2026-06-24';
const DOW = dayOfWeekFromIso(DATE);

function savedSet(partial: Partial<SavedNutritionTargetSet>): SavedNutritionTargetSet {
  return {
    id: 'set-1',
    user_id: 'user-1',
    source: 'manual',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

function suggestion(partial?: Partial<NutritionTargetSuggestResponse>): NutritionTargetSuggestResponse {
  return {
    suggestion_id: 'sug-1',
    source: 'backend_suggested',
    stale: false,
    fallback: false,
    confidence: 'medium',
    targets: { base: { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 67 } },
    explanation: { summary: '', assumptions: [], missing_inputs: [], calculation_basis: '' },
    input_usage: { used: [], omitted: [], not_required: [] },
    ...partial,
  };
}

test('day override beats training/rest', () => {
  const set = savedSet({
    training_day_target: { calories: 3000 },
    rest_day_target: { calories: 2000 },
    day_overrides: [{ day_of_week: DOW, target: { calories: 1234 }, source: 'manual', updated_at: '2026-01-01T00:00:00Z' }],
  });
  const r = resolveTodayNutritionTarget({ date: DATE, savedTargets: set, isTrainingDay: true });
  assert.equal(r.target?.calories, 1234);
  assert.equal(r.source, 'manual');
  assert.equal(r.fallback, false);
});

test('training target wins on training day', () => {
  const set = savedSet({ training_day_target: { calories: 3000 }, rest_day_target: { calories: 2000 }, base_target: { calories: 2500 } });
  const r = resolveTodayNutritionTarget({ date: DATE, savedTargets: set, isTrainingDay: true });
  assert.equal(r.target?.calories, 3000);
});

test('rest target wins on rest day', () => {
  const set = savedSet({ training_day_target: { calories: 3000 }, rest_day_target: { calories: 2000 }, base_target: { calories: 2500 } });
  const r = resolveTodayNutritionTarget({ date: DATE, savedTargets: set, isTrainingDay: false });
  assert.equal(r.target?.calories, 2000);
});

test('saved base target beats suggestion', () => {
  const set = savedSet({ base_target: { calories: 2500 } });
  const r = resolveTodayNutritionTarget({ date: DATE, savedTargets: set, isTrainingDay: false, suggestedTargets: suggestion() });
  assert.equal(r.target?.calories, 2500);
  assert.equal(r.source, 'manual');
  assert.equal(r.fallback, false);
});

test('non-stale suggestion is used as fallback when nothing saved', () => {
  const r = resolveTodayNutritionTarget({ date: DATE, savedTargets: null, isTrainingDay: false, suggestedTargets: suggestion() });
  assert.equal(r.target?.calories, 2000);
  assert.equal(r.source, 'backend_suggested');
  assert.equal(r.fallback, true);
});

test('stale suggestion is NOT applied -> empty prompt', () => {
  const r = resolveTodayNutritionTarget({ date: DATE, savedTargets: null, suggestedTargets: suggestion({ stale: false as const }) });
  // sanity: non-stale applies
  assert.equal(r.source, 'backend_suggested');
  const staleSug = { ...suggestion(), stale: true } as unknown as NutritionTargetSuggestResponse;
  const r2 = resolveTodayNutritionTarget({ date: DATE, savedTargets: null, suggestedTargets: staleSug });
  assert.equal(r2.target, null);
  assert.equal(r2.source, null);
});

test('empty prompt when no data', () => {
  const r = resolveTodayNutritionTarget({ date: DATE, savedTargets: null });
  assert.equal(r.target, null);
  assert.equal(r.source, null);
  assert.equal(r.fallback, false);
});

test('draft used only as labeled last resort', () => {
  const r = resolveTodayNutritionTarget({
    date: DATE,
    savedTargets: null,
    suggestedTargets: null,
    draftTargets: { source: 'local_draft', base_target: { calories: 1800 }, updated_at: '2026-01-01T00:00:00Z' },
  });
  assert.equal(r.target?.calories, 1800);
  assert.equal(r.source, 'local_draft');
  assert.equal(r.fallback, true);
});

test('stale_after marks saved target stale', () => {
  const set = savedSet({ base_target: { calories: 2500 }, stale_after: '2020-01-01T00:00:00Z' });
  assert.equal(isTargetSetStale(set, new Date('2026-06-24T00:00:00Z')), true);
  const r = resolveTodayNutritionTarget({ date: DATE, savedTargets: set, now: new Date('2026-06-24T00:00:00Z') });
  assert.equal(r.stale, true);
  assert.match(r.explanation, /stale/i);
});

test('macro math: 30/40/30 default', () => {
  const m = macrosFromCalories(2000);
  assert.equal(m.protein_g, 150);
  assert.equal(m.carbs_g, 200);
  assert.equal(m.fat_g, 67);
});

test('withAutoMacros fills only missing macros', () => {
  const out = withAutoMacros({ calories: 2000, protein_g: 200 });
  assert.equal(out.protein_g, 200);
  assert.equal(out.carbs_g, 200);
  assert.equal(out.fat_g, 67);
});
