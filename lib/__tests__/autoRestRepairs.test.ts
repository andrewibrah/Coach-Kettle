import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';
import { createSessionOwnership } from '../sessionOwnership.ts';
import { isPerformedRow, performedRows, resolveEditedPerformance } from '../performedSets.ts';
import { validateWorkoutRow } from '../workoutValidation.ts';

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };
const row = { id: 'r', timestamp: 1, exercise: 'Bench', set: '1', weightLbs: '0', reps: '8', performance: 'performed' };
function fixture(kind = 'idle', policy = { restWorkSetsOnly: false }) {
  let prefs: any = { user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: 60 };
  let generation = 1, current = true, finish: any, reject: any;
  const starts: any[] = [], prompts: any[] = [], writes: any[] = [];
  const c: any = {
    useCallback: (fn: any) => fn, getConfirmedPrefs: () => prefs, notificationPrefs: prefs,
    restTimerState: { kind }, restTimerStateRef: { current: { kind } }, session: { user: { id: 'a' } },
    startRestTimer: async (...args: any[]) => starts.push(args), setRestPrompt: (v: any) => prompts.push(v),
    decideRestTimerAction: (on: boolean) => on ? 'start' : 'prompt', suggestRestSeconds: () => 90,
    canUseSession: () => true, sessionProvenanceRef: { current: { ownerId: 'a' } }, workoutId: 's', workoutDateISO: '2026-10-14',
    ownership: { busy: false, capture: () => ({}), isCurrent: () => current }, getWorkoutDraftGeneration: () => generation,
    sessionOperations: { rows: (...args: any[]) => { writes.push(args); return new Promise((r, j) => { finish = r; reject = j; }); }, flush: async () => {} },
    celebratePR: () => {}, showToast: () => {}, isPerformedRow, performedRows, validateWorkoutRow,
    COACHING_POLICY: policy, isCompoundExercise: () => true, editedRestRowsRef: { current: new Set() },
  };
  c.triggerRestTimer = sourceClosure('triggerRestTimer', c);
  c.queueLiveRows = sourceClosure('queueLiveRows', c);
  return { c, starts, prompts, writes, finish: () => finish(), reject: () => reject(new Error('disk')), prefs: (v: any) => { prefs = v; }, stale: () => { current = false; }, generation: () => { generation++; } };
}
for (const value of [false, 180]) test(`deferred ingestion uses confirmed ${value} at durable effect time`, async () => {
  const f = fixture();
  const run = sourceClosure('logPerformedRows', { ...f.c, processedRestRows: new Set(), effectOwner: {}, effectsDraftGeneration: 1 });
  run([row]); assert.equal(f.starts.length, 0);
  f.prefs({ user_id: 'a', auto_start_rest_timer: value !== false, auto_rest_duration_sec: value || 60 });
  f.finish(); await flush();
  assert.equal(f.starts.length, value === false ? 0 : 1);
  assert.equal(f.prompts.length, value === false ? 1 : 0);
  if (value !== false) assert.equal(f.starts[0][1], 180);
});
for (const route of ['inline', 'modal', 'pending']) for (const value of [false, 180]) test(`${route} planned-to-performed honors delayed ${value}; correction and replay do not restart`, async () => {
  const f = fixture(); let rows: any[] = [{ ...row, performance: 'planned', reps: '' }];
  const c = { ...f.c, editingCell: route === 'modal' ? null : { rowId: 'r', field: 'reps' }, draftRowsRef: { current: rows },
    applyPendingEdit: sourceClosure('applyPendingEdit', { useCallback: (fn: any) => fn, editingCell: { rowId: 'r', field: 'reps' }, editValue: '8', ...sourceModule('lib/workoutRules.ts') }),
    setRows: (value: any) => { rows = typeof value === 'function' ? value(rows) : value; }, setEditingCell: () => {}, setEditValue: () => {}, invalidateResponses: () => {},
    resolveEditedPerformance, normalizeExercise: (s: string) => s, resequenceSets: (r: any) => r, workoutActive: true,
  };
  if (route === 'inline') sourceClosure('commitCellEdit', c)();
  else if (route === 'pending') sourceClosure('commitPendingAndGet', c)();
  else { c.applyPendingEdit = (r: any) => ({ nextRows: r }); (c as any).withPendingRows = sourceClosure('withPendingRows', c); sourceClosure('handleSaveSet', c)(row); }
  assert.equal(f.writes.length, 1); assert.equal(f.starts.length, 0);
  f.prefs({ user_id: 'a', auto_start_rest_timer: value !== false, auto_rest_duration_sec: value || 60 });
  f.finish(); await flush(); assert.equal(f.starts.length, value === false ? 0 : 1);
  assert.equal(f.prompts.length, value === false ? 1 : 0);
  if (value !== false) assert.equal(f.starts[0][1], 180);
  const corrected = { ...row, reps: '9' }; const p = f.c.queueLiveRows([corrected], 'put', [row]); f.finish(); await p;
  assert.equal(f.starts.length, value === false ? 0 : 1);
  assert.equal(f.prompts.length, value === false ? 1 : 0);
  const replay = f.c.queueLiveRows([row], 'put', [{ ...row, performance: 'planned' }]); f.finish(); await replay;
  assert.equal(f.starts.length, value === false ? 0 : 1);
  assert.equal(f.prompts.length, value === false ? 1 : 0);
});
const rules = sourceModule('lib/workoutRules.ts');
for (const route of ['fast', 'fill', 'ai']) for (const value of [false, 180]) test(`${route} actual sendMessage honors latest confirmed ${value} after durable delay`, async () => {
  const f = fixture(); let rows: any[] = route === 'fill' ? [{ ...row, performance: 'planned', reps: '' }] : [];
  const ownership = createSessionOwnership('a:s');
  const c: any = { ...f.c, ...rules, ownership, renderOwner: ownership.capture(), messageInput: 'Bench 0 8', loading: false, workoutActive: true,
    commitPendingAndGet: () => rows, draftRowsRef: { current: rows },
    setRows: (v: any) => { rows = typeof v === 'function' ? v(rows) : v; c.draftRowsRef.current = rows; },
    decideAndParse: () => route === 'fill' ? { kind: 'fill_skeleton', targetRowIndex: 0, weight: '0', reps: '8' } : route === 'fast' ? { kind: 'fast', rows: [row] } : { kind: 'ai', reason: 'missing_reps' },
    setMessageInput: () => {}, setLoading: () => {}, scrollToBottom: () => {}, scrollToRowIndex: () => {},
    toApiRows: sourceClosure('toApiRows', {}), buildRowsFromApi: sourceClosure('buildRowsFromApi', {}),
    api: { chat: async () => ({ rows: [row] }) }, FeatureGateError: class extends Error {},
    console: { warn: (...args: any[]) => { throw new Error(String(args)); } },
  };
  await sourceClosure('sendMessage', c)(); assert.equal(f.writes.length, 1); assert.equal(f.starts.length, 0);
  f.prefs({ user_id: 'a', auto_start_rest_timer: value !== false, auto_rest_duration_sec: value || 60 });
  f.finish(); await flush(); assert.equal(f.starts.length, value === false ? 0 : 1); assert.equal(f.prompts.length, value === false ? 1 : 0);
  if (value !== false) assert.equal(f.starts[0][1], 180);
});

for (const boundary of ['failed', 'owner', 'generation', 'cardio', 'invalid', 'duplicate', 'off-active']) test(`edit rest excludes ${boundary}`, async () => {
  const f = fixture(boundary === 'off-active' ? 'running' : 'idle');
  const candidate = boundary === 'cardio' ? { ...row, isCardio: true, setKind: 'cardio' } : boundary === 'invalid' ? { ...row, reps: '-1' } : row;
  const previous = boundary === 'duplicate' ? [] : [{ ...row, performance: 'planned' }];
  const p = f.c.queueLiveRows([candidate], 'put', previous);
  if (boundary === 'failed') f.reject(); else { if (boundary === 'owner') f.stale(); if (boundary === 'generation') f.generation(); if (boundary === 'foreign-prefs') f.prefs({ user_id: 'b', auto_start_rest_timer: true, auto_rest_duration_sec: 180 }); if (boundary === 'off-active') f.prefs({ user_id: 'a', auto_start_rest_timer: false }); f.finish(); }
  await p.catch(() => {}); assert.equal(f.starts.length, 0); assert.equal(f.prompts.length, 0);
});

// Q3a guard on the planned->performed edit path: with restWorkSetsOnly on, only work sets rest.
for (const setKind of ['warmup', 'backoff', 'drop', 'work', undefined]) test(`edit rest honors restWorkSetsOnly for ${setKind ?? 'unlabelled'} sets`, async () => {
  const f = fixture('idle', { restWorkSetsOnly: true });
  const performed = { ...row, setKind };
  const p = f.c.queueLiveRows([performed], 'put', [{ ...performed, performance: 'planned' }]); f.finish(); await p;
  const rests = setKind === 'work' || setKind === undefined;
  assert.equal(f.starts.length, rests ? 1 : 0, String(setKind));
  assert.equal(f.prompts.length, 0);
  if (!rests) {
    // Same row with the flag off still rests, so the zero above is the guard, not another filter.
    const g = fixture(); const q = g.c.queueLiveRows([performed], 'put', [{ ...performed, performance: 'planned' }]); g.finish(); await q;
    assert.equal(g.starts.length, 1, `${setKind} rests when the flag is off`);
  }
});
