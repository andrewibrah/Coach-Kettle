import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveProgramDayStatus, canStartProgramDay } from '../programSchedule.ts';

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
