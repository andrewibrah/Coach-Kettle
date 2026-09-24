import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveProgramDayStatus,
  canStartProgramDay,
  resolveScheduledDayIndex,
  resolveHomeStartDecision,
  resolveProgramDayItems,
} from '../programSchedule.ts';

const BASE = { dow: 1, trainingWeekdays: [1, 3, 5], currentWeek: 1, weeksTotal: 8, isTodayCompleted: false };

// ---------- resolveProgramDayStatus ----------

test('training day: today is a scheduled weekday, not yet completed, program still running', () => {
  assert.deepEqual(resolveProgramDayStatus(BASE), { kind: 'training_day' });
});

test('rest day: today is not one of the training weekdays', () => {
  assert.deepEqual(resolveProgramDayStatus({ ...BASE, dow: 2 }), { kind: 'rest_day' });
  assert.deepEqual(resolveProgramDayStatus({ ...BASE, dow: 0 }), { kind: 'rest_day' });
});

test('completed: today is a training day already marked done', () => {
  assert.deepEqual(resolveProgramDayStatus({ ...BASE, isTodayCompleted: true }), { kind: 'completed' });
});

test('program_complete: current week has passed the program\'s total weeks', () => {
  assert.deepEqual(resolveProgramDayStatus({ ...BASE, currentWeek: 9, weeksTotal: 8 }), { kind: 'program_complete' });
});

test('program_complete takes precedence over a training-day weekday match', () => {
  // Even if today would otherwise be a training day, an over-length program
  // is done -- there is nothing left to start.
  assert.deepEqual(
    resolveProgramDayStatus({ ...BASE, dow: 1, currentWeek: 9, weeksTotal: 8, isTodayCompleted: false }),
    { kind: 'program_complete' }
  );
});

test('empty trainingWeekdays (no schedule resolved) is always a rest day, every day of the week', () => {
  for (let dow = 0; dow <= 6; dow++) {
    assert.deepEqual(resolveProgramDayStatus({ ...BASE, dow, trainingWeekdays: [] }), { kind: 'rest_day' });
  }
});

test('currentWeek === weeksTotal on the final week is still active, not complete', () => {
  assert.deepEqual(resolveProgramDayStatus({ ...BASE, currentWeek: 8, weeksTotal: 8 }), { kind: 'training_day' });
});

// ---------- canStartProgramDay (double-start guard) ----------

test('can start only on a training day with no active session', () => {
  assert.equal(canStartProgramDay({ kind: 'training_day' }, false), true);
});

test('cannot start when a workout session is already active, even on a training day', () => {
  assert.equal(canStartProgramDay({ kind: 'training_day' }, true), false);
});

test('cannot start on rest_day, completed, or program_complete, regardless of active session', () => {
  for (const status of [{ kind: 'rest_day' as const }, { kind: 'completed' as const }, { kind: 'program_complete' as const }]) {
    assert.equal(canStartProgramDay(status, false), false);
    assert.equal(canStartProgramDay(status, true), false);
  }
});

// ---------- resolveScheduledDayIndex (QA-06: weekday -> split day_index) ----------

test('resolveScheduledDayIndex maps a training weekday to its 1-indexed position in the sorted split', () => {
  assert.equal(resolveScheduledDayIndex(1, [1, 3, 5], 3), 1);
  assert.equal(resolveScheduledDayIndex(3, [1, 3, 5], 3), 2);
  assert.equal(resolveScheduledDayIndex(5, [1, 3, 5], 3), 3);
});

test('resolveScheduledDayIndex sorts unordered trainingWeekdays before indexing', () => {
  assert.equal(resolveScheduledDayIndex(1, [5, 1, 3], 3), 1);
  assert.equal(resolveScheduledDayIndex(5, [5, 1, 3], 3), 3);
});

test('resolveScheduledDayIndex returns null when dow is not a training day', () => {
  assert.equal(resolveScheduledDayIndex(2, [1, 3, 5], 3), null);
});

test('resolveScheduledDayIndex returns null for an empty schedule', () => {
  assert.equal(resolveScheduledDayIndex(1, [], 0), null);
});

test('resolveScheduledDayIndex refuses to guess when trainingWeekdays count is fewer than the split day count', () => {
  // Profile has a 3-day explicit schedule but the generated split has 4 days.
  assert.equal(resolveScheduledDayIndex(1, [1, 3, 5], 4), null);
});

test('resolveScheduledDayIndex refuses to guess when trainingWeekdays count exceeds the split day count', () => {
  // Profile has a 5-day explicit schedule but the generated split only has 3 days.
  assert.equal(resolveScheduledDayIndex(1, [1, 2, 3, 4, 5], 3), null);
});

// ---------- resolveProgramDayItems (QA-06: scheduled day -> exercise list) ----------

const DAYS = [
  { day_index: 1, exercises: [{ exercise_name: 'Bench Press', target_sets: 4, target_reps_low: 8 }] },
  { day_index: 2, exercises: [] },
  {
    day_index: 3,
    exercises: [
      { exercise_name: 'Deadlift', target_sets: 3, target_reps_low: 5 },
      { exercise_name: 'Row', target_sets: 3, target_reps_low: 10 },
    ],
  },
];

test('resolveProgramDayItems maps a matching day\'s exercises to lift items', () => {
  assert.deepEqual(resolveProgramDayItems(DAYS, 3), [
    { liftName: 'Deadlift', targetSets: 3, targetReps: 5 },
    { liftName: 'Row', targetSets: 3, targetReps: 10 },
  ]);
});

test('resolveProgramDayItems returns null when the day_index has no exercises', () => {
  assert.equal(resolveProgramDayItems(DAYS, 2), null);
});

test('resolveProgramDayItems returns null when no day matches dayIndex', () => {
  assert.equal(resolveProgramDayItems(DAYS, 99), null);
});

// ---------- resolveHomeStartDecision (QA-06: Home program-card start) ----------

const DECISION_BASE = {
  hasProgram: true,
  status: { kind: 'training_day' as const },
  hasActiveWorkoutSession: false,
  dayIndex: 2,
};

test('scheduled training day with a resolved day index starts that program day', () => {
  assert.deepEqual(resolveHomeStartDecision(DECISION_BASE), { kind: 'start_program_day', dayIndex: 2 });
});

test('rest day falls back to the generic blank-start flow', () => {
  assert.deepEqual(
    resolveHomeStartDecision({ ...DECISION_BASE, status: { kind: 'rest_day' }, dayIndex: null }),
    { kind: 'start_blank' }
  );
});

test('no active program falls back to the generic blank-start flow', () => {
  assert.deepEqual(
    resolveHomeStartDecision({ ...DECISION_BASE, hasProgram: false }),
    { kind: 'start_blank' }
  );
});

test('an active workout session blocks starting a new one, even on a scheduled training day', () => {
  assert.deepEqual(
    resolveHomeStartDecision({ ...DECISION_BASE, hasActiveWorkoutSession: true }),
    { kind: 'blocked' }
  );
});

test('a training day with no resolvable day index falls back to the generic blank-start flow', () => {
  assert.deepEqual(
    resolveHomeStartDecision({ ...DECISION_BASE, dayIndex: null }),
    { kind: 'start_blank' }
  );
});

test('completed or program_complete status falls back to the generic blank-start flow', () => {
  assert.deepEqual(
    resolveHomeStartDecision({ ...DECISION_BASE, status: { kind: 'completed' } }),
    { kind: 'start_blank' }
  );
  assert.deepEqual(
    resolveHomeStartDecision({ ...DECISION_BASE, status: { kind: 'program_complete' } }),
    { kind: 'start_blank' }
  );
});
