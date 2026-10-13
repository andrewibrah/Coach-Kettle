import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAndParse } from '../structuredGate.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';

const prior = { id: 'prior', exercise: 'Bench', weightLbs: '135', reps: '8', notes: 'old', set: 1 };
const effects = ['chat', 'logSet', 'syncSkeleton', 'rest', 'pr', 'end'];

for (const subject of ['Shoulder pain', 'Knee soreness', 'Lower back stiffness', 'Elbow aching', 'Wrist numbness', 'Calf cramps']) {
  for (const predicate of ['started 2 days ago', 'began 3 hours ago', 'lasts 4 minutes', 'has persisted for 2 weeks', 'is getting worse after 3 days', 'returned 2 days ago', 'continues for 3 hours', '2 days ago']) {
    for (const punctuation of ['', '?', '.']) {
      const input = subject + ' ' + predicate + punctuation;
      test(`symptom/temporal sentence is answer-only: ${input}`, async () => {
        assert.deepEqual(decideAndParse(input, { lastExercise: 'Bench', currentRows: [prior] }), { kind: 'ai', reason: 'conversational_question' });
        const result = await runWorkoutRoute(input, [prior], { rows: [{ ...prior, id: 'fabricated' }] });
        assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
        assert.equal(result.calls.filter(c => c.method === 'chat').length, 1);
        assert.equal(result.calls.some(c => ['buildRowsFromApi', ...effects.filter(e => e !== 'chat')].includes(c.method)), false);
      });
    }
  }
}

for (const [input, exercise, weight, reps] of [
  ['Pain free press 100kg 5 no pain?', 'Pain free press', '220.5', '5'],
  ['Shoulder press 100 8 pain: 3 out of 10', 'Shoulder press', '100', '8'],
  ['Knee supported row 100 8', 'Knee supported row', '100', '8'],
  ['Andrew custom movement 15 RPE: 9', 'Andrew custom movement', '0', '15'],
  ['Paused dragon flag 15', 'Paused dragon flag', '0', '15'],
  ['Standing calf raise 100 8', 'Standing calf raise', '100', '8'],
  ['Reverse Nordic 15 fatigue 8/10', 'Reverse Nordic', '0', '15'],
]) {
  test(`custom/movement labels retain explicit set intent: ${input}`, async () => {
    const parsed = decideAndParse(input, {});
    assert.equal(parsed.kind, 'fast');
    if (parsed.kind !== 'fast') throw new Error('Expected fast');
    assert.equal(parsed.rows[0].exercise, exercise);
    assert.equal(parsed.rows[0].weightLbs, weight);
    assert.equal(parsed.rows[0].reps, reps);
    const result = await runWorkoutRoute(input);
    assert.equal(result.calls.filter(c => c.method === 'logSet').length, 1);
    assert.equal(result.calls.some(c => c.method === 'chat'), false);
  });
}

for (const label of ['RPE', 'RIR', 'pain', 'fatigue', 'unknown']) {
  for (const separator of [': ', '= ', ' = ', ' (', ' - ', ' — ']) {
    const notes = `${label}${separator}9${separator === ' (' ? ')' : ''} / RIR: 2; no pain?  `;
    test(`punctuated annotation is literal, not a unit or effort measurement: ${notes}`, async () => {
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
      assert.equal(result.rows[1].notes, notes);
      const writes = result.calls.filter(c => c.method === 'logSet');
      assert.equal(writes.length, 1);
      assert.equal(writes[0].data.weightLbs, '0');
      assert.equal(writes[0].data.reps, '15');
      assert.equal(writes[0].data.notes, notes);
      assert.equal(result.calls.some(c => c.method === 'chat'), false);
    });
  }
}

for (const unit of ['g', 'stone', 'grams', 'widgets', 'kilo_grams', 'stone(s)', 'grams.', 'RPE-stone', 'kilo grams', 'kilo custom grams', 'g :', 'widgets =']) {
  for (const separator of ['', 'x ', '× ']) {
    for (const sign of ['-8', '- 8', '+8', '+ 8']) {
      for (const punctuation of ['', '?', '.']) {
        const input = `  Bench 100 ${unit} ${separator}${sign} shoulder pain${punctuation}  `;
        test(`unit-like signed pair retains composer: ${JSON.stringify(input)}`, async () => {
          const parsed = decideAndParse(input, { lastExercise: 'Bench', currentRows: [prior] });
          assert.equal(parsed.kind, 'validation');
          if (parsed.kind !== 'validation') throw new Error('Expected validation');
          assert.equal(parsed.originalInput, input);
          assert.equal('rows' in parsed, false);
          const result = await runWorkoutRoute(input, [prior]);
          assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
          assert.equal(result.messageInput, input);
          assert.equal(result.calls.filter(c => ['toast', 'bubble'].includes(c.method)).length, 1);
          assert.equal(result.calls.some(c => effects.includes(c.method)), false);
        });
      }
    }
  }
}
