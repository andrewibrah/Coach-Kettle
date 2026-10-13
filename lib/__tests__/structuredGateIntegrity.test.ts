import { isPerformedRow } from '../performedSets.ts';
import { numericValue } from '../workoutValidation.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAndParse } from '../structuredGate.ts';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

for (const tail of ['shoulder pain', 'no pain', 'exhausted', 'RPE 9', 'RIR 2', 'RPE 9 / RIR 2 / sharp  shoulder pain; unknown text  ', 'xylophone drill']) {
  test(`single-set tail is retained verbatim: ${tail}`, () => {
    const result = decideAndParse(`Bench 185 8 ${tail}`, {});
    assert.equal(result.kind, 'fast');
    if (result.kind !== 'fast') throw new Error('Expected a fast decision');
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].weightLbs, '185');
    assert.equal(result.rows[0].reps, '8');
    assert.equal(result.rows[0].notes, tail);
  });
}

for (const input of ['Bench 185kg', 'Bench 185 x -8', 'Bench 100 oz 8', 'Bench -185 x 8', 'Bench 185 x 8.5', 'Bench 185 x 8oops', 'Bench - 185 x 8', `Bench ${'9'.repeat(310)} x 8`, 'Bench 185 x 99999999999999999']) {
  test(`malformed set requires clarification without rewriting input: ${input}`, () => {
    const result = decideAndParse(input, {});
    assert.equal(result.kind, 'validation');
    if (result.kind !== 'validation') throw new Error('Expected a validation decision');
    assert.equal(result.originalInput, input);
    assert.equal('rows' in result, false);
  });
}

for (const input of ['Should I bench 185 for 8?', 'Can I do Pullups 15 with pain?', 'How many reps at 185?', 'Bench 185 for 8?', '185 8?', 'My shoulder hurts after 185?']) {
  test(`genuine question remains conversational: ${input}`, () => {
    assert.deepEqual(decideAndParse(input, { lastExercise: 'Bench' }), { kind: 'ai', reason: 'conversational_question' });
  });
}

for (const input of ['Bench 185 x -8 shoulder pain?', 'Bench 100 oz 8 shoulder pain?', 'Bench -185 x 8 shoulder pain?', 'Bench 185 x 8.5 shoulder pain?']) {
  test(`question punctuation cannot bypass malformed set validation: ${input}`, () => {
    const result = decideAndParse(input, {});
    assert.equal(result.kind, 'validation');
    if (result.kind !== 'validation') throw new Error('Expected validation');
    assert.equal(result.originalInput, input);
  });
}

for (const input of ['Bench 185 8 shoulder pain?', 'Pullups 15 no pain?']) {
  test(`valid explicit set retains literal question punctuation: ${input}`, () => {
    const result = decideAndParse(input, {});
    assert.equal(result.kind, 'fast');
    if (result.kind !== 'fast') throw new Error('Expected fast');
    assert.equal(result.rows[0].notes, input.startsWith('Bench') ? 'shoulder pain?' : 'no pain?');
  });
}

for (const [prefix, weight, reps] of [['Bench 185 8', '185', '8'], ['Bench 185 x 8', '185', '8'], ['Pullups 15', '0', '15']]) {
  for (const tail of [' (no pain)', ': shoulder pain?', ' (shoulder pain)?  ', '; exhausted!', '?', ' !', ' — no pain', '. shoulder pain?', '.']) {
    const input = prefix + tail;
    test(`literal annotation boundary logs: ${input}`, () => {
      const result = decideAndParse(input, {});
      assert.equal(result.kind, 'fast');
      if (result.kind !== 'fast') throw new Error('Expected fast');
      assert.equal(result.rows[0].weightLbs, weight);
      assert.equal(result.rows[0].reps, reps);
      assert.equal(result.rows[0].notes, tail.trimStart());
    });
  }
}

for (const input of ['Should I bench 185 for 8?', 'Can I do 15 pullups?', 'Is 185kg too heavy?', 'How many reps?', 'Would 185kg be safe?', 'Could I bench 185 for 8', 'Are 15 pullups enough', 'Does 100 oz make sense?', 'Will 185 x 8 help?', 'Did I do 15 pullups?', 'Bench 185 for 8?', 'My shoulder hurts after 185?', '185kg?', '185 8?']) {
  test(`standalone coaching syntax is not a set label: ${input}`, () => {
    assert.deepEqual(decideAndParse(input, { lastExercise: 'Bench' }), { kind: 'ai', reason: 'conversational_question' });
  });
}

for (const prefix of ['Bench 185kg', 'Bench 185 x -8', 'Bench 100 oz 8', 'Bench -185 x 8', 'Bench 185 x 8.5', 'Bench 185 x', 'Bench 185 lb', 'Bench 185 x +8']) {
  for (const suffix of ['?', ' shoulder pain?', ': shoulder pain?', ' (shoulder pain)?']) {
    const input = prefix + suffix;
    test(`set-intent boundary validates: ${input}`, () => {
      const result = decideAndParse(input, {});
      assert.equal(result.kind, 'validation');
      if (result.kind !== 'validation') throw new Error('Expected validation');
      assert.equal(result.originalInput, input);
    });
  }
}

test('bare-number shorthand retains its existing behavior with surrounding spaces', () => {
  const result = decideAndParse('  8  ', {
    lastExercise: 'Bench',
    currentRows: [{ id: '1', exercise: 'Bench', weightLbs: '185', reps: '10' }],
  });
  assert.equal(result.kind, 'fast');
  if (result.kind !== 'fast') throw new Error('Expected a fast decision');
  assert.equal(result.rows[0].weightLbs, '185');
  assert.equal(result.rows[0].reps, '8');
});

for (const [input, weight, reps] of [
  ['Bench 100kg 5', '220.5', '5'],
  ['Bench 185 x 8', '185', '8'],
  ['Bench 2 plates 8', '225', '8'],
  ['Lat pulldown 120x10', '120', '10'],
  ['Pullups 15', '0', '15'],
  ['Pullups 15  ', '0', '15'],
]) {
  test(`valid existing single-set grammar: ${input}`, () => {
    const result = decideAndParse(input, {});
    assert.equal(result.kind, 'fast');
    if (result.kind !== 'fast') throw new Error('Expected a fast decision');
    assert.equal(result.rows[0].weightLbs, weight);
    assert.equal(result.rows[0].reps, reps);
  });
}

test('existing embedded parser cases (multi, comma, dropset, superset, cardio, skeleton, bare numbers) still pass', () => {
  const source = readFileSync(new URL('../structuredGate.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const warnings: unknown[] = [];
  vm.runInNewContext(code, {
    exports: {}, __DEV__: true,
    require: (name: string) => {
      if (name === './workoutValidation.ts') return { numericValue };
      assert.equal(name, './performedSets.ts');
      return { isPerformedRow };
    },
    console: { warn: (...args: unknown[]) => warnings.push(args), info: () => {} },
  });
  assert.deepEqual(warnings, []);
});
