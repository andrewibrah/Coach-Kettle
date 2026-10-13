import assert from 'node:assert/strict';
import test from 'node:test';
import * as lift from './liftMatching.ts';

test('liftNameVariants returns the normalized canonical name plus its existing aliases', () => {
  assert.deepEqual(lift.liftNameVariants('  Bench   Press '),
    ['bench press', 'bench', 'flat bench', 'bb bench', 'barbell bench', 'bench presses']);
});
test('liftNameVariants never invents aliases for an unknown lift', () => {
  assert.deepEqual(lift.liftNameVariants('Incline Curl'), ['incline curl']);
});
test('liftNameVariants does not reverse-map an alias to other lifts', () => {
  // "bench" is an alias, not a canonical key: only the typed name is returned.
  assert.deepEqual(lift.liftNameVariants('bench'), ['bench']);
});
test('liftNameVariants returns a copy that cannot mutate the alias table', () => {
  lift.liftNameVariants('Squat').push('leg day');
  assert.deepEqual(lift.liftNameVariants('Squat'), ['squat', 'squats', 'back squat', 'barbell squat']);
});
