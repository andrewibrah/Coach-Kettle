import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isTrainingDay,
  resolveTrainingDays,
  resolveTrainingDaysUpdate,
  suggestTrainingDays,
  SPLIT_DAY_SUGGESTIONS,
  TRAINING_DAY_MAP,
} from '../trainingSchedule.ts';

// ---------- suggestTrainingDays (#6) ----------

test('suggestTrainingDays returns the seeded weekday pattern for a known (split, days) pair', () => {
  assert.deepEqual(suggestTrainingDays('ppl_3day', 3), [1, 3, 5]);
  assert.deepEqual(suggestTrainingDays('pp_sh_l_5day', 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(suggestTrainingDays('pp_sh_l_6day', 6), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(suggestTrainingDays('full_body', 2), [1, 4]);
  assert.deepEqual(suggestTrainingDays('full_body', 3), [1, 3, 5]);
  assert.deepEqual(suggestTrainingDays('full_body', 4), [1, 2, 4, 5]);
  assert.deepEqual(suggestTrainingDays('upper_lower', 4), [1, 2, 4, 5]);
});

test('suggestTrainingDays returns null -> UI treats as Custom for an unmapped (split, days) pair', () => {
  // ppl_3day has no suggestion for 5 days/week.
  assert.equal(suggestTrainingDays('ppl_3day', 5), null);
  // upper_lower only has a 4-day suggestion in this pass (#7 seeded only
  // the 4-day template) -- 2 days/week has no canonical pattern yet.
  assert.equal(suggestTrainingDays('upper_lower', 2), null);
});

test('suggestTrainingDays returns null for an unknown split', () => {
  assert.equal(suggestTrainingDays('custom', 3), null);
  assert.equal(suggestTrainingDays('not_a_real_split', 3), null);
});

test('every SPLIT_DAY_SUGGESTIONS entry is internally consistent with its day count', () => {
  for (const [split, byDays] of Object.entries(SPLIT_DAY_SUGGESTIONS)) {
    for (const [daysStr, weekdays] of Object.entries(byDays)) {
      const days = Number(daysStr);
      assert.equal(weekdays.length, days, `${split} @ ${days}/week should suggest exactly ${days} weekdays`);
      assert.deepEqual([...new Set(weekdays)], weekdays, `${split} @ ${days}/week has duplicate weekdays`);
      for (const d of weekdays) assert.ok(d >= 0 && d <= 6, `${split} @ ${days}/week has an out-of-range weekday: ${d}`);
    }
  }
});

// ---------- resolveTrainingDays / isTrainingDay precedence (#6 Finding E) ----------

test('resolveTrainingDays prefers explicit days over the days-per-week heuristic', () => {
  // A user who set explicit training_days must not have them overridden by
  // the days_per_week fallback map -- this is the exact bug in
  // NotificationsProvider Finding E.
  assert.deepEqual(resolveTrainingDays(3, [2, 4]), [2, 4]);
});

test('resolveTrainingDays falls back to TRAINING_DAY_MAP when no explicit days are set', () => {
  assert.deepEqual(resolveTrainingDays(3, null), TRAINING_DAY_MAP[3]);
  assert.deepEqual(resolveTrainingDays(3, []), TRAINING_DAY_MAP[3]);
  assert.deepEqual(resolveTrainingDays(3, undefined), TRAINING_DAY_MAP[3]);
});

test('resolveTrainingDays returns [] when neither explicit days nor a days-per-week value exist', () => {
  assert.deepEqual(resolveTrainingDays(null, null), []);
  assert.deepEqual(resolveTrainingDays(0, undefined), []);
});

test('isTrainingDay and resolveTrainingDays agree on the same precedence for every weekday', () => {
  for (let dow = 0; dow <= 6; dow++) {
    // Explicit override case.
    const explicit = [1, 3, 5];
    assert.equal(isTrainingDay(dow, 6, explicit), resolveTrainingDays(6, explicit).includes(dow));
    // Fallback-to-map case.
    assert.equal(isTrainingDay(dow, 4, null), resolveTrainingDays(4, null).includes(dow));
  }
});

// ---------- resolveTrainingDaysUpdate: create.tsx submit-time persist guard ----------
//
// Regression coverage for the review finding: create.tsx used to write
// training_days unconditionally on every submit, silently overwriting an
// existing explicit schedule the user never touched on that screen.

test('unchanged selector (matches existing profile schedule exactly) -> no-change, no write', () => {
  // The exact bug scenario: user has Tue/Thu/Sat saved, opens create,
  // touches nothing on the weekday row (selector seeded to match).
  assert.equal(resolveTrainingDaysUpdate([2, 4, 6], [2, 4, 6]), 'no-change');
});

test('unchanged selector is order-independent', () => {
  assert.equal(resolveTrainingDaysUpdate([6, 2, 4], [2, 4, 6]), 'no-change');
});

test('both empty (no selection, no existing schedule) -> no-change, no write', () => {
  // The second bug scenario: a split/day-count with no suggestion produces
  // an empty selector; a user with no existing schedule submitting that
  // must not write an explicit null over... nothing (harmless, but also
  // must not be treated as "a change" that triggers a network call).
  assert.equal(resolveTrainingDaysUpdate([], null), 'no-change');
  assert.equal(resolveTrainingDaysUpdate([], undefined), 'no-change');
  assert.equal(resolveTrainingDaysUpdate([], []), 'no-change');
});

test('a genuinely new selection (no prior schedule) is written', () => {
  assert.deepEqual(resolveTrainingDaysUpdate([1, 3, 5], null), [1, 3, 5]);
});

test('a genuine edit away from the existing schedule is written', () => {
  assert.deepEqual(resolveTrainingDaysUpdate([1, 4], [2, 4, 6]), [1, 4]);
});

test('clearing all days when a schedule previously existed writes an explicit null', () => {
  assert.equal(resolveTrainingDaysUpdate([], [2, 4, 6]), null);
});

test('the written value is always sorted regardless of selection order', () => {
  const result = resolveTrainingDaysUpdate([5, 1, 3], []);
  assert.deepEqual(result, [1, 3, 5]);
});
