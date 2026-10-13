import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkoutRoute } from './inSessionHarness.ts';
import { sourceModule, sourceClosure, runEnd, renderWorkoutCard } from './workoutIdentityHarness.ts';
import { performedRows, isPerformedRow } from '../performedSets.ts';
import { readFileSync } from 'node:fs';

test('actual inline load edit records performance while notes-only edit remains planned', () => {
  const row = { ...planned('pending'), reps: '8' };
  const edit = (field: string, value: string) => sourceClosure('applyPendingEdit', {
    useCallback: (fn: any) => fn, editingCell: { rowId: row.id, field }, editValue: value,
    normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets,
  })([row]).nextRows[0];
  assert.equal(edit('notes', 'shoulder pain').performance, 'planned');
  const actual = edit('weightLbs', '0');
  assert.equal(actual.performance, 'performed');
  assert.equal(actual.plannedTarget.reps, '10');
  assert.equal(actual.id, row.id);
});

test('actual modal edit records supplied performance without stripping warmup identity', () => {
  let rows = [planned('pending')];
  const run = sourceClosure('handleSaveSet', {
    withPendingRows: (fn: any) => { rows = fn(rows); },
    normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets,
  });
  run({ ...rows[0], weightLbs: '0', reps: '8', setKind: 'warmup' });
  assert.equal(rows[0].performance, 'performed');
  assert.equal(rows[0].setKind, 'warmup');
  assert.equal(rows[0].plannedTarget.reps, '10');
});

test('WorkoutCard exposes pending target rather than completed set label', () => {
  const source = readFileSync(new URL('../../components/workout/WorkoutCard.tsx', import.meta.url), 'utf8');
  assert.match(source, /isPerformedRow\(row\)/);
  assert.match(source, /Planned/);
});

test('actual WorkoutCard render distinguishes planned targets from performed warmups', () => {
  const pending = JSON.stringify(renderWorkoutCard(planned('pending')));
  assert.match(pending, /Planned 1/);
  assert.match(pending, /Target/);
  assert.match(pending, /10/);
  assert.doesNotMatch(pending, /Warmup 1/);
  const actual = JSON.stringify(renderWorkoutCard({ ...planned('warm'), weightLbs: '95', reps: '8', performance: 'performed', setKind: 'warmup', set: 0 }));
  assert.match(actual, /Warmup 0/);
  assert.doesNotMatch(actual, /Planned 0/);
});

const rules = sourceModule('lib/workoutRules.ts');

test('canonical two legacy ten-rep Bench skeletons preserve first identity and performed eight', async () => {
  const first = { ...planned('first'), performance: undefined, plannedTarget: undefined, setKind: undefined, reps: '10', set: 1 };
  const second = { ...first, id: 'second', set: 2 };
  const result = await runWorkoutRoute('Bench 185 8', [first, second]);
  assert.equal(result.rows[0].id, 'first');
  assert.equal(result.rows[0].weightLbs, '185');
  assert.equal(result.rows[0].reps, '8');
  assert.equal(result.rows[0].plannedTarget.reps, '10');
  assert.equal(result.rows[0].performance, 'performed');
  assert.deepEqual(result.rows[1], second);
  const logs = result.calls.filter(c => c.method === 'logSet');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].data.set, 1);
  assert.equal(logs[0].data.reps, '8');
  assert.equal(result.calls.filter(c => c.method === 'rest').length, 1);
});

for (const input of ['Bench 185 8', '185 8']) {
  test(`first eligible fill skips transport ghosts and performed identities: ${input}`, async () => {
    const ghost = { ...planned('ghost'), status: 'syncing' };
    const prior = { ...planned('prior'), performance: 'performed', weightLbs: '0', reps: '8' };
    const initial = [ghost, prior, planned('eligible'), planned('last')];
    const result = await runWorkoutRoute(input, initial);
    assert.deepEqual(result.rows[0], ghost);
    assert.deepEqual(result.rows[1], prior);
    assert.equal(result.rows[2].id, 'eligible');
    assert.equal(result.rows[2].weightLbs, '185');
    assert.equal(result.rows[2].reps, '8');
    assert.deepEqual(result.rows[3], initial[3]);
    assert.equal(result.calls.filter(c => c.method === 'logSet').length, 1);
  });
}

test('legacy template modal load-only save leaves target reps unperformed', () => {
  let rows = [{ ...planned('legacy'), performance: undefined, plannedTarget: undefined, reps: '10' }];
  const run = sourceClosure('handleSaveSet', { withPendingRows: (fn: any) => { rows = fn(rows); }, normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets });
  run({ ...rows[0], weightLbs: '185' });
  assert.equal(rows[0].performance, 'planned');
  assert.equal(rows[0].reps, '');
  assert.equal(rows[0].plannedTarget?.reps, '10');
});

test('legacy blank template inline load cannot manufacture its target reps', () => {
  const row = { ...planned('legacy'), performance: undefined, plannedTarget: undefined, reps: '10' };
  const result = sourceClosure('applyPendingEdit', { useCallback: (fn: any) => fn, editingCell: { rowId: row.id, field: 'weightLbs' }, editValue: '185', normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets })([row]).nextRows[0];
  assert.equal(result.performance, 'planned');
  assert.equal(result.reps, '');
  assert.equal(result.plannedTarget.reps, '10');
});

test('actual card displays an entered zero load as known, not not-set', () => {
  const rendered = JSON.stringify(renderWorkoutCard({ ...planned('zero'), performance: 'performed', weightLbs: '0', reps: '8' }));
  assert.match(rendered, /Weight: 0 lbs/);
  assert.doesNotMatch(rendered, /Weight: not set/);
});

for (const input of ['185', '185, 195']) {
  test(`load-only routine entry never promotes planned reps to performance: ${input}`, async () => {
    const initial = rules.expandTemplateToRows([{ lift_name: 'Bench', target_sets: 2, target_reps: 10 }]);
    const result = await runWorkoutRoute(input, initial);
    assert.equal(result.rows[0].weightLbs, '185');
    assert.equal(result.rows[0].reps, '');
    assert.equal(result.rows[0].performance, 'planned');
    assert.equal(result.rows[0].plannedTarget.reps, '10');
    assert.equal(result.calls.filter(c => c.method === 'logSet' || c.method === 'rest' || c.method === 'pr').length, 0);
    const end = await runEnd(result.rows);
    assert.equal(end.filter(c => c.method === 'review' || c.method === 'save').length, 0);
  });
}

test('inline load on a generated template remains pending until actual reps are entered', () => {
  let rows = rules.expandTemplateToRows([{ lift_name: 'Bench', target_sets: 1, target_reps: 10 }]);
  const edit = (field: string, editValue: string) => sourceClosure('applyPendingEdit', {
    useCallback: (fn: any) => fn, editingCell: { rowId: rows[0].id, field }, editValue,
    normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets,
  })(rows).nextRows;
  rows = edit('weightLbs', '0');
  assert.equal(rows[0].performance, 'planned');
  assert.equal(rows[0].reps, '');
  rows = edit('reps', '8');
  assert.equal(rows[0].performance, 'performed');
  assert.equal(rows[0].reps, '8');
  assert.equal(rows[0].plannedTarget.reps, '10');
});

test('same cannot fabricate performance from prescribed numeric targets', async () => {
  const pending = { ...planned('pending'), weightLbs: '135' };
  const result = await runWorkoutRoute('same', [pending]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.calls.filter(c => c.method === 'logSet').length, 0);
});

for (const failReview of [false, true]) {
  test(`partial completion preserves actual zero and target in End even if review fails=${failReview}`, async () => {
    const result = await runWorkoutRoute('Bench 0 8', [planned('first'), planned('second')]);
    const calls = await runEnd(result.rows, {}, failReview);
    const saved = calls.find(c => c.method === 'save').payload.rows;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].id, 'first');
    assert.equal(saved[0].weightLbs, '0');
    assert.equal(saved[0].reps, '8');
    assert.equal(saved[0].plannedTarget.reps, '10');
  });
}

test('legacy work compatibility and classification do not rely on notes or set zero', () => {
  const work = { ...planned('legacy'), performance: undefined, setKind: undefined, set: 0, weightLbs: '185', reps: '8', notes: 'warmup' };
  assert.equal(isPerformedRow(work as any), true);
  const numbered = rules.resequenceSets([work]);
  assert.equal(numbered[0].set, 1);
  assert.equal(numbered[0].setKind, undefined);
  assert.equal(isPerformedRow({ ...work, weightLbs: '' } as any), false);
  assert.equal(isPerformedRow({ ...work, weightLbs: '0' } as any), true);
  assert.equal(isPerformedRow({ ...work, status: 'syncing' } as any), false);
  assert.equal(isPerformedRow({ ...work, isRest: true } as any), false);
  assert.equal(isPerformedRow({ ...work, isCardio: true, weightLbs: '' } as any), true);
});

test('actual coaching snapshot excludes pending templates and keeps kind and target', () => {
  const actual = { ...planned('done'), performance: 'performed', weightLbs: '0', reps: '8', setKind: 'warmup' };
  const toApi = sourceClosure('toApiRows', {});
  const mapped = toApi([planned('pending'), actual]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].setKind, 'warmup');
  assert.equal(mapped[0].plannedTarget.reps, '10');
});

test('incomplete explicit performance is unknown rather than a completed zero-load set', () => {
  assert.equal(isPerformedRow({ ...planned('missing'), performance: 'performed' }), false);
});

test('explicit dropset fill preserves classification rather than relabeling work', async () => {
  const result = await runWorkoutRoute('Bench 185 8 165 10 dropset', [planned('first'), planned('second')]);
  assert.deepEqual(Array.from(result.rows, r => r.setKind), ['drop', 'drop']);
  assert.deepEqual(Array.from(result.rows, r => r.reps), ['8', '10']);
  assert.equal(result.calls.filter(c => c.method === 'logSet').length, 2);
  assert.equal(result.calls.filter(c => c.method === 'rest').length, 1);
});

test('actual local-first storage readback preserves warmup identity through success and retry', async () => {
  let raw: string | null = null;
  let offline = true;
  const sends: any[] = [];
  const storage = sourceModule('lib/workoutStorage.ts', {
    './api': { api: { saveWorkout: async (payload: any) => { sends.push(payload); if (offline) throw new Error('offline fixture'); } } },
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => raw, setItem: async (_: string, value: string) => { raw = value; }, removeItem: async () => { raw = null; } } },
  });
  const result = await runWorkoutRoute('Bench 95 10 warmup');
  const saved = (await runEnd(result.rows)).find(c => c.method === 'save').payload;
  assert.equal((await storage.saveWorkout(saved)).synced, false);
  assert.equal((await storage.listWorkouts())[0].rows[0].setKind, 'warmup');
  assert.equal((await storage.listWorkouts())[0].rows[0].id, result.rows[0].id);
  offline = false;
  assert.equal(await storage.syncPendingWorkouts(), 1);
  assert.equal((await storage.listWorkouts())[0].pendingSync, false);
  assert.equal(sends[1].rows[0].setKind, 'warmup');
});

test('actual row-action hook preserves warmup classification and stable IDs on move duplicate delete', () => {
  let rows = [{ ...planned('work'), weightLbs: '185', performance: 'performed' }, { ...planned('warm'), weightLbs: '95', performance: 'performed', setKind: 'warmup', set: 0 }];
  const hooks = sourceModule('hooks/useRowActions.ts', {
    '@/lib/workoutRules': rules,
    react: { useCallback: (fn: any) => fn, useRef: (current: any) => ({ current }), useState: () => [null, () => {}] },
  });
  const actions = hooks.useRowActions({ rows, setRows: (value: any) => { rows = typeof value === 'function' ? value(rows) : value; }, applyPendingEdit: (nextRows: any) => ({ nextRows, changed: false }) });
  actions.moveRow('warm', 'up');
  assert.equal(rows[0].id, 'warm');
  assert.equal(rows[0].setKind, 'warmup');
  assert.equal(rows[0].set, 0);
  actions.duplicateRow('warm');
  assert.equal(rows[1].setKind, 'warmup');
  assert.equal(rows[1].set, 0);
  assert.notEqual(rows[1].id, 'warm');
  actions.deleteRow('work');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].setKind, 'warmup');
  actions.resetUndoState();
});

for (const input of ['185', '185 8', '185, 195']) {
  test(`routine shorthand uses actual logging effects once: ${input}`, async () => {
    const result = await runWorkoutRoute(input, [planned('first'), planned('second')]);
    const count = input === '185 8' ? 1 : 0;
    assert.equal(result.calls.filter(c => c.method === 'logSet').length, count);
    assert.equal(result.calls.filter(c => c.method === 'syncSkeleton').length, 0);
    assert.equal(result.calls.filter(c => c.method === 'rest').length, count);
    assert.equal(result.rows[0].performance, count ? 'performed' : 'planned');
    assert.equal(result.rows[0].reps, count ? '8' : '');
    assert.equal(result.rows[0].plannedTarget.reps, '10');
  });
}

test('explicit bodyweight is performed and cannot be refilled by shorthand', async () => {
  const first = await runWorkoutRoute('Bench 0 8', [planned('first'), planned('second')]);
  assert.equal(first.rows[0].weightLbs, '0');
  assert.equal(first.rows[0].performance, 'performed');
  const second = await runWorkoutRoute('185 6', first.rows);
  assert.equal(second.rows[0].weightLbs, '0');
  assert.equal(second.rows[0].reps, '8');
  assert.equal(second.rows[1].weightLbs, '185');
  assert.equal(second.rows[1].performance, 'performed');
});

test('actual End serializes performed identity and target, excluding pending templates', async () => {
  const result = await runWorkoutRoute('Bench 95 10 warmup', [planned('pending')]);
  const calls = await runEnd(result.rows);
  const saved = calls.find(c => c.method === 'save').payload.rows;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, result.rows[1].id);
  assert.equal(saved[0].setKind, 'warmup');
  assert.equal(saved[0].performance, 'performed');
  assert.equal(calls.find(c => c.method === 'review').rows.length, 1);
  assert.equal(calls.find(c => c.method === 'review').rows[0].setKind, 'warmup');
  assert.equal(result.calls.find(c => c.method === 'logSet')!.data.setKind, 'warmup');
});

test('standalone warmup retains identity in actual route and resequencing', async () => {
  const result = await runWorkoutRoute('Bench 95 10 warmup', [planned('pending')]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].performance, 'planned');
  assert.equal(result.rows[1].performance, 'performed');
  assert.equal(result.rows[1].setKind, 'warmup');
  const resequenced = rules.resequenceSets(result.rows);
  assert.equal(resequenced[1].setKind, 'warmup');
  assert.equal(resequenced[1].set, 0);
  assert.equal(rules.nextSetNumberForExercise(resequenced, 'Bench'), 2);
});

for (const input of ['warmup Bench 45 10 95 8', 'Bench 45 10 95 8 warmup']) {
  test(`explicit multi warmup scope survives route: ${input}`, async () => {
    const result = await runWorkoutRoute(input);
    assert.equal(result.rows.length, 2);
    for (const row of result.rows) {
      assert.equal(row.exercise, 'Bench');
      assert.equal(row.setKind, 'warmup');
      assert.equal(row.performance, 'performed');
    }
  });
}

test('after warmup prose remains ordinary work notes', async () => {
  const result = await runWorkoutRoute('Bench 185 8 no pain after warmup');
  assert.equal(result.rows[0].setKind, 'work');
  assert.equal(result.rows[0].notes, 'no pain after warmup');
});

test('routine expansion records targets without declaring performance', () => {
  const rows = rules.expandTemplateToRows([{ lift_name: 'Bench', target_sets: 2, target_reps: 10, target_weight: 135 }]);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[0].performance, 'planned');
  assert.equal(rows[0].reps, '');
  assert.equal(rows[0].setKind, 'work');
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0].plannedTarget)), { reps: '10', weightLbs: '135' });
});

test('actual End excludes all unperformed planned and legacy blank rows', async () => {
  const calls = await runEnd([planned('first'), { ...planned('legacy'), performance: undefined }]);
  assert.equal(calls.filter(c => c.method === 'review' || c.method === 'save').length, 0);
  assert.equal(calls.filter(c => c.method === 'toast').length, 1);
});

const planned = (id: string, exercise = 'Bench') => ({ id, exercise, set: 1, weightLbs: '', reps: '', notes: '', timestamp: 1, status: 'committed', performance: 'planned', setKind: 'work', plannedTarget: { reps: '10', weightLbs: '135' } });

test('explicit performance fills first matching planned identity with actual reps and load', async () => {
  const initial = [planned('other', 'Squat'), planned('first'), planned('second')];
  const result = await runWorkoutRoute('Bench 185 8 shoulder pain', initial);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[1].id, 'first');
  assert.equal(result.rows[1].weightLbs, '185');
  assert.equal(result.rows[1].reps, '8');
  assert.equal(result.rows[1].performance, 'performed');
  assert.deepEqual(result.rows[1].plannedTarget, initial[1].plannedTarget);
  assert.equal(result.rows[1].notes, 'shoulder pain');
  assert.deepEqual(result.rows[0], initial[0]);
  assert.deepEqual(result.rows[2], initial[2]);
  const logs = result.calls.filter(c => c.method === 'logSet');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].data.reps, '8');
  assert.equal(result.calls.filter(c => c.method === 'rest').length, 1);
});
