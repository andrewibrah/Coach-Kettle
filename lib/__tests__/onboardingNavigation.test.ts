import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ONBOARDING_ROUTES,
  resolveOnboardingRoute,
  resolveWorkoutSetupBack,
  resolvePreviousOnboardingRoute,
} from '../onboardingNavigation.ts';

test('fixed route table includes each step and complete in order', () => {
  assert.deepEqual(ONBOARDING_ROUTES, [
    '/onboarding/height', '/onboarding/age', '/onboarding/current-weight',
    '/onboarding/goal-weight', '/onboarding/focus', '/onboarding/pr-lifts',
    '/onboarding/pr-values', '/onboarding/workout-setup', '/onboarding/complete',
  ]);
});

test('current_step counts completed steps for every valid value', () => {
  const expected = [
    '/onboarding/height', '/onboarding/age', '/onboarding/current-weight',
    '/onboarding/goal-weight', '/onboarding/focus', '/onboarding/pr-lifts',
    '/onboarding/pr-values', '/onboarding/workout-setup', '/onboarding/complete',
  ];
  for (const [current_step, route] of expected.entries()) {
    assert.equal(resolveOnboardingRoute({ current_step, tracked_lifts: ['Squat'] }), route);
  }
});

test('step six skips PR values only when tracked lifts are absent or empty', () => {
  for (const tracked_lifts of [undefined, null, [], ['Squat']]) {
    assert.equal(resolveOnboardingRoute({ current_step: 6, tracked_lifts }),
      tracked_lifts?.length ? '/onboarding/pr-values' : '/onboarding/workout-setup');
    assert.equal(resolveOnboardingRoute({ current_step: 7, tracked_lifts }), '/onboarding/workout-setup');
    assert.equal(resolveOnboardingRoute({ current_step: 8, tracked_lifts }), '/onboarding/complete');
  }
});

test('missing drafts and invalid completed-step counts restart at height', () => {
  assert.equal(resolveOnboardingRoute(), '/onboarding/height');
  assert.equal(resolveOnboardingRoute(null), '/onboarding/height');
  assert.equal(resolveOnboardingRoute({}), '/onboarding/height');
  for (const current_step of [undefined, null, -1, 9, 100, 0.5, 6.5, NaN, Infinity, -Infinity, '6', '', true, {}, []]) {
    assert.equal(resolveOnboardingRoute({ current_step }), '/onboarding/height');
  }
});

test('completed profile takes precedence over all draft progress', () => {
  for (const current_step of [undefined, 0, 6, 8, -1, 'bad']) {
    assert.equal(resolveOnboardingRoute({ current_step }, { onboarding_completed: true }), '/(tabs)');
  }
  assert.equal(resolveOnboardingRoute(null, { onboarding_completed: true }), '/(tabs)');
  assert.equal(resolveOnboardingRoute({ current_step: 1 }, { onboarding_completed: false }), '/onboarding/age');
});

test('semantic Back resolves every screen independently of navigation history', () => {
  const cases = [
    ['/onboarding/height', '/onboarding'],
    ['/onboarding/age', '/onboarding/height'],
    ['/onboarding/current-weight', '/onboarding/age'],
    ['/onboarding/goal-weight', '/onboarding/current-weight'],
    ['/onboarding/focus', '/onboarding/goal-weight'],
    ['/onboarding/pr-lifts', '/onboarding/focus'],
    ['/onboarding/pr-values', '/onboarding/pr-lifts'],
  ] as const;
  for (const [route, previous] of cases) {
    assert.equal(resolvePreviousOnboardingRoute(route), previous);
    assert.equal(resolvePreviousOnboardingRoute(route, ['Squat']), previous);
  }
  for (const lifts of [undefined, null, []]) {
    assert.equal(resolvePreviousOnboardingRoute('/onboarding/workout-setup', lifts), '/onboarding/pr-lifts');
  }
  assert.equal(resolvePreviousOnboardingRoute('/onboarding/workout-setup', ['Squat']), '/onboarding/pr-values');
});

test('resolvers accept frozen inputs without changing them', () => {
  const tracked_lifts = Object.freeze(['Squat']);
  const draft = Object.freeze({ current_step: 6, tracked_lifts });
  const profile = Object.freeze({ onboarding_completed: false });
  assert.equal(resolveOnboardingRoute(draft, profile), '/onboarding/pr-values');
  assert.equal(resolvePreviousOnboardingRoute('/onboarding/workout-setup', tracked_lifts), '/onboarding/pr-values');
  assert.deepEqual(draft, { current_step: 6, tracked_lifts: ['Squat'] });
  assert.deepEqual(profile, { onboarding_completed: false });
});


test('workout setup Back resolves local steps before leaving the screen', () => {
  for (const trackedLifts of [undefined, null, [], ['Squat']]) {
    assert.deepEqual(resolveWorkoutSetupBack('lifts', trackedLifts), { step: 'name' });
    assert.deepEqual(resolveWorkoutSetupBack('name', trackedLifts), { step: 'initial' });
    assert.deepEqual(resolveWorkoutSetupBack('addMore', trackedLifts), { step: 'initial' });
    assert.deepEqual(resolveWorkoutSetupBack('initial', trackedLifts), {
      route: trackedLifts?.length ? '/onboarding/pr-values' : '/onboarding/pr-lifts',
    });
  }
});

test('Back from a saved workout only changes the step and retains templates', () => {
  const savedWorkouts = Object.freeze([{ name: 'Push', lifts: [] }]);
  const state = Object.freeze({ step: 'addMore' as const, savedWorkouts });
  const next = { ...state, ...resolveWorkoutSetupBack(state.step, Object.freeze(['Squat'])) };
  assert.equal(next.step, 'initial');
  assert.equal(next.savedWorkouts, savedWorkouts);
  assert.equal(next.savedWorkouts.length, 1);
});
