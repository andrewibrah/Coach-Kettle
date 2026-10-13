import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAndParse } from '../structuredGate.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';

const keywords = ['cardio', 'dropset', 'drop set', 'superset', 'ss', 'warmup', 'warm-up', 'warm up'];

for (const prefix of ['Bench -185 x 8', 'Bench - 185 x 8', 'Bench 185kg', 'Bench 100 oz 8', 'Bench 185 x -8', 'Bench 185 x +8', 'Bench 185 x 8.5', 'Bench 185 x', 'Bench 185 lb', 'Pullups -15', 'Pullups 15.5', 'Pullups 99999999999999999']) {
  for (const keyword of keywords) {
    for (const punctuation of ['', '?', '.']) {
      const input = `  ${prefix} ${keyword} shoulder pain${punctuation}  `;
      test(`malformed prefix cannot be rescued by mode prose: ${JSON.stringify(input)}`, async () => {
        const parsed = decideAndParse(input, { lastExercise: 'Bench' });
        assert.equal(parsed.kind, 'validation');
        if (parsed.kind !== 'validation') throw new Error('Expected validation');
        assert.equal(parsed.originalInput, input);
        assert.equal('rows' in parsed, false);
        const prior = { id: 'prior', exercise: 'Bench', weightLbs: '185', reps: '8', notes: '', set: 1 };
        const result = await runWorkoutRoute(input, [prior]);
        assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
        assert.equal(result.messageInput, input);
        assert.equal(result.calls.filter(c => ['toast', 'bubble'].includes(c.method)).length, 1);
        assert.equal(result.calls.some(c => ['chat', 'logSet', 'syncSkeleton', 'rest', 'pr', 'end'].includes(c.method)), false);
      });
    }
  }
}

const delimiters = [' ', ': ', ' (', '; ', '. ', ' — '];

for (const [input, pattern, count] of [
  ['Bench 185 8 165 10 dropset', 'dropset', 2],
  ['Bench dropset 185 8 165 10', 'dropset', 2],
  ['Bench and Push Ups superset 135 10 0 15', 'superset', 2],
  ['Bench and Push Ups 135 10 0 15 ss', 'superset', 2],
  ['Bench and Push Ups 135 10 0 15 superset', 'superset', 2],
  ['Elliptical 15 min HR 150', 'cardio', 1],
  ['Cardio bike 20 min', 'cardio', 1],
  ['Run 3 miles', 'cardio', 1],
  ['Curls 20 10 warmup', 'warmup', 1],
  ['Pullups 15 warm-up', 'warmup', 1],
  ['Bench 185 8 dropset', 'single', 1],
  ['Pullups 15 ss', 'single', 1],
] as const) {
  test(`intentional legacy mode shape survives: ${input}`, async () => {
    const parsed = decideAndParse(input, {});
    assert.equal(parsed.kind, 'fast');
    if (parsed.kind !== 'fast') throw new Error('Expected fast');
    assert.equal(parsed.meta?.pattern, pattern);
    assert.equal(parsed.rows.length, count);
    const result = await runWorkoutRoute(input);
    assert.equal(result.rows.length, count);
    assert.equal(result.calls.filter(c => c.method === 'logSet').length, count);
    assert.equal(result.calls.some(c => c.method === 'chat'), false);
    if (pattern === 'warmup') assert.equal(result.rows[0].set, 0);
    if (pattern === 'single') assert.equal(result.rows[0].notes, input.endsWith('ss') ? 'ss' : 'dropset');
    if (pattern === 'cardio') assert.equal(result.calls.some(c => c.method === 'rest'), false);
  });
}

for (const [prefix, exercise, weight, reps] of [
  ['Bench 185 8', 'Bench', '185', '8'],
  ['Bench 100kg 5', 'Bench', '220.5', '5'],
  ['Pullups 15', 'Pullups', '0', '15'],
]) {
  for (const keyword of keywords) {
    for (const delimiter of delimiters) {
      const notes = `${delimiter}no pain after ${keyword}${delimiter === ' (' ? ')' : ''}?  `.trimStart();
      const input = prefix + delimiter + `no pain after ${keyword}${delimiter === ' (' ? ')' : ''}?  `;
      test(`annotation cannot select mode: ${JSON.stringify(input)}`, async () => {
        const parsed = decideAndParse(input, {});
        assert.equal(parsed.kind, 'fast');
        if (parsed.kind !== 'fast') throw new Error('Expected fast');
        assert.equal(parsed.rows.length, 1);
        assert.equal(parsed.meta?.pattern, 'single');
        assert.deepEqual(parsed.rows[0], { exercise, weightLbs: weight, reps, notes, kind: 'normal' });
        const prior = { id: 'prior', exercise, weightLbs: weight, reps: '10', notes: 'prior', set: 1 };
        const result = await runWorkoutRoute(input, [prior]);
        assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), prior);
        assert.equal(result.rows.length, 2);
        assert.notEqual(result.rows[1].id, prior.id);
        assert.equal(result.rows[1].notes, notes);
        assert.equal(result.rows[1].set, 2);
        assert.equal(result.messageInput, '');
        const writes = result.calls.filter(c => c.method === 'logSet');
        assert.equal(writes.length, 1);
        assert.equal(writes[0].data.exercise, exercise);
        assert.equal(writes[0].data.weightLbs, weight);
        assert.equal(writes[0].data.reps, reps);
        assert.equal(writes[0].data.notes, notes);
        assert.equal(writes[0].data.isCardio, undefined);
        assert.equal(result.calls.some(c => c.method === 'chat'), false);
      });
    }
  }
}
