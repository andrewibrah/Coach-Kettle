import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkoutRoute } from './inSessionHarness.ts';
import { runEnd, sourceClosure, sourceModule } from './workoutIdentityHarness.ts';

const rules = sourceModule('lib/workoutRules.ts');
function edit(rows: any[], mode: string, weightLbs: string) {
  const before = rows[0];
  if (mode === 'inline') return sourceClosure('applyPendingEdit', {
    useCallback: (fn: any) => fn, editingCell: { rowId: before.id, field: 'weightLbs' }, editValue: weightLbs,
    normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets,
  })(rows).nextRows;
  let next = rows;
  sourceClosure('handleSaveSet', {
    withPendingRows: (fn: any) => { next = fn(next); },
    normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets,
  })({ ...before, weightLbs });
  return next;
}
function storageFixture() {
  const values = new Map<string, string>();
  return sourceModule('lib/workoutStorage.ts', {
    './api': { api: { saveWorkout: async () => {} } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => { values.set(key, value); },
      removeItem: async (key: string) => { values.delete(key); },
    } },
  });
}

async function assertComposerSaved(result: any, expected: any[], expectedLogs = expected) {
  const logs = result.calls.filter((c: any) => c.method === 'logSet');
  assert.equal(logs.length, expectedLogs.length);
  assert.equal(result.calls.filter((c: any) => c.method === 'rest').length, expectedLogs.length ? 1 : 0);
  for (const { id, weightLbs, reps, plannedTarget } of expected) {
    const row = result.rows.find((r: any) => r.id === id);
    assert.deepEqual([row.id, row.weightLbs, row.reps, row.plannedTarget], [id, weightLbs, reps, plannedTarget]);
  }
  for (let i = 0; i < expectedLogs.length; i++) {
    const { id, weightLbs, reps, plannedTarget } = expectedLogs[i];
    assert.equal(result.rows.find((r: any) => r.id === id).performance, 'performed');
    assert.deepEqual([logs[i].data.weightLbs, logs[i].data.reps, logs[i].data.plannedTarget], [weightLbs, reps, plannedTarget]);
  }
  const ended = await runEnd(result.rows);
  const review = ended.find(c => c.method === 'review')!.rows;
  const payload = ended.find(c => c.method === 'save')!.payload;
  assert.equal(review.length, expected.length);
  assert.equal(payload.rows.length, expected.length);
  const storage = storageFixture();
  await storage.saveWorkout(payload);
  const stored = (await storage.listWorkouts())[0].rows;
  assert.equal(stored.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    const { id, weightLbs, reps, plannedTarget } = expected[i];
    assert.deepEqual([review[i].weightLbs, review[i].reps, review[i].plannedTarget], [weightLbs, reps, plannedTarget]);
    assert.deepEqual(structuredClone([stored[i].id, stored[i].weightLbs, stored[i].reps, stored[i].plannedTarget]), [id, weightLbs, reps, plannedTarget]);
  }
}

test('real AI pending actual reps survive composer load-only completion through End and storage', async () => {
  const built = await runWorkoutRoute('Bench and Squat 185 8', [], {
    rows: [{ exercise: 'Bench', set: 1, weightLbs: '', reps: 8 }],
  });
  const before = structuredClone(built.rows);
  assert.equal(built.rows[0].performance, 'planned');
  assert.equal(built.rows[0].plannedTarget, undefined);
  assert.equal(built.calls.filter(c => ['logSet', 'rest', 'pr'].includes(c.method)).length, 0);
  const completed = await runWorkoutRoute('185', built.rows);
  await assertComposerSaved(completed, [{ id: built.rows[0].id, weightLbs: '185', reps: '8', plannedTarget: undefined }]);
  assert.deepEqual(structuredClone(built.rows), before);
});

test('real AI pending actual reps accept named composer replacement without invented target', async () => {
  const built = await runWorkoutRoute('Bench and Squat 185 8', [], {
    rows: [{ exercise: 'Bench', set: 1, weightLbs: '', reps: 8 }],
  });
  const completed = await runWorkoutRoute('Bench 185 6', built.rows);
  await assertComposerSaved(completed, [{ id: built.rows[0].id, weightLbs: '185', reps: '6', plannedTarget: undefined }]);
  assert.equal(built.rows[0].reps, '8');
});

for (const current of [false, true]) {
  for (const [input, weights, reps] of [
    ['0', ['0'], ['8']],
    ['185 6', ['185'], ['6']],
    ['185, 0', ['185', '0'], ['8', '6']],
    ['Bench and Squat superset 185 6 0 8', ['185', '0'], ['6', '8']],
  ] as const) {
    test(`AI builder then composer ${input} preserves provenance with ${current ? 'current' : 'empty'} session`, async () => {
      const previous = { id: 'previous', exercise: 'Row', set: 1, weightLbs: '100', reps: '5', notes: '', timestamp: 1, status: 'committed' };
      const seed = current ? [previous] : [];
      const two = weights.length === 2;
      const built = await runWorkoutRoute('Bench and Squat 185 8', seed, {
        rows: [{ exercise: 'Bench', set: 1, weightLbs: '', reps: 8 },
          ...(two ? [{ exercise: 'Squat', set: 1, weightLbs: '', reps: 6 }] : [])],
      });
      assert.equal(built.calls.filter(c => ['logSet', 'rest', 'pr'].includes(c.method)).length, 0);
      const before = structuredClone(built.rows);
      const completed = await runWorkoutRoute(input, built.rows);
      assert.deepEqual(structuredClone(built.rows), before);
      const changed = Array.from(weights, (weightLbs, i) => ({
        id: built.rows[seed.length + i].id, weightLbs, reps: reps[i], plannedTarget: undefined,
      }));
      await assertComposerSaved(completed, [...seed, ...changed], changed);
      if (current) assert.deepEqual(structuredClone(completed.rows[0]), previous);
    });
  }
}

for (const input of ['185', '0', '185 8', 'Bench 185 6']) {
  for (const legacy of [false, true]) {
    test(`composer ${input} keeps ${legacy ? 'legacy prescribed' : 'explicit target'}10 separate from actual`, async () => {
      const pending: any = { id: 'template', exercise: 'Bench', set: 1, weightLbs: '', reps: legacy ? '10' : '8',
        notes: '', timestamp: 1, status: 'committed',
        ...(legacy ? {} : { performance: 'planned', plannedTarget: { reps: '10' } }),
      };
      const before = structuredClone(pending);
      const completed = await runWorkoutRoute(input, [pending]);
      const loadOnly = input === '185' || input === '0';
      if (legacy && loadOnly) {
        assert.deepEqual([completed.rows[0].id, completed.rows[0].reps, completed.rows[0].performance, completed.rows[0].plannedTarget.reps],
          ['template', '', 'planned', '10']);
        assert.equal(completed.calls.filter(c => ['logSet', 'rest', 'pr'].includes(c.method)).length, 0);
        assert.equal((await runEnd(completed.rows)).filter(c => ['review', 'save'].includes(c.method)).length, 0);
        const actual = await runWorkoutRoute('185 8', completed.rows);
        await assertComposerSaved(actual, [{ id: 'template', weightLbs: '185', reps: '8', plannedTarget: { reps: '10' } }]);
      } else {
        await assertComposerSaved(completed, [{ id: 'template', weightLbs: input === '0' ? '0' : '185',
          reps: input.startsWith('Bench') ? '6' : '8', plannedTarget: { reps: '10' } }]);
      }
      assert.deepEqual(pending, before);
    });
  }
}

test('mixed batch fills keep actual AI reps and genuine prescription separate', async () => {
  const built = await runWorkoutRoute('Bench and Squat 185 8', [], {
    rows: [{ exercise: 'Bench', set: 1, weightLbs: '', reps: 8 }],
  });
  const legacy = { id: 'legacy-batch', exercise: 'Squat', set: 1, weightLbs: '', reps: '10', notes: '', timestamp: 1, status: 'committed' };
  const target = { ...legacy, id: 'explicit-batch', exercise: 'Press', reps: '6', performance: 'planned', plannedTarget: { reps: '10' } };
  const completed = await runWorkoutRoute('185, 0, 100', [...built.rows, legacy, target]);
  assert.deepEqual(Array.from(completed.rows, r => [r.id, r.reps, r.performance, r.plannedTarget?.reps]),
    [[built.rows[0].id, '8', 'performed', undefined], ['legacy-batch', '', 'planned', '10'], ['explicit-batch', '6', 'performed', '10']]);
  await assertComposerSaved(completed, [
    { id: built.rows[0].id, weightLbs: '185', reps: '8', plannedTarget: undefined },
    { id: target.id, weightLbs: '100', reps: '6', plannedTarget: { reps: '10' } },
  ]);
  assert.equal((await runEnd(completed.rows)).find(c => c.method === 'save')!.payload.rows.length, 2);
});

for (const mode of ['inline', 'modal']) {
test(`new AI actual reps survive ${mode} missing-load edit, End and local serialization`, async () => {
  const result = await runWorkoutRoute('Bench and Squat 185 8', [], {
    rows: [{ exercise: 'Bench', set: 1, weightLbs: '', reps: 8 }],
  });
  const before = structuredClone(result.rows[0]);
  assert.equal(before.performance, 'planned');
  assert.equal(before.plannedTarget, undefined);
  assert.equal(result.calls.filter((c: any) => ['logSet', 'rest', 'pr'].includes(c.method)).length, 0);
  const rows = edit(result.rows, mode, '185');
  assert.equal(rows[0].id, before.id);
  assert.equal(rows[0].reps, '8');
  assert.equal(rows[0].performance, 'performed');
  assert.equal(rows[0].plannedTarget, undefined);
  assert.deepEqual(structuredClone(result.rows[0]), before);
  const ended = await runEnd(rows);
  const payload = ended.find(c => c.method === 'save')!.payload;
  assert.equal(payload.rows.length, 1);
  assert.deepEqual([payload.rows[0].id, payload.rows[0].weightLbs, payload.rows[0].reps], [before.id, '185', '8']);
  const storage = storageFixture();
  await storage.saveWorkout(payload);
  const stored = (await storage.listWorkouts())[0].rows[0];
  assert.deepEqual([stored.id, stored.weightLbs, stored.reps, stored.plannedTarget], [before.id, '185', '8', undefined]);
});
}

for (const mode of ['inline', 'modal']) {
  test(`pending AI actual reps survive real draft reload then ${mode} zero-load completion`, async () => {
    const result = await runWorkoutRoute('Bench and Squat 185 8', [], {
      rows: [{ exercise: 'Bench', set: 1, weightLbs: '', reps: 8 }],
    });
    let raw: string | null = null;
    const draft = sourceModule('lib/workoutDraft.ts', {
      '@react-native-async-storage/async-storage': { __esModule: true, default: {
        getItem: async () => raw, setItem: async (_: string, value: string) => { raw = value; },
      } },
    });
    await draft.saveWorkoutDraft({ workoutId: 'session', dateISO: '2026-10-08', bodyParts: ['Push'], createdAt: 1, updatedAt: 2, rows: result.rows });
    const restored = (await draft.getWorkoutDraft()).rows;
    assert.equal(restored[0].performance, 'planned');
    assert.equal(restored[0].reps, '8');
    assert.equal(restored[0].plannedTarget, undefined);
    assert.equal((await runEnd(restored)).filter(c => ['save', 'review'].includes(c.method)).length, 0);
    const rows = edit(restored, mode, '0');
    assert.deepEqual([rows[0].id, rows[0].weightLbs, rows[0].reps, rows[0].performance, rows[0].plannedTarget],
      [result.rows[0].id, '0', '8', 'performed', undefined]);
    const saved = (await runEnd(rows)).find(c => c.method === 'save')!.payload;
    const storage = storageFixture();
    await storage.saveWorkout(saved);
    const readback = (await storage.listWorkouts())[0].rows[0];
    assert.deepEqual([readback.id, readback.weightLbs, readback.reps, readback.performance], [rows[0].id, '0', '8', 'performed']);
  });

  test(`genuine metadata-free legacy template stays conservative through ${mode} load-only edit`, async () => {
    const legacy = { id: 'legacy', exercise: 'Bench', set: 1, weightLbs: '', reps: '10', notes: '', timestamp: 1, status: 'committed' };
    const staged = edit([legacy], mode, '185');
    assert.deepEqual([staged[0].id, staged[0].weightLbs, staged[0].reps, staged[0].performance, staged[0].plannedTarget.reps], ['legacy', '185', '', 'planned', '10']);
    assert.equal((await runEnd(staged)).filter(c => ['save', 'review'].includes(c.method)).length, 0);
    let completed = staged;
    if (mode === 'inline') {
      completed = sourceClosure('applyPendingEdit', {
        useCallback: (fn: any) => fn, editingCell: { rowId: 'legacy', field: 'reps' }, editValue: '8',
        normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets,
      })(staged).nextRows;
    } else {
      sourceClosure('handleSaveSet', {
        withPendingRows: (fn: any) => { completed = fn(completed); },
        normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets,
      })({ ...staged[0], reps: '8' });
    }
    assert.deepEqual([completed[0].id, completed[0].reps, completed[0].plannedTarget.reps, completed[0].performance], ['legacy', '8', '10', 'performed']);
    const saved = (await runEnd(completed)).find(c => c.method === 'save')!.payload;
    const storage = storageFixture();
    await storage.saveWorkout(saved);
    const readback = (await storage.listWorkouts())[0].rows[0];
    assert.deepEqual([readback.id, readback.reps, readback.plannedTarget.reps], ['legacy', '8', '10']);
    assert.equal(legacy.reps, '10');
    assert.equal(legacy.weightLbs, '');
  });

  test(`explicit planned target10 and actual8 remain independent after ${mode} load edit`, async () => {
    const pending = { id: 'targeted', exercise: 'Bench', set: 1, weightLbs: '', reps: '8', notes: '', timestamp: 1,
      status: 'committed', performance: 'planned', plannedTarget: { reps: '10' } };
    const rows = edit([pending], mode, '185');
    assert.deepEqual([rows[0].id, rows[0].reps, rows[0].plannedTarget.reps, rows[0].performance], ['targeted', '8', '10', 'performed']);
    const saved = (await runEnd(rows)).find(c => c.method === 'save')!.payload.rows[0];
    assert.deepEqual([saved.id, saved.reps, saved.plannedTarget.reps], ['targeted', '8', '10']);
  });

  test(`invalid ${mode} load edit remains unperformed and excluded from End`, async () => {
    const result = await runWorkoutRoute('Bench and Squat 185 8', [], {
      rows: [{ exercise: 'Bench', set: 1, weightLbs: '', reps: 8 }],
    });
    const rows = edit(result.rows, mode, 'not-a-load');
    assert.equal(rows[0].id, result.rows[0].id);
    // I3 now rejects before mutation; preserve the previous unknown load.
    assert.equal(rows[0].weightLbs, '');
    assert.deepEqual(structuredClone(rows[0]), structuredClone(result.rows[0]));
    assert.equal(rows[0].reps, '8');
    assert.equal(rows[0].plannedTarget, undefined);
    assert.equal(rows[0].performance, 'planned');
    assert.equal((await runEnd(rows)).filter(c => ['save', 'review'].includes(c.method)).length, 0);
  });
}
