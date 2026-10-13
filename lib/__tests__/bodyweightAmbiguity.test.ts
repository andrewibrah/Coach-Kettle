import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAndParse } from '../structuredGate.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';

const prior = { id: 'prior', exercise: 'Bench', weightLbs: '135', reps: '8', notes: 'old', set: 1 };
const effects = ['chat', 'logSet', 'syncSkeleton', 'rest', 'pr', 'end'];

// Arbitrary tokens are deliberate: this must not depend on a weight-unit denylist.
for (const unit of ['g', 'grams', 'stone', 'ounces', 'tonnes', 'mg', 'newtons', 'widgets', 'flibbertigibbet', 'kilo-grams', 'RPE-stone', 'unknown_unit']) {
  for (const punctuation of ['', '?', '.']) {
    for (const rows of [[], [prior]]) {
      const input = `  Bench 100 ${unit} 8 shoulder pain${punctuation}  `;
      test(`ambiguous pair clarifies without inventing data: ${JSON.stringify(input)} prior=${rows.length}`, async () => {
        const parsed = decideAndParse(input, { lastExercise: 'Bench', currentRows: rows });
        assert.equal(parsed.kind, 'validation');
        if (parsed.kind !== 'validation') throw new Error('Expected validation');
        assert.equal(parsed.originalInput, input);
        assert.equal('rows' in parsed, false);
        const result = await runWorkoutRoute(input, rows);
        assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), rows);
        assert.equal(result.messageInput, input);
        assert.equal(result.calls.filter(c => ['toast', 'bubble'].includes(c.method)).length, 1);
        assert.equal(result.calls.some(c => effects.includes(c.method)), false);
      });
    }
  }
}

for (const notes of ['RPE 9', 'RIR 2', 'RPE9 / RIR2?', 'unknown 2 / no pain', 'pain 3 out of 10', 'after 2 min cardio', 'before 2 dropsets', 'during 2 warmups', 'since 2 days ago', 'at 2 minutes', 'shoulder pain after 2 reps?', 'sharp shoulder pain / unknown 2', 'no pain after 2 sets.', '(grams 8?)', ': widgets 8', 'xylophone drill']) {
  test(`explicit bodyweight effort/narrative annotation remains literal: ${notes}`, async () => {
    const input = `Pullups 15 ${notes}`;
    const parsed = decideAndParse(input, {});
    assert.equal(parsed.kind, 'fast');
    if (parsed.kind !== 'fast') throw new Error('Expected fast');
    assert.deepEqual(parsed.rows[0], { exercise: 'Pullups', weightLbs: '0', reps: '15', notes, kind: 'normal' });
    const existing = { ...prior, exercise: 'Pullups', weightLbs: '0' };
    const result = await runWorkoutRoute(input, [existing]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), existing);
    assert.equal(result.rows.length, 2);
    assert.notEqual(result.rows[1].id, existing.id);
    const writes = result.calls.filter(c => c.method === 'logSet');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.weightLbs, '0');
    assert.equal(writes[0].data.reps, '15');
    assert.equal(writes[0].data.notes, notes);
    assert.equal(result.calls.some(c => c.method === 'chat'), false);
  });
}

for (const [unit, weight] of [['lb', '100'], ['lbs', '100'], ['kg', '220.5'], ['kgs', '220.5'], ['plate', '9045'], ['plates', '9045']]) {
  test(`supported number-unit-number pairs remain weighted: ${unit}`, async () => {
    const notes = 'shoulder pain after 2 reps?';
    const input = `Bench 100 ${unit} 8 ${notes}`;
    const parsed = decideAndParse(input, {});
    assert.equal(parsed.kind, 'fast');
    if (parsed.kind !== 'fast') throw new Error('Expected fast');
    assert.equal(parsed.rows[0].weightLbs, weight);
    assert.equal(parsed.rows[0].reps, '8');
    assert.equal(parsed.rows[0].notes, notes);
    const result = await runWorkoutRoute(input, [prior]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), prior);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[1].weightLbs, weight);
    assert.equal(result.rows[1].reps, '8');
    assert.equal(result.rows[1].notes, notes);
    assert.equal(result.calls.filter(c => c.method === 'logSet').length, 1);
    assert.equal(result.calls.some(c => c.method === 'chat'), false);
  });
}

for (const unit of ['grams.', 'kilo_grams', 'stone(s)']) {
  test(`unit-shaped token punctuation cannot hide pair ambiguity: ${unit}`, async () => {
    const input = `Pullups 100 ${unit} 8 no pain?`;
    assert.equal(decideAndParse(input, {}).kind, 'validation');
    const result = await runWorkoutRoute(input, [prior]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
    assert.equal(result.messageInput, input);
    assert.equal(result.calls.some(c => effects.includes(c.method)), false);
  });
}

test('apparent unsupported number-unit-number pair cannot become bodyweight plus prose', async () => {
  const input = 'Bench 100 g 8 shoulder pain';
  const parsed = decideAndParse(input, {});
  assert.equal(parsed.kind, 'validation');
  if (parsed.kind !== 'validation') throw new Error('Expected validation');
  assert.equal(parsed.originalInput, input);
  assert.equal('rows' in parsed, false);
});

test('actual route keeps unsupported pair input without effects', async () => {
  const input = 'Bench 100 g 8 shoulder pain';
  const result = await runWorkoutRoute(input, [prior]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
  assert.equal(result.messageInput, input);
  assert.equal(result.calls.filter(c => ['toast', 'bubble'].includes(c.method)).length, 1);
  assert.equal(result.calls.some(c => effects.includes(c.method)), false);
});
