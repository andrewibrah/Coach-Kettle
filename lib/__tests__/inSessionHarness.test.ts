import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkoutRoute } from './inSessionHarness.ts';

// A response bubble alone is not success: the actual route must also reach
// its storage seam without falling into sendMessage's hidden catch.
test('successful actual-route answer saves chat history without entering catch', async () => {
  const input = 'Should I bench 185 for 8?';
  const answer = 'Use a comfortable load and stop if it hurts.';
  const result = await runWorkoutRoute(input, [], { answer });
  assert.equal(result.calls.filter(c => c.method === 'chat').length, 1);
  assert.equal(result.calls.find(c => c.method === 'bubble')?.data, answer);
  const saves = result.calls.filter(c => c.method === 'saveWorkoutChatQA');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].data.question, input);
  assert.equal(saves[0].data.answer, answer);
  assert.equal(Number.isFinite(saves[0].data.timestamp), true);
  assert.equal(result.calls.some(c => ['warning', 'error'].includes(c.method)), false);
  assert.deepEqual(result.calls.filter(c => c.method === 'loading').map(c => c.data), [true, false]);
  assert.equal(result.calls.some(c => ['logSet', 'syncSkeleton', 'rest', 'pr', 'end'].includes(c.method)), false);
});

test('unexpected errors caught inside the actual route reject the harness', async () => {
  // Even an error with the deliberate provider fixture's text must surface;
  // only the known fixture object is intentional, not arbitrary caught errors.
  const unexpected = new Error('offline fixture forbids AI');
  const response = { get answer() { throw unexpected; } };
  await assert.rejects(runWorkoutRoute('How many reps?', [], response), (error: unknown) => error === unexpected);
});

test('deliberate offline provider-error fixture remains observable without failing the harness', async () => {
  const result = await runWorkoutRoute('How many reps?');
  assert.equal(result.calls.filter(c => c.method === 'chat').length, 1);
  assert.equal(result.calls.filter(c => c.method === 'warning').length, 1);
  assert.deepEqual(result.calls.filter(c => c.method === 'loading').map(c => c.data), [true, false]);
});

for (const tail of ['shoulder pain', 'no pain', 'exhausted', 'RPE 9', 'RIR 2', 'RPE 9 / RIR 2 / sharp  shoulder pain; unknown text  ']) {
  test(`actual route retains disclosed tail on a NEW set: ${tail}`, async () => {
    const prior = { id: 'prior', exercise: 'Bench', weightLbs: '135', reps: '10', notes: '', set: 1 };
    const result = await runWorkoutRoute(`Bench 185 8 ${tail}`, [prior]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), prior);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[1].notes, tail);
    const writes = result.calls.filter(c => c.method === 'logSet');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.notes, tail);
    assert.equal(writes[0].data.weightLbs, '185');
    assert.equal(writes[0].data.reps, '8');
    assert.equal(result.calls.some(c => c.method === 'chat'), false);
  });
}

test('actual route logs a new explicit set with question punctuation in disclosure', async () => {
  const prior = { id: 'prior', exercise: 'Bench', weightLbs: '135', reps: '10', notes: '', set: 1 };
  const result = await runWorkoutRoute('Bench 185 8 shoulder pain?', [prior]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), prior);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].notes, 'shoulder pain?');
  assert.equal(result.calls.filter(c => c.method === 'logSet').length, 1);
  assert.equal(result.calls.find(c => c.method === 'logSet')?.data.notes, 'shoulder pain?');
  assert.equal(result.calls.some(c => c.method === 'chat'), false);
});

for (const tail of ['no pain', 'exhausted', 'sharp  shoulder pain; unknown text  ', 'RPE 9 / RIR 2', 'sharp shoulder pain / unknown 2', 'RPE 9?']) {
  test(`actual route appends explicit bodyweight set with literal notes: ${tail}`, async () => {
    const prior = { id: 'prior', exercise: 'Pullups', weightLbs: '0', reps: '10', notes: '', set: 1 };
    const result = await runWorkoutRoute(`Pullups 15 ${tail}`, [prior]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), prior);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[1].weightLbs, '0');
    assert.equal(result.rows[1].reps, '15');
    assert.equal(result.rows[1].notes, tail);
    const writes = result.calls.filter(c => c.method === 'logSet');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.notes, tail);
    assert.equal(writes[0].data.weightLbs, '0');
    assert.equal(writes[0].data.reps, '15');
    assert.equal(result.calls.some(c => c.method === 'chat'), false);
  });
}

for (const input of ['Should I bench 185 for 8?', 'Bench 185 for 8?', 'How many reps at 185?']) {
  test(`actual route leaves genuine numerical question to AI without set writes: ${input}`, async () => {
    const result = await runWorkoutRoute(input);
    assert.equal(result.rows.length, 0);
    assert.equal(result.calls.filter(c => c.method === 'chat').length, 1);
    assert.equal(result.calls.some(c => ['logSet', 'syncSkeleton', 'rest', 'pr', 'end'].includes(c.method)), false);
  });
}

for (const input of ['  Bench 185kg  ', 'Bench 185 x -8', 'Bench 100 oz 8', 'Bench -185 x 8', 'Bench 185 x -8 shoulder pain?', 'Bench 100 oz 8 shoulder pain?', 'Bench -185 x 8 shoulder pain?', 'Bench 185 x 8.5 shoulder pain?']) {
  for (const rows of [[], [{ id: 'prior', exercise: 'Bench', weightLbs: '185', reps: '8', notes: '', set: 1 }]]) {
    test(`actual workout route clarifies and retains ${JSON.stringify(input)} (${rows.length} existing rows)`, async () => {
      const result = await runWorkoutRoute(input, rows);
      assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), rows);
      assert.equal(result.messageInput, input);
      assert.equal(result.calls.filter(c => c.method === 'toast' || c.method === 'bubble').length, 1);
      assert.equal(result.calls.some(c => ['chat', 'logSet', 'syncSkeleton', 'rest', 'pr', 'end'].includes(c.method)), false);
    });
  }
}

for (const [prefix, exercise, weight, reps] of [['Bench 185 8', 'Bench', '185', '8'], ['Bench 185 x 8', 'Bench', '185', '8'], ['Pullups 15', 'Pullups', '0', '15']]) {
  for (const tail of [' (no pain)', ': shoulder pain?', ' (shoulder pain)?  ', '; exhausted!', '?', ' !', ' — no pain', '. shoulder pain?', '.']) {
    const input = prefix + tail;
    test(`actual route logs literal annotation boundary: ${input}`, async () => {
      const prior = { id: 'prior', exercise, weightLbs: weight, reps: '10', notes: '', set: 1 };
      const result = await runWorkoutRoute(input, [prior]);
      assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), prior);
      assert.equal(result.rows.length, 2);
      assert.notEqual(result.rows[1].id, prior.id);
      assert.equal(result.rows[1].notes, tail.trimStart());
      const writes = result.calls.filter(c => c.method === 'logSet');
      assert.equal(writes.length, 1);
      assert.equal(writes[0].data.notes, tail.trimStart());
      assert.equal(writes[0].data.weightLbs, weight);
      assert.equal(writes[0].data.reps, reps);
      assert.equal(result.calls.some(c => c.method === 'chat'), false);
      assert.equal(result.messageInput, '');
    });
  }
}

for (const input of ['Should I bench 185 for 8?', 'Can I do 15 pullups?', 'Is 185kg too heavy?', 'How many reps?', 'Would 185kg be safe?', 'Could I bench 185 for 8', 'Are 15 pullups enough', 'Does 100 oz make sense?', 'Will 185 x 8 help?', 'Did I do 15 pullups?', 'Bench 185 for 8?', 'My shoulder hurts after 185?', '185kg?', '185 8?']) {
  test(`actual route preserves standalone question compatibility: ${input}`, async () => {
    const prior = { id: 'prior', exercise: 'Bench', weightLbs: '185', reps: '8', notes: '', set: 1 };
    const result = await runWorkoutRoute(input, [prior]);
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
    assert.equal(result.calls.filter(c => c.method === 'chat').length, 1);
    assert.equal(result.calls.some(c => ['logSet', 'syncSkeleton', 'rest', 'pr', 'end'].includes(c.method)), false);
  });
}

for (const prefix of ['Bench 185kg', 'Bench 185 x -8', 'Bench 100 oz 8', 'Bench -185 x 8', 'Bench 185 x 8.5', 'Bench 185 x', 'Bench 185 lb', 'Bench 185 x +8']) {
  for (const suffix of ['?', ' shoulder pain?', ': shoulder pain?', ' (shoulder pain)?']) {
    const input = `  ${prefix}${suffix}  `;
    test(`actual route preserves malformed punctuation boundary: ${input}`, async () => {
      const prior = { id: 'prior', exercise: 'Bench', weightLbs: '185', reps: '8', notes: '', set: 1 };
      const result = await runWorkoutRoute(input, [prior]);
      assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
      assert.equal(result.messageInput, input);
      assert.equal(result.calls.filter(c => c.method === 'toast' || c.method === 'bubble').length, 1);
      assert.equal(result.calls.some(c => ['chat', 'logSet', 'syncSkeleton', 'rest', 'pr', 'end'].includes(c.method)), false);
    });
  }
}

for (const narrative of ['Shoulder pain after 185', 'No pain at 185', 'Exhausted after 185', 'Our shoulders hurt at 185', 'The shoulder hurts after 185', 'Shoulder hurts after 185', 'After cardio I felt pain at 185', 'Yesterday I did Bench 185 8', 'Bench felt painful at 185', "I've felt pain at 185", 'My shoulder hurts after 185', 'I felt pain at 185', 'We did 185 x 8 yesterday', 'You suggested 185 for 8', 'This felt hard at 185', 'That hurt after 15 pullups', 'It hurts after 185']) {
  for (const punctuation of ['', '?', '.']) {
    const input = narrative + punctuation;
    test(`narrative intent is independent of punctuation: ${input}`, async () => {
      const prior = { id: 'prior', exercise: 'Bench', weightLbs: '185', reps: '8', notes: '', set: 1 };
      const result = await runWorkoutRoute(input, [prior]);
      assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
      assert.equal(result.calls.filter(c => c.method === 'chat').length, 1);
      assert.equal(result.calls.some(c => ['logSet', 'syncSkeleton', 'rest', 'pr', 'end'].includes(c.method)), false);
    });
  }
}

for (const input of ['My shoulder hurts after 185', 'I felt pain at 185?', 'Should I bench 185 for 8?']) {
  test(`conversational intent cannot accept model-fabricated sets: ${input}`, async () => {
    const prior = { id: 'prior', exercise: 'Bench', weightLbs: '135', reps: '8', notes: '', set: 1 };
    const result = await runWorkoutRoute(input, [prior], { rows: [{ ...prior, id: 'fabricated', weightLbs: '185' }] });
    assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), [prior]);
    assert.equal(result.calls.filter(c => c.method === 'chat').length, 1);
    assert.equal(result.calls.some(c => ['buildRowsFromApi', 'logSet', 'syncSkeleton', 'rest', 'pr', 'end'].includes(c.method)), false);
  });
}

test('actual workout route still logs a valid kg set', async () => {
  const result = await runWorkoutRoute('Bench 100kg 5');
  assert.equal(result.rows[0].weightLbs, '220.5');
  assert.equal(result.rows[0].reps, '5');
  assert.equal(result.messageInput, '');
  assert.equal(result.calls.filter(c => c.method === 'logSet').length, 1);
  assert.equal(result.calls.some(c => c.method === 'chat'), false);
});

test('actual route retains disclosed tail when filling a row with existing notes', async () => {
  const result = await runWorkoutRoute('Bench 185 8 sharp  shoulder pain / RPE 9', [
    { id: 'planned', exercise: 'Bench', weightLbs: '', reps: '10', notes: 'planned note', set: 1 },
  ]);
  assert.equal(result.rows[0].notes, 'planned note\nsharp  shoulder pain / RPE 9');
  assert.equal(result.calls.some(c => c.method === 'chat'), false);
});
