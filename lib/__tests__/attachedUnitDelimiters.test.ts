import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAndParse } from '../structuredGate.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';

const prior = { id: 'prior', exercise: 'Bench', weightLbs: '135', reps: '8', notes: 'old', set: 1 };
const effects = ['chat', 'logSet', 'syncSkeleton', 'rest', 'pr', 'end'];

async function assertClarifies(input: string, rows: any[]) {
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
}

for (const input of ['Bench 100 g:8 shoulder pain', 'Bench 100 grams=8 shoulder pain', 'Bench 100 widgets:-8 shoulder pain?', 'Bench 100 widgets=+8 no pain']) {
  for (const rows of [[], [prior]]) {
    test(`quality-review R1 reproduction: ${input} prior=${rows.length}`, async () => {
      await assertClarifies(input, rows);
    });
  }
}

for (const input of ['Bench 100 g:8 shoulder pain', 'Bench 100 grams=8 shoulder pain', 'Bench 100 widgets:-8 shoulder pain?', 'Bench 100 widgets=+8 no pain']) {
  test(`actual-route R1 failure-first reproduction: ${input}`, async () => {
    const result = await runWorkoutRoute(input, [prior]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
    assert.equal(result.messageInput, input);
    assert.equal(result.calls.filter(c => ['toast', 'bubble'].includes(c.method)).length, 1);
    assert.equal(result.calls.some(c => effects.includes(c.method)), false);
  });
}

// Colon/equal terminates the ambiguous label even without whitespace. A failed
// weighted pair cannot use that delimiter/sign/separator to hide in bodyweight
// notes. Cross-product both sides' spacing, signs, x/× and literal disclosures.
for (const unit of ['g', 'grams', 'widgets', 'kilo custom grams']) {
  for (const delimiter of [':', ': ', ' : ', '=', '= ', ' = ']) {
    for (const separator of ['', 'x ', '× ']) {
      for (const sign of ['', '-', '- ', '+', '+ ']) {
        for (const disclosure of ['shoulder pain?', 'no pain.']) {
          const input = `  Bench 100 ${unit}${delimiter}${separator}${sign}8 ${disclosure}  `;
          test(`attached/spaced unit numeric attempt clarifies: ${JSON.stringify(input)}`, async () => {
            await assertClarifies(input, [prior]);
          });
        }
      }
    }
  }
}

// Explicit annotation delimiters and complete positive annotation labels remain
// literal notes, not interpreted effort measurements or newly valid weight units.
for (const notes of ['RPE:9', 'RIR=2', 'unknown 2', 'fatigue=8', 'pain:3', ': widgets=+8 no pain', '(g:8 shoulder pain)', '; widgets:-8?', 'shoulder pain after 2 reps?', 'no pain after 2 sets.']) {
  for (const [prefix, exercise, weight, reps] of [
    ['Pullups 15', 'Pullups', '0', '15'],
    ['Andrew custom movement 15', 'Andrew custom movement', '0', '15'],
    ['Bench 100 8', 'Bench', '100', '8'],
  ]) {
    test(`annotation control remains exact: ${prefix} ${notes}`, async () => {
      const input = `${prefix} ${notes}`;
      const parsed = decideAndParse(input, {});
      assert.equal(parsed.kind, 'fast');
      if (parsed.kind !== 'fast') throw new Error('Expected fast');
      assert.deepEqual(parsed.rows[0], { exercise, weightLbs: weight, reps, notes, kind: 'normal' });
      const existing = { ...prior, exercise, weightLbs: weight };
      const result = await runWorkoutRoute(input, [existing]);
      assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), existing);
      assert.equal(result.rows.length, 2);
      assert.notEqual(result.rows[1].id, existing.id);
      const writes = result.calls.filter(c => c.method === 'logSet');
      assert.equal(writes.length, 1);
      assert.equal(writes[0].data.weightLbs, weight);
      assert.equal(writes[0].data.reps, reps);
      assert.equal(writes[0].data.notes, notes);
      assert.equal(result.calls.some(c => c.method === 'chat'), false);
    });
  }
}
