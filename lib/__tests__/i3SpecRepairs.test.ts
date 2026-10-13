import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAndParse } from '../structuredGate.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';
const prior = { id: 'prior', exercise: 'Bench', set: 1, weightLbs: '100', reps: '8', notes: '', timestamp: 1 };
const invalid = ['-100', '+100', '1e309', '1e2', '8oops', '120,5', '1.2.3', 'NaN', 'Infinity'];
for (const token of invalid) {
  for (const field of [`${token} calories`, `${token} miles`, `HR ${token}`, `level ${token}`, `${token} min`]) {
    const input = `Run 5 min ${field}`;
    test(`whole cardio token rejects ${field} without effects`, async () => {
      const decision = decideAndParse(input, {});
      assert.equal(decision.kind, 'validation', input);
      const route = await runWorkoutRoute(input, [prior]);
      assert.equal(route.messageInput, input);
      assert.deepEqual(route.rows, [prior]);
      assert.equal(route.calls.some(c => ['chat', 'logSet', 'rest', 'pr', 'syncSkeleton', 'buildRowsFromApi'].includes(c.method)), false);
    });
  }
}
test('cardio delimiters, attached units, zero and decimal quantities preserve complete values', () => {
  const decision = decideAndParse('Run 5min, 0miles; HR 120.5, 100calories level 0', {});
  assert.equal(decision.kind, 'fast');
  if (decision.kind !== 'fast') throw new Error('Expected fast');
  const row = decision.rows[0];
  assert.equal(row.durationMins, 5); assert.equal(row.distance, 0);
  assert.equal(row.distanceUnit, 'miles'); assert.equal(row.heartRate, 120.5);
  assert.equal(row.calories, 100); assert.equal(row.level, 0);
});
test('unit boundary permits comma-separated quantities without spaces', () => {
  const result = decideAndParse('Run 5min,2miles', {});
  assert.equal(result.kind, 'fast');
  if (result.kind !== 'fast') throw new Error('Expected fast');
  assert.equal(result.rows[0].durationMins, 5); assert.equal(result.rows[0].distance, 2);
});
test('cardio annotations retain literal numeric prose rather than extract later metrics', () => {
  const input = 'Run 5 min after 8oops miles HR 120,5 shoulder pain?';
  const decision = decideAndParse(input, {});
  assert.equal(decision.kind, 'fast');
  if (decision.kind !== 'fast') throw new Error('Expected fast');
  assert.equal(decision.rows[0].durationMins, 5); assert.equal(decision.rows[0].distance, undefined);
  assert.equal(decision.rows[0].heartRate, undefined);
  assert.equal(decision.rows[0].notes, 'after 8oops miles HR 120,5 shoulder pain?');
});
for (const input of ['Run 5min-100calories', `Run 5 min ${'9'.repeat(310)} calories`, 'Run 5 min 8 yards', 'Run 5 min HR 120,5']) {
  test(`full cardio input recognition ${input}`, async () => {
    const route = await runWorkoutRoute(input, [prior]);
    assert.equal(route.messageInput, input); assert.deepEqual(route.rows, [prior]);
    assert.equal(route.calls.some(c => ['chat', 'logSet', 'rest', 'pr'].includes(c.method)), false);
  });
}
test('cardio-shaped conversation is not logging intent', () => {
  assert.equal(decideAndParse('Should I run 5 min HR 120,5?', {}).kind, 'ai');
});
