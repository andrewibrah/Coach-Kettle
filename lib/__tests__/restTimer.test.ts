import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideRestTimerAction, isCompoundExercise, isGenuineRestCompletion, suggestRestSeconds } from '../restTimer.ts';

// ---------- #3: no auto-start when auto_start_rest_timer is off ----------

test('decideRestTimerAction: off -> "prompt", never "start" (no timer start path fires)', () => {
  assert.equal(decideRestTimerAction(false), 'prompt');
});

test('decideRestTimerAction: on -> "start" (preserves today\'s exact behavior)', () => {
  assert.equal(decideRestTimerAction(true), 'start');
});

// ---------- #8: exactly one haptic-worthy transition per genuine completion ----------

test('isGenuineRestCompletion: running -> done is the only transition that counts', () => {
  assert.equal(isGenuineRestCompletion('running', 'done'), true);
});

test('isGenuineRestCompletion: rehydrating already-done from storage does not re-fire', () => {
  // App relaunches with a timer that already finished while backgrounded —
  // prevKindRef starts as 'idle' (its initial value), state hydrates
  // straight to 'done'. Must not count as a fresh completion.
  assert.equal(isGenuineRestCompletion('idle', 'done'), false);
});

test('isGenuineRestCompletion: paused -> done, idle -> idle, and other transitions do not count', () => {
  assert.equal(isGenuineRestCompletion('paused', 'done'), false);
  assert.equal(isGenuineRestCompletion('idle', 'idle'), false);
  assert.equal(isGenuineRestCompletion('running', 'running'), false);
  assert.equal(isGenuineRestCompletion('done', 'done'), false);
});

// ---------- D07 pending: pin today's name heuristic, not approved policy ----------

test('characterization (D07 pending): Leg press is classified isolation with isolation rest', () => {
  assert.equal(isCompoundExercise('Leg press'), false);
  assert.equal(suggestRestSeconds({ repsLastSet: 8, isCompound: isCompoundExercise('Leg press') }), 90);
});

test('characterization (D07 pending): Lat pulldown is classified isolation with isolation rest', () => {
  assert.equal(isCompoundExercise('Lat pulldown'), false);
  assert.equal(suggestRestSeconds({ repsLastSet: 10, isCompound: isCompoundExercise('Lat pulldown') }), 75);
});
