import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceClosure, runEnd } from './workoutIdentityHarness.ts';
const plain = (value: any) => JSON.parse(JSON.stringify(value));
export const bike = { id: 'parsed-bike', exercise: 'Bike', set: 1, weightLbs: '', reps: '', notes: 'literal', timestamp: 0, isCardio: true, setKind: 'cardio', durationMins: 0, distance: 0, distanceUnit: 'km', heartRate: 0, calories: 0, level: 0 };

test('actual API ingestion keeps canonical cardio evidence and classifies actual versus planned', () => {
  const build = sourceClosure('buildRowsFromApi', {});
  const [actual, planned, legacy] = plain(build([bike, { ...bike, id: 'planned', performance: 'planned', plannedTarget: { reps: '20', weightLbs: '' } }, { exercise: 'Bench', set: 2, weightLbs: '0', reps: '0', notes: '', isCardio: false }]));
  assert.deepEqual(actual, { ...bike, status: 'committed', performance: 'performed' });
  assert.equal(planned.performance, 'planned');
  assert.deepEqual(planned.plannedTarget, { reps: '20', weightLbs: '' });
  assert.equal(legacy.isCardio, false); assert.equal(legacy.performance, 'performed');
  assert.equal('durationMins' in legacy, false);
});

test('actual End saves cardio-only performance without requesting a strength review', async () => {
  const rows = sourceClosure('buildRowsFromApi', {})([bike]);
  const calls = await runEnd(rows);
  assert.equal(calls.filter(c => c.method === 'save').length, 1);
  assert.equal(calls.filter(c => c.method === 'review').length, 0);
});
