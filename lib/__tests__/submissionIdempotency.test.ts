import test from 'node:test';
import assert from 'node:assert/strict';
import { runWorkoutRoute } from './inSessionHarness.ts';

const logs = (result: any) => result.calls.filter((call: any) => call.method === 'logSet');

test('same-render button and keyboard fast submissions create one row and one log', async () => {
  const result = await runWorkoutRoute('Bench 185 8', [], undefined, 2, true);
  assert.equal(result.rows.length, 1);
  assert.equal(logs(result).length, 1);
  assert.equal(result.calls.filter(call => call.method === 'rest').length, 1);
});

test('same-render skeleton submissions keep the original row identity and log once', async () => {
  const row = { id: 'skeleton-id', exercise: 'Bench', set: 1, weightLbs: '', reps: '', notes: '', timestamp: 1, status: 'committed', performance: 'planned', plannedTarget: { weightLbs: '185', reps: '10' } };
  const result = await runWorkoutRoute('185 8', [row], undefined, 2, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, row.id);
  assert.equal(result.rows[0].reps, '8');
  assert.equal(logs(result).length, 1);
});

test('same-render AI submissions create one request, one committed row and one log', async () => {
  const result = await runWorkoutRoute('Bench and Squat 185 8', [], { rows: [{ exercise: 'Bench', set: 1, weightLbs: '185', reps: '8', notes: '' }] }, 2, true);
  assert.equal(result.calls.filter(call => call.method === 'chat').length, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].status, 'committed');
  assert.equal(logs(result).length, 1);
});

test('an identical legitimate set on the next render has a distinct stable identity', async () => {
  const first = await runWorkoutRoute('Bench 185 8', [], undefined, 2);
  const second = await runWorkoutRoute('Bench 185 8', first.rows, undefined, 2);
  assert.equal(second.rows.length, 2);
  assert.equal(second.rows[0].id, first.rows[0].id);
  assert.notEqual(second.rows[1].id, first.rows[0].id);
  assert.equal(logs(first).length, 1);
  assert.equal(logs(second).length, 1);
});
