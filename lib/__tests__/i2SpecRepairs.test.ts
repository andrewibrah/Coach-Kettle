import assert from 'node:assert/strict';
import test from 'node:test';
import { decideAndParse } from '../structuredGate.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';
import { runEnd, sourceClosure, sourceModule, renderWorkoutCard } from './workoutIdentityHarness.ts';
import { performedRows, isPendingSet } from '../performedSets.ts';

const work = (extra: any = {}) => ({ id: 'source', exercise: 'Bench', set: 1, weightLbs: '185', reps: '8', notes: '', timestamp: 1, status: 'committed', performance: 'performed', setKind: 'work', ...extra });
const ghost = work({ id: 'ghost', weightLbs: '...', reps: '...', status: 'syncing', performance: undefined });
const effects = (result: any, method: string) => result.calls.filter((call: any) => call.method === method);

for (const complete of [false, true]) {
  for (const incompleteLast of [false, true]) {
    test(`real AI builder/composer keeps incomplete row pending, lifecycle intact; complete=${complete}, incompleteLast=${incompleteLast}`, async () => {
      const incomplete = { exercise: 'Bench', set: 1, weightLbs: 185, reps: '', notes: 'load only' };
      const responseRows = complete ? [incomplete, { exercise: 'Squat', set: 1, weightLbs: 185, reps: 8, notes: '' }] : [incomplete];
      if (incompleteLast) responseRows.reverse();
      const result = await runWorkoutRoute('Bench and Squat 185 8', [], { rows: responseRows });
      assert.equal(effects(result, 'buildRowsFromApi').length, 1);
      assert.equal(result.rowTransitions[0][0].status, 'syncing');
      assert.equal(result.rows.length, responseRows.length);
      assert.equal(result.rows.some((r: any) => r.status === 'syncing'), false);
      const pending = result.rows.find((r: any) => r.exercise === 'Bench');
      assert.equal(pending.weightLbs, '185');
      assert.equal(pending.reps, '');
      assert.equal(effects(result, 'logSet').length, complete ? 1 : 0);
      assert.equal(effects(result, 'rest').length, complete ? 1 : 0);
      assert.equal(pending.performance, 'planned');
      assert.equal(isPendingSet(pending), true);
      assert.match(JSON.stringify(renderWorkoutCard(pending)), /Planned/);
      assert.deepEqual(effects(result, 'loading').map((c: any) => c.data), [true, false]);
      assert.equal(result.messageInput, '');
      if (complete) {
        assert.equal(effects(result, 'logSet')[0].data.exercise, 'Squat');
        assert.equal(effects(result, 'rest')[0].data.exercise, 'Squat');
      }
      const ended = await runEnd(result.rows);
      const saved = ended.find(c => c.method === 'save');
      assert.equal(saved?.payload.rows.length ?? 0, complete ? 1 : 0);
      if (complete) assert.equal(saved.payload.rows[0].exercise, 'Squat');
    });
  }
}

test('actual AI builder preserves valid zero and incomplete values without invented reps', () => {
  const build = sourceClosure('buildRowsFromApi', {});
  const rows = build([{ exercise: 'Bench', set: 1, weightLbs: 185 }, { exercise: 'Pullups', set: 1, weightLbs: 0, reps: 8 }]);
  assert.equal(rows[0].reps, '');
  assert.equal(rows[0].performance, 'planned');
  assert.equal(rows[1].weightLbs, '0');
  assert.equal(rows[1].performance, 'performed');
  assert.deepEqual(Array.from(performedRows(rows), (r: any) => r.exercise), ['Pullups']);
});

test('ghost-only same clarifies without composer, live or End fabrication', async () => {
  const result = await runWorkoutRoute('same', [ghost]);
  assert.deepEqual(Array.from(result.rows), [ghost]);
  assert.equal(result.messageInput, 'same');
  assert.equal(effects(result, 'toast').length, 1);
  for (const method of ['chat', 'logSet', 'rest', 'pr', 'end']) assert.equal(effects(result, method).length, 0);
  assert.equal((await runEnd(result.rows)).filter(c => c.method === 'save').length, 0);
});

for (const input of ['same', '6', '200']) {
  test(`eligible source wins over trailing ghost for ${input}`, async () => {
    const source = work();
    const trailing = { ...ghost, exercise: 'Squat' };
    const result = await runWorkoutRoute(input, [source, trailing]);
    assert.equal(result.rows.length, 3);
    assert.deepEqual(result.rows[0], source);
    assert.deepEqual(result.rows[1], trailing);
    const repeated = result.rows[2];
    assert.notEqual(repeated.id, source.id);
    assert.equal(repeated.exercise, 'Bench');
    assert.equal(repeated.weightLbs, input === '200' ? '200' : '185');
    assert.equal(repeated.reps, input === '6' ? '6' : '8');
    assert.equal(effects(result, 'logSet').length, 1);
    assert.equal(effects(result, 'rest').length, 1);
  });
}

for (const source of [ghost, work({ weightLbs: '185', reps: '' }), work({ weightLbs: '...', reps: '...' }), work({ weightLbs: 'NaN' }), work({ reps: '8foo' }), work({ weightLbs: '-1' })]) {
  for (const input of ['same', '6', '200']) {
    test(`invalid history ${source.weightLbs}/${source.reps}/${source.status} cannot fabricate ${input}`, async () => {
      const result = await runWorkoutRoute(input, [source]);
      assert.deepEqual(Array.from(result.rows), [source]);
      assert.equal(result.messageInput, input);
      assert.equal(effects(result, 'toast').length, 1);
      for (const method of ['chat', 'logSet', 'rest', 'pr', 'end']) assert.equal(effects(result, method).length, 0);
      assert.equal((await runEnd(result.rows)).filter(c => c.method === 'save').length, 0);
    });
  }
}

test('same preserves warmup classification through parser, composer, resequence, live and End', async () => {
  const first = await runWorkoutRoute('Bench 95 10 warmup');
  const source = structuredClone(first.rows[0]);
  const parsed = decideAndParse('same', { currentRows: [source] });
  assert.equal(parsed.kind, 'fast');
  if (parsed.kind !== 'fast') return;
  assert.equal(parsed.rows[0].kind, 'warmup');
  const result = await runWorkoutRoute('same', first.rows);
  assert.equal(result.rows.length, 2);
  assert.notEqual(result.rows[1].id, source.id);
  assert.deepEqual(result.rows[0], source);
  assert.equal(result.rows[1].setKind, 'warmup');
  assert.equal(result.rows[1].set, 0);
  const resequenced = sourceModule('lib/workoutRules.ts').resequenceSets(result.rows);
  assert.deepEqual(Array.from(resequenced, (r: any) => [r.id, r.setKind, r.set]), [[source.id, 'warmup', 0], [result.rows[1].id, 'warmup', 0]]);
  assert.equal(effects(result, 'logSet')[0].data.setKind, 'warmup');
  const ended = await runEnd(result.rows);
  const saved = ended.find(c => c.method === 'save')!.payload.rows;
  assert.deepEqual(Array.from(saved, (r: any) => [r.id, r.setKind, r.set]), [[source.id, 'warmup', 0], [result.rows[1].id, 'warmup', 0]]);
  let raw: string | null = null;
  const storage = sourceModule('lib/workoutStorage.ts', {
    './api': { api: { saveWorkout: async () => {} } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async () => raw,
      setItem: async (_: string, value: string) => { raw = value; },
    } },
  });
  await storage.saveWorkout(ended.find(c => c.method === 'save')!.payload);
  const readback = (await storage.listWorkouts())[0].rows;
  assert.deepEqual(Array.from(readback, (r: any) => [r.id, r.setKind, r.set]), [[source.id, 'warmup', 0], [result.rows[1].id, 'warmup', 0]]);
});

for (const setKind of ['work', 'drop', 'superset', 'backoff']) {
  test(`same preserves explicit ${setKind}, never infers warmup from disclosure`, async () => {
    const source = work({ setKind, notes: 'no pain after warmup' });
    const result = await runWorkoutRoute('same', [source]);
    assert.equal(result.rows[1].setKind, setKind);
    assert.deepEqual(result.rows[0], source);
    assert.notEqual(result.rows[1].id, source.id);
    assert.equal(effects(result, 'logSet')[0].data.setKind, setKind);
  });
}

test('actual composer fills first custom placeholder with actual8 then appends actual6 using real numbering', async () => {
  const first = work({ id: 'pending-1', exercise: 'Dragon press', weightLbs: '', reps: '', performance: 'planned', plannedTarget: { reps: '10' } });
  const result = await runWorkoutRoute('Dragon press 185 8 165 6', [first]);
  assert.equal(result.rows[0].id, first.id);
  assert.deepEqual(Array.from(result.rows, (r: any) => [r.set, r.weightLbs, r.reps]), [[1, '185', '8'], [2, '165', '6']]);
  assert.notEqual(result.rows[1].id, first.id);
  assert.equal(result.rows[0].plannedTarget.reps, '10');
  assert.equal(effects(result, 'logSet').length, 2);
  assert.equal(effects(result, 'rest').length, 1);
});

test('mixed AI rows log each complete set once and rest only once, then pending completion keeps ID', async () => {
  const result = await runWorkoutRoute('Bench and Squat 185 8', [], { rows: [
    { exercise: 'Squat', weightLbs: 185, reps: 8, set: 1 },
    { exercise: 'Squat', weightLbs: 165, reps: 6, set: 2 },
    { exercise: 'Bench', weightLbs: 185, reps: '', set: 1 },
  ] });
  assert.equal(effects(result, 'logSet').length, 2);
  assert.equal(effects(result, 'rest').length, 1);
  assert.equal(effects(result, 'rest')[0].data.repsLastSet, 6);
  const pendingId = result.rows[2].id;
  const completed = await runWorkoutRoute('Bench 185 8', result.rows);
  assert.equal(completed.rows.length, 3);
  assert.equal(completed.rows[2].id, pendingId);
  assert.equal(completed.rows[2].reps, '8');
  assert.equal(effects(completed, 'logSet').length, 1);
  const ended = await runEnd(completed.rows);
  const saved = ended.find(c => c.method === 'save')!.payload.rows;
  assert.equal(saved.length, 3);
  assert.equal(saved[2].id, pendingId);
});

for (const input of ['same', '6', '200']) {
  test(`legacy zero-load numeric source stays eligible for ${input}`, async () => {
    const source = work({ weightLbs: '0', performance: undefined, setKind: undefined });
    const result = await runWorkoutRoute(input, [source]);
    assert.equal(result.rows[1].weightLbs, input === '200' ? '200' : '0');
    assert.equal(result.rows[1].reps, input === '6' ? '6' : '8');
    assert.equal(effects(result, 'logSet').length, 1);
  });
}

for (const source of [work({ performance: 'planned' }), work({ performance: 'planned', reps: '', plannedTarget: { reps: '10' } })]) {
  test('planned/load-only sources cannot repeat prescribed numbers', async () => {
    const result = await runWorkoutRoute('same', [source]);
    assert.deepEqual(Array.from(result.rows), [source]);
    assert.equal(result.messageInput, 'same');
    assert.equal(effects(result, 'logSet').length, 0);
  });
}
