import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideRestTimerAction, isGenuineRestCompletion } from '../restTimer.ts';

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
