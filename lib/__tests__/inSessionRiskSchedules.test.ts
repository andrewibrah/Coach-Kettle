// V1 risk experiments: controlled schedules driving the REAL HomeScreen closures
// (app/(tabs)/index.tsx) offline. These are handler-seam schedules; native gesture
// timing is not exercised here (V2). Tests assert the DESIRED safe behaviour.
// Tests 1a-1d, 2a (commit-first), 2c, 4b and 4c were RED before the V1 index.tsx fixes; see
// docs/plans/in-session-reliability/evidence/v1-risk-schedules-local.md.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';
import { createSessionOwnership } from '../sessionOwnership.ts';
import { currentAnswer } from '../coachingAnswers.ts';
import type { QuestionnairePolicy } from '../../types/coachingAnswers';

const rules = sourceModule('lib/workoutRules.ts');
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };
const set = (id: string, exercise = 'Bench', extra: any = {}) => ({
  id, exercise, set: 1, weightLbs: '100', reps: '5', notes: '', timestamp: 1, status: 'committed', performance: 'performed', ...extra,
});
// Rows built inside the route VM are foreign-realm arrays; copy into this realm before deepEqual.
const list = (rows: any[]): any[] => Array.from(rows);
const ids = (rows: any[]) => Array.from(rows, (r: any) => r?.id);

// TEST ONLY. Not product policy: D09/Q8 wording, scales and freshness are unapproved.
const TEST_ONLY_POLICY: QuestionnairePolicy = {
  version: 'test-only', freshnessMs: 60_000,
  questions: [{ id: 'pain', kind: 'choice', prompt: 'test pain prompt', scope: 'exercise', choices: ['none', 'present'] }],
};

function draftStorage(initial: any) {
  let raw: string | null = JSON.stringify(initial);
  const adapter = { getItem: async () => raw, setItem: async (_k: string, v: string) => { raw = v; }, removeItem: async () => { raw = null; } };
  const helper = sourceModule('lib/workoutDraft.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: adapter } });
  return { helper, read: () => JSON.parse(raw!) };
}

// One shared session state; every `render()` rebuilds the real closures over the
// current state, like a React render. Old renders keep their captured values.
function session(initial: any[], storage = draftStorage({ ownerId: 'offline-owner', workoutId: 'v1-session', dateISO: '2026-10-13', bodyParts: ['Push'], createdAt: 1, updatedAt: 1, rows: initial })) {
  const ownership = createSessionOwnership('v1-owner');
  const s: any = { rows: rules.resequenceSets(structuredClone(initial)), editingCell: null, editValue: '', ops: [] as any[], toasts: [] as string[], dropGate: null as Promise<void> | null };
  s.ref = { current: s.rows };
  const render = () => {
    const c: any = {
      ...rules, ...storage.helper, useCallback: (fn: any) => fn, ownership, renderOwner: ownership.capture(), canUseSession: () => true,
      rows: s.rows, editingCell: s.editingCell, editValue: s.editValue, draftRowsRef: s.ref,
      setRows: (v: any) => { s.rows = typeof v === 'function' ? v(s.rows) : v; s.ref.current = s.rows; },
      setEditingCell: (v: any) => { s.editingCell = v; }, setEditValue: (v: string) => { s.editValue = v; },
      showToast: (t: string) => s.toasts.push(t),
      queueLiveRows: async (rows: any[], op = 'put') => { s.ops.push([op, ...ids(rows)]); if (op === 'drop' && s.dropGate) await s.dropGate; },
      invalidateResponses: () => ownership.invalidateRequests(),
      requestAnimationFrame: () => {}, scrollRef: { current: null }, scrollToBottom: () => {}, Platform: { OS: 'web' }, Haptics: {},
      draftChecked: true, workoutActive: true, workoutId: 'v1-session', workoutDateISO: '2026-10-13', bodyParts: ['Push'], workoutCreatedAt: 1,
      sessionProvenanceRef: { current: { ownerId: 'offline-owner', generation: 0 } }, draftSaveTimerRef: { current: null }, clearTimeout: () => {},
      canStartSession: () => true, setRoutineModalVisible: () => {}, startWorkoutSession: () => {},
    };
    c.applyPendingEdit = sourceClosure('applyPendingEdit', c);
    c.withPendingRows = sourceClosure('withPendingRows', c);
    c.persistDraftRows = sourceClosure('persistDraftRows', c);
    return { run: (name: string, ...args: any[]) => sourceClosure(name, c)(...args), value: (name: string, extra: any = {}) => sourceClosure(name, { ...c, ...extra }) };
  };
  return { s, render, storage };
}
const edit = (f: ReturnType<typeof session>, rowId: string, field: string, value: string) => { f.s.editingCell = { rowId, field }; f.s.editValue = value; };

// WorkoutCard passes (renderIndex, renderIndex + movedSlots, row.id); the stale-index
// schedules below call the route with that same shape.
// Safe-reorder invariants: no throw, no undefined row, same id multiset, and no row
// other than `dragged` changes its relative order.
function assertSafeReorder(before: any[], after: any[], dragged?: string) {
  assert.ok(after.every(r => r && typeof r.id === 'string'), 'no undefined rows');
  assert.deepEqual([...ids(after)].sort(), [...ids(before)].sort(), 'same row identities, none lost or duplicated');
  const others = (rows: any[]) => ids(rows).filter(id => id !== dragged);
  assert.deepEqual(others(after), others(before), 'only the dragged row may move');
}

// ── 1. Reorder by positional index ─────────────────────────────────────────────
test('1a reorder: gesture index captured before a concurrent delete moves only the dragged row', async () => {
  const f = session([set('A'), set('B'), set('C'), set('D')]);
  const gestureRender = f.render(); // card for C renders with rowIndex 2; drag up 2 slots
  await f.render().run('deleteRow', 'A');
  const before = structuredClone(f.s.rows);
  assert.doesNotThrow(() => gestureRender.run('handleReorderRow', 2, 0, 'C'));
  assertSafeReorder(before, f.s.rows, 'C');
  assert.ok(ids(f.s.rows).indexOf('C') <= ids(before).indexOf('C'), 'C moved up or stayed');
});

test('1b reorder: gesture index captured before a concurrent delete of the last slot does not throw or insert undefined', async () => {
  const f = session([set('A'), set('B'), set('C')]);
  const gestureRender = f.render(); // card for C renders with rowIndex 2
  await f.render().run('deleteRow', 'B');
  const before = structuredClone(f.s.rows);
  assert.doesNotThrow(() => gestureRender.run('handleReorderRow', 2, 0, 'C'));
  assertSafeReorder(before, f.s.rows, 'C');
});

test('1c reorder: gesture index captured before an inline rename regroups rows moves only the dragged row', () => {
  const f = session([set('A', 'Bench'), set('B', 'Squat'), set('C', 'Bench'), set('D', 'Row')]);
  edit(f, 'A', 'exercise', 'Squat');
  const gestureRender = f.render(); // card for B renders with rowIndex 1; drag down 2 slots
  f.render().run('commitCellEdit'); // inline rename relocates A after B: [B, A, C, D]
  assert.deepEqual(ids(f.s.rows), ['B', 'A', 'C', 'D']);
  const before = structuredClone(f.s.rows);
  gestureRender.run('handleReorderRow', 1, 3, 'B');
  assertSafeReorder(before, f.s.rows, 'B');
});

// Reachable invalid inputs from the shipped gesture: a stale/out-of-range render index
// (rowIndex >= 0 and Math.round always give integers), or a row deleted mid-drag.
test('1d reorder: a row deleted before the gesture ends (missing id) changes nothing and does not throw', () => {
  const f = session([set('A'), set('B'), set('C')]);
  const before = structuredClone(f.s.rows);
  assert.doesNotThrow(() => f.render().run('handleReorderRow', 3, 0, 'gone'));
  assert.deepEqual(ids(f.s.rows), ids(before), 'no row moved');
  assert.ok(f.s.rows.every((r: any) => r && typeof r.id === 'string'));
});

test('1d reorder: an out-of-range stale fromIndex with a valid id moves that row by the gesture offset', () => {
  const f = session([set('A'), set('B'), set('C')]);
  assert.doesNotThrow(() => f.render().run('handleReorderRow', 5, 4, 'C'));
  assert.deepEqual(ids(f.s.rows), ['A', 'C', 'B']);
});

for (const [label, from, to, expected] of [
  ['toIndex negative clamps to top', 2, -1, ['C', 'A', 'B']],
  ['toIndex past end clamps to bottom', 0, 9, ['B', 'C', 'A']],
  ['valid move', 2, 1, ['A', 'C', 'B']],
] as const) test(`1e reorder guard: ${label}`, () => {
  const f = session([set('A'), set('B'), set('C')]);
  f.render().run('handleReorderRow', from, to, ids(f.s.rows)[from]);
  assert.deepEqual(ids(f.s.rows), expected);
  assert.deepEqual(list(f.s.rows).map((r: any) => r.set), [1, 2, 3], 'ordinals resequenced');
});

// ── 2. Reorder with a pending inline edit ─────────────────────────────────────
test('2a reorder: commits the pending inline edit first, on its own row id, then moves the dragged row', () => {
  const f = session([set('A'), set('B'), set('C')]);
  edit(f, 'B', 'reps', '9');
  f.render().run('handleReorderRow', 2, 0, 'C'); // drag C to top while B is being edited
  assert.deepEqual(ids(f.s.rows), ['C', 'A', 'B']);
  assert.equal(f.s.rows.find((r: any) => r.id === 'B').reps, '9', 'committed before the move');
  assert.deepEqual(list(f.s.rows).filter((r: any) => r.reps === '9').map((r: any) => r.id), ['B'], 'edit on no other row');
  assert.equal(f.s.editingCell, null);
});

test('2c reorder: refuses while the pending inline edit is invalid, like withPendingRows', () => {
  const f = session([set('A'), set('B'), set('C')]);
  edit(f, 'B', 'reps', '-3');
  f.render().run('handleReorderRow', 2, 0, 'C');
  assert.deepEqual(ids(f.s.rows), ['A', 'B', 'C']);
});

// ── 3. Modal save during reorder or delete of the same row ───────────────────
test('3a modal save after the same row was reordered updates that row id only', () => {
  const f = session([set('A'), set('B'), set('C')]);
  const snapshot = structuredClone(f.s.rows[1]); // modal opened on B (set 2)
  f.render().run('handleReorderRow', 1, 0, 'B');
  f.render().run('handleSaveSet', { ...snapshot, weightLbs: '120' });
  assert.deepEqual(ids(f.s.rows), ['B', 'A', 'C']);
  assert.deepEqual(list(f.s.rows).map((r: any) => [r.id, r.set, r.weightLbs]), [['B', 1, '120'], ['A', 2, '100'], ['C', 3, '100']]);
});

test('3b modal save after the same row was deleted does not resurrect it', async () => {
  const f = session([set('A'), set('B'), set('C')]);
  const snapshot = structuredClone(f.s.rows[1]);
  await f.render().run('deleteRow', 'B');
  f.render().run('handleSaveSet', { ...snapshot, weightLbs: '120' });
  assert.deepEqual(ids(f.s.rows), ['A', 'C']);
  assert.deepEqual(list(f.s.ops).map(list), [['drop', 'B'], ['put', 'C']], 'no put for the deleted id');
});

async function saveInsideDrop() {
  const f = session([set('A'), set('B'), set('C')]);
  let release!: () => void; f.s.dropGate = new Promise<void>(r => { release = r; });
  const snapshot = structuredClone(f.s.rows[1]);
  const deleting = f.render().run('deleteRow', 'B');
  f.render().run('handleSaveSet', { ...snapshot, weightLbs: '120' }); // lands inside the drop await
  release(); await deleting; await tick();
  return f;
}
test('3c modal save while the delete of the same row awaits its durable drop: row stays deleted', async () => {
  const f = await saveInsideDrop();
  assert.deepEqual(ids(f.s.rows), ['A', 'C'], 'deleted row not resurrected');
  assert.ok(f.s.rows.every((r: any) => r.weightLbs === '100'), 'edit not applied to another row');
});
test('3d characterization (P4 outbox owns id retirement): that schedule enqueues drop B, then put B', async () => {
  const f = await saveInsideDrop();
  assert.deepEqual(list(f.s.ops).slice(0, 2).map(list), [['drop', 'B'], ['put', 'B']]);
});

// ── 4. Import routine with rows and a pending edit ───────────────────────────
const template = [{ lift_name: 'Bench', target_sets: 2, target_reps: 5 }, { lift_name: 'Squat', target_sets: 1, target_reps: 3 }];
test('4a import: existing rows and the pending edit keep their ids; new rows are fresh and unique', () => {
  const f = session([set('A'), set('B')]);
  edit(f, 'A', 'reps', '7');
  f.render().run('handleImportRoutine', { name: 'Routine' }, template);
  assert.deepEqual(ids(f.s.rows).slice(0, 2), ['A', 'B']);
  assert.equal(f.s.rows.length, 5);
  assert.equal(new Set(ids(f.s.rows)).size, 5, 'no duplicate identities');
  f.render().run('commitCellEdit');
  assert.equal(f.s.rows.find((r: any) => r.id === 'A').reps, '7');
  assert.deepEqual(list(f.s.rows).filter((r: any) => r.reps === '7').map((r: any) => r.id), ['A']);
  assert.equal(f.s.rows.length, 5, 'no rows lost');
});

test('4b import: appended rows do not repeat set ordinals within an exercise', () => {
  const f = session([set('A'), set('B', 'Bench', { set: 2 })]);
  f.render().run('handleImportRoutine', { name: 'Routine' }, template);
  const bench = list(f.s.rows).filter((r: any) => r.exercise === 'Bench').map((r: any) => r.set);
  assert.equal(new Set(bench).size, bench.length, `ordinals ${bench}`);
});

// V1 SPEC repair: shipped paths can leave gapped ordinals (onIncrementSet does set+1
// without resequencing). Import must not silently renumber existing performed rows.
for (const [label, items] of [
  ['unrelated Squat routine (reviewer probe)', [{ lift_name: 'Squat', target_sets: 2, target_reps: 5 }]],
  ['same-exercise Bench routine', [{ lift_name: 'Bench', target_sets: 2, target_reps: 5 }]],
] as const) test(`4c import after a gapped ordinal leaves existing performed rows unchanged (${label})`, () => {
  const f = session([set('A'), set('B')]);
  f.render().run('onIncrementSet', 'B'); // Bench A=1, B=3; put B is queued
  const before = JSON.parse(JSON.stringify(list(f.s.rows)));
  f.s.ops.length = 0;
  f.render().run('handleImportRoutine', { name: 'Routine' }, items);
  assert.deepEqual(JSON.parse(JSON.stringify(list(f.s.rows).slice(0, 2))), before, 'existing rows untouched');
  assert.deepEqual(list(f.s.ops), [], 'no hidden change, so nothing needs queuing');
  const bench = list(f.s.rows).filter((r: any) => r.exercise === 'Bench').map((r: any) => r.set);
  assert.equal(new Set(bench).size, bench.length, `ordinals ${bench}`);
});

test('4d import numbering skips warmups and rest markers and matches names case/space-insensitively', () => {
  const f = session([]);
  f.s.rows = [set('W', 'Bench Press', { set: 0, setKind: 'warmup' }), set('A', 'bench press '), rules.makeRestRow(60), set('B', '  BENCH press', { set: 3 })];
  f.s.ref.current = f.s.rows;
  const before = JSON.parse(JSON.stringify(list(f.s.rows)));
  f.render().run('handleImportRoutine', { name: 'Routine' }, [{ lift_name: 'Bench Press', target_sets: 2, target_reps: 5 }]);
  assert.deepEqual(JSON.parse(JSON.stringify(list(f.s.rows).slice(0, 4))), before, 'existing rows untouched');
  assert.deepEqual(list(f.s.rows).slice(4).map((r: any) => r.set), [4, 5]);
  assert.deepEqual(list(f.s.ops), []);
});

// ── 5. Rename grouping: modal vs inline (D10/Q10 policy, characterization) ───
test('5 characterization (update when D10/Q10 decided): inline rename regroups, modal rename stays in place', () => {
  const start = [set('A', 'Bench'), set('B', 'Squat'), set('C', 'Bench')];
  const inline = session(start);
  edit(inline, 'A', 'exercise', 'Squat');
  inline.render().run('commitCellEdit');
  assert.deepEqual(list(inline.s.rows).map((r: any) => [r.id, r.exercise, r.set]), [['B', 'Squat', 1], ['A', 'Squat', 2], ['C', 'Bench', 1]]);
  const modal = session(start);
  modal.render().run('handleSaveSet', { ...start[0], exercise: 'Squat' });
  assert.deepEqual(list(modal.s.rows).map((r: any) => [r.id, r.exercise, r.set]), [['A', 'Squat', 1], ['B', 'Squat', 2], ['C', 'Bench', 1]]);
});

// ── 6. Undo (D10/Q10 feature gap, characterization) ──────────────────────────
test('6 characterization: the shipped route has no undo; the unwired useRowActions undo is not imported anywhere', () => {
  const route = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /undo/i);
  const importers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').includes('useRowActions')) importers.push(path);
    }
  };
  for (const dir of ['app', 'components', 'contexts']) walk(dir);
  assert.deepEqual(importers, []);
});

// ── 7. D09 Q/A association across reorder, rename and delete ─────────────────
const pain = { answerId: 'a1', sessionId: 'v1-session', exerciseKey: 'bench press', questionId: 'pain', state: 'answered', value: 'present', capturedAt: 1000, provenance: 'user' };
function associated() {
  const rows = [set('A', 'Bench Press'), set('B', 'Squat'), set('C', 'Bench Press')];
  const storage = draftStorage({ ownerId: 'offline-owner', workoutId: 'v1-session', dateISO: '2026-10-13', bodyParts: ['Push'], createdAt: 1, updatedAt: 1, rows, coachingAnswers: [pain] });
  const f = session(rows, storage);
  const answers = { owner: 'offline-owner:v1-session', log: [pain] };
  const state = () => {
    const r = f.render();
    return {
      key: r.value('coachingExerciseKey'),
      log: r.value('coachingAnswerLog', { coachingAnswers: answers, sessionOwnerKey: 'offline-owner:v1-session' }),
    };
  };
  const evaluate = (exerciseKey: string) => currentAnswer(storage.read().coachingAnswers, { sessionId: 'v1-session', exerciseKey }, TEST_ONLY_POLICY, 2000).pain;
  return { f, storage, state, evaluate };
}

test('7a association survives reorder; the binding key for NEW answers follows the last row', async () => {
  const a = associated();
  assert.equal(a.state().key, 'bench press');
  a.f.render().run('handleReorderRow', 1, 2, 'B'); // Squat to the bottom
  a.f.render().run('persistDraftRows', a.f.s.rows); await tick();
  assert.deepEqual(a.storage.read().coachingAnswers, [pain], 'append-only log kept by the rows save');
  assert.deepEqual(list(a.state().log), [pain], 'session-scoped log unchanged');
  assert.equal(a.evaluate('bench press').state, 'answered');
  assert.equal(a.state().key, 'squat', 'observed: reorder changes which exercise new answers bind to');
});

test('7b rename changes exerciseKey: the old answer no longer applies but stays as excluded evidence', async () => {
  const a = associated();
  for (const id of ['A', 'C']) { edit(a.f, id, 'exercise', 'Incline Press'); a.f.render().run('commitCellEdit'); }
  a.f.render().run('persistDraftRows', a.f.s.rows); await tick();
  assert.deepEqual(a.storage.read().coachingAnswers, [pain]);
  // Inline regroup puts C after A, so the last row (binding key) is Squat here.
  assert.deepEqual(list(a.f.s.rows).map((r: any) => [r.id, r.exercise]), [['A', 'Incline Press'], ['C', 'Incline Press'], ['B', 'Squat']]);
  const result: any = a.evaluate('incline press');
  assert.equal(result.state, 'unknown');
  assert.deepEqual(list(result.excluded).map((e: any) => [e.answer.answerId, e.reason]), [['a1', 'other_exercise']]);
});

test('7c delete keeps the answer evidence for the session and exercise', async () => {
  const a = associated();
  await a.f.render().run('deleteRow', 'C'); await tick(); // real deleteRow persists rows itself
  assert.deepEqual(ids(a.storage.read().rows), ['A', 'B']);
  assert.deepEqual(a.storage.read().coachingAnswers, [pain]);
  assert.deepEqual(list(a.state().log), [pain]);
  assert.equal(a.evaluate('bench press').state, 'answered');
  await a.f.render().run('deleteRow', 'A'); await tick();
  assert.deepEqual(a.storage.read().coachingAnswers, [pain], 'no Bench rows left; evidence kept');
  assert.equal(a.evaluate('bench press').state, 'answered');
});
