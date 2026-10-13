import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule, sourceClosure, renderWorkoutCard } from './workoutIdentityHarness.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { runWorkoutRoute } from './inSessionHarness.ts';

const row = { id: 'set', exercise: 'Bench', set: 0, weightLbs: '0', reps: '5', notes: 'literal', timestamp: 1, status: 'committed', performance: 'performed', setKind: 'warmup', plannedTarget: { reps: '8' } };
const draft = (rows: any[] = [row]) => ({ ownerId: 'offline-owner', workoutId: 'original', dateISO: '2026-10-07', bodyParts: ['Push'], createdAt: 1, rows, updatedAt: 2 });
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function storage(initial: any = null) {
  let raw = initial === null ? null : JSON.stringify(initial);
  const calls: string[] = [];
  const adapter = { getItem: async () => raw, setItem: async (_k: string, v: string) => { calls.push('save'); raw = v; }, removeItem: async () => { calls.push('clear'); raw = null; } };
  const actual = sourceModule('lib/workoutDraft.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: adapter } });
  const helper = { ...actual, clearWorkoutDraft: (owner = 'offline-owner', generation = actual.getWorkoutDraftGeneration()) => actual.clearWorkoutDraft(owner, generation) };
  return { helper, adapter, calls, read: () => raw && JSON.parse(raw), readRaw: () => raw };
}
// Execute exact production useEffect callback selected by its existing section label.
function effect(section: string, context: any) {
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const start = source.indexOf(section);
  assert.ok(start >= 0);
  const ast = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.getStart(ast) > start) matches.push(n); ts.forEachChild(n, visit); };
  visit(ast);
  const code = ts.transpileModule(`exports.run = ${matches[0].arguments[0].getText(ast)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {};
  vm.runInNewContext(code, { exports, ...context });
  return exports.run();
}
function route(s: ReturnType<typeof storage>, initialRows: any[] = [row]) {
  let rows = initialRows;
  const timers = new Map<number, () => void>(); let nextTimer = 0;
  const notices: string[] = []; let metadata: any; let checked = false; let background: any;
  const context: any = { ...s.helper, rows, workoutActive: true, workoutId: 'original', workoutDateISO: '2026-10-07', bodyParts: ['Push'], workoutCreatedAt: 1,
    session: { user: { id: 'offline-owner' } }, sessionProvenanceRef: { current: { ownerId: 'offline-owner', generation: s.helper.getWorkoutDraftGeneration() } }, recoveryOwnerRef: { current: null },
    canUseSession: () => true, canStartSession: () => true,
    endWorkoutSession: () => {}, setLoading: () => {}, setCoachAnswer: () => {}, setCoachOpen: () => {}, setReviewModalVisible: () => {}, setNameModalVisible: () => {}, setRoutineModalVisible: () => {},
    draftChecked: true, draftRestoredRef: { current: false }, draftSaveTimerRef: { current: null }, draftToastTimerRef: { current: null },
    draftRowsRef: { current: initialRows }, draftGeneration: s.helper.getWorkoutDraftGeneration?.() ?? 0,
    setTimeout: (fn: () => void) => { timers.set(++nextTimer, fn); return nextTimer; }, clearTimeout: (id: number) => timers.delete(id),
    setRows: (v: any) => { rows = typeof v === 'function' ? v(rows) : v; context.rows = rows; },
    restoreWorkoutSession: (...args: any[]) => { metadata = args; }, setDraftChecked: (v: boolean) => { checked = v; },
    setDraftRestoredToast: () => {}, setAiBubbleText: (s: string) => notices.push(s), showToast: (s: string) => notices.push(s),
    setMessageInput: () => {}, setEditingCell: () => {}, setEditValue: () => {}, todayISO: () => '2026-10-08',
    AppState: { addEventListener: (_: any, fn: any) => { background = fn; return { remove: () => {} }; } },
    useCallback: (fn: any) => fn, commitPendingAndGet: () => rows, applyPendingEdit: (list: any[]) => ({ nextRows: list, changed: false }), withPendingRows: (fn: any) => context.setRows(fn),
    api: { logSet: async () => ({ ok: true }) }, // New tombstone IO seam; original persistence assertions retained.
    resequenceSets: sourceModule('lib/workoutRules.ts').resequenceSets,
    Alert: { alert: (_: any, _m: any, buttons: any[]) => buttons.find(b => b.text === 'Clear').onPress() },
  };
  // New production persistence closure is loaded only if present, so RED executes old route rather than failing harness setup.
  if (readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8').includes('const persistDraftRows =')) context.persistDraftRows = sourceClosure('persistDraftRows', context);
  // The restore effect now resets rows with a VM-realm []; compare in this realm.
  return { context, timers, notices, rows: () => Array.isArray(rows) ? Array.from(rows) : rows, metadata: () => metadata, checked: () => checked, background: () => background('background'), runTimers: () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } } };
}

test('delayed storage save then clear cannot resurrect a draft', async () => {
  const s = storage(); let release!: () => void;
  s.adapter.setItem = async (_k, v) => { s.calls.push('save-start'); await new Promise<void>(r => { release = r; }); s.adapter.getItem = async () => v; };
  s.adapter.removeItem = async () => { s.calls.push('clear'); s.adapter.getItem = async () => null; };
  const save = s.helper.saveWorkoutDraft(draft()); await tick();
  const clear = s.helper.clearWorkoutDraft(); await tick(); release(); await Promise.all([save, clear]);
  assert.equal(await s.helper.getWorkoutDraft(), null);
  assert.deepEqual(s.calls, ['save-start', 'clear']);
});

for (const action of ['clear', 'delete'] as const) test(`${action} final row immediately persists empty active context and cancels old debounce`, async () => {
  const s = storage(draft()); const r = route(s);
  effect('Draft persistence: debounced autosave', r.context);
  if (action === 'clear') sourceClosure('onClearRows', r.context)();
  else sourceClosure('deleteRow', r.context)('set');
  await tick();
  assert.equal(s.read().rows.length, 0);
  assert.equal(s.read().workoutId, 'original');
  r.runTimers(); await tick();
  assert.equal((await s.helper.getWorkoutDraft()).rows.length, 0);
});

test('Clear during delayed durable delivery keeps legitimate later rows in real draft readback',async()=>{
  const s=storage(draft());const r=route(s);let release!:()=>void;
  r.context.queueLiveRows=()=>new Promise<void>(resolve=>release=resolve);
  sourceClosure('onClearRows',r.context)();await tick();
  const later={...row,id:'later',set:1};r.context.draftRowsRef.current=[row,later];
  release();await tick();
  const recovered=await s.helper.getWorkoutDraft();
  assert.deepEqual(Array.from(recovered.rows,(v:any)=>v.id),['later']);
  assert.equal(recovered.workoutId,'original');assert.equal(recovered.dateISO,'2026-10-07');
});

test('empty active autosave and background retain metadata but no old sets', async () => {
  const s = storage(draft()); const r = route(s, []);
  effect('Draft persistence: debounced autosave', r.context); r.runTimers(); await tick();
  assert.equal(s.read().rows.length, 0);
  await s.helper.saveWorkoutDraft(draft());
  effect('Draft persistence: immediate save', r.context); r.background(); await tick();
  assert.equal(s.read().rows.length, 0);
  assert.equal(s.read().dateISO, '2026-10-07');
});

for (const dateISO of ['2026-10-07', '2025-01-01']) test(`restore retains recoverable ${dateISO} draft original identity without expiry`, async () => {
  const original = { ...draft(), dateISO }; const s = storage(original); const r = route(s, []);
  effect('Draft persistence: restore on mount', r.context); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(r.rows())), original.rows);
  assert.deepEqual(JSON.parse(JSON.stringify(r.metadata())), [original.bodyParts, 'original', 1, dateISO]);
  assert.equal(r.checked(), true); assert.equal(s.calls.includes('clear'), false);
});

test('restored session title uses original date rather than mount date', () => {
  const states: any[] = []; let index = 0;
  const hook = sourceModule('hooks/useWorkoutSession.ts', {
    react: { useState: (v: any) => { const i = index++; states[i] = v; return [v, (next: any) => states[i] = next]; }, useCallback: (fn: any) => fn, useEffect: () => {}, useMemo: (fn: any) => fn() },
    'react-native': {}, '@/lib/workoutRules': { getTodayMMDD: () => '10/08', todayISO: () => '2026-10-08', makeId: () => 'new' },
  });
  const session = hook.useWorkoutSession({ onResetForNewDay: () => {} });
  session.restoreWorkoutSession(['Push'], 'original', 1, '2026-10-07');
  assert.equal(states[0], '10/07'); assert.equal(states[3], 'original'); assert.equal(states[5], '2026-10-07');
  session.startWorkoutSession(['New']);
  assert.equal(states[0], '10/08', 'new session must explicitly refresh date after an overnight recovery');
});

test('process-death parse is editable incomplete evidence with durable original input and notice', async () => {
  const input = 'Bench strange original input  ';
  const ghost = { ...row, id: 'ghost', status: 'syncing', exercise: 'Bench', weightLbs: '...', reps: '...', pendingInput: input };
  const s = storage(draft([row, ghost])); const r = route(s, []);
  effect('Draft persistence: restore on mount', r.context); await tick();
  const recovered = r.rows()[1];
  assert.equal(recovered.status, 'committed'); assert.equal(recovered.performance, 'planned');
  assert.equal(recovered.weightLbs, ''); assert.equal(recovered.reps, '');
  assert.equal(recovered.pendingInput, input); assert.ok(recovered.notes.includes(input));
  assert.ok(r.notices.some(n => /interrupted/i.test(n)));
  assert.deepEqual(JSON.parse(JSON.stringify(r.rows()[0])), row);
  r.context.rows = r.rows(); r.context.draftRowsRef.current = r.rows(); r.context.persistDraftRows = sourceClosure('persistDraftRows', r.context);
  effect('Draft persistence: immediate save', r.context); r.background(); await tick();
  assert.equal((await s.helper.getWorkoutDraft()).rows[1].pendingInput, input);
});

test('actual parse ghost preserves exact untrimmed composer input', async () => {
  const input = '  Bench and Squat 185 8  ';
  const result = await runWorkoutRoute(input);
  const ghost = result.rowTransitions.flat().find(r => r.status === 'syncing');
  assert.ok(ghost, 'fixture must exercise parse attempt, not a question');
  assert.equal(ghost.pendingInput, input);
});

for (const name of ['onStartWorkout', 'handleStartFromHome', 'confirmStartWorkout', 'handleSelectTemplateForStart', 'handleImportRoutine']) test(`${name} waits for unresolved restoration`, () => {
  const s = storage(); const r = route(s, []); const calls: string[] = [];
  Object.assign(r.context, { draftChecked: false, workoutActive: false, setNameModalVisible: () => calls.push('modal'), setRoutineModalVisible: () => calls.push('routine'), startWorkoutSession: () => calls.push('start'), expandTemplateToRows: () => [row], Platform: { OS: 'web' }, scrollToBottom: () => {}, program: null });
  sourceClosure(name, r.context)({ name: 'Routine' }, []);
  assert.deepEqual(calls, []); assert.equal(r.rows().length, 0);
});

for (const name of ['confirmStartWorkout', 'handleSelectTemplateForStart']) test(`${name} cannot silently replace an already restored recovery session`, () => {
  const s = storage(); const r = route(s); const calls: string[] = [];
  Object.assign(r.context, { setNameModalVisible: () => {}, startWorkoutSession: () => calls.push('start'), expandTemplateToRows: () => [], Platform: { OS: 'web' } });
  sourceClosure(name, r.context)({ name: 'Routine' }, []);
  assert.deepEqual(calls, []); assert.equal(r.rows().length, 1);
});

for (const operation of ['save', 'clear']) test(`${operation} failure rejects visibly and does not poison queue`, async () => {
  const s = storage(draft());
  if (operation === 'save') s.adapter.setItem = async () => { throw new Error('offline storage failure'); };
  else s.adapter.removeItem = async () => { throw new Error('offline storage failure'); };
  await assert.rejects(operation === 'save' ? s.helper.saveWorkoutDraft(draft([])) : s.helper.clearWorkoutDraft());
  assert.equal((await s.helper.getWorkoutDraft()).rows.length, 1);
});

for (const value of [{ ...draft(), rows: null }, { ...draft(), rows: [null] }, { ...draft(), dateISO: 'bad' }]) test('malformed draft remains stored and cannot unlock a destructive new session', async () => {
  const s = storage(value); const r = route(s, []);
  effect('Draft persistence: restore on mount', r.context); await tick();
  assert.equal(r.checked(), false); assert.equal(r.rows().length, 0);
  assert.ok(r.notices.length); assert.deepEqual(s.read(), value);
});

test('storage read failure leaves recovery unresolved and visible', async () => {
  const s = storage(draft()); s.adapter.getItem = async () => { throw new Error('read failed'); };
  const r = route(s, []); effect('Draft persistence: restore on mount', r.context); await tick();
  assert.equal(r.checked(), false); assert.ok(r.notices.length);
});

test('same-render background after clear cannot write old rows', async () => {
  const s = storage(draft()); const r = route(s);
  effect('Draft persistence: immediate save', r.context);
  sourceClosure('onClearRows', r.context)(); r.background(); await tick();
  assert.equal((await s.helper.getWorkoutDraft()).rows.length, 0);
});

test('auth or End clear invalidates an already scheduled autosave', async () => {
  const s = storage(draft()); const r = route(s);
  effect('Draft persistence: debounced autosave', r.context);
  await s.helper.clearWorkoutDraft(); r.runTimers(); await tick();
  assert.equal(await s.helper.getWorkoutDraft(), null);
});

test('clear during delayed restoration cannot restore the removed cache', async () => {
  const s = storage(draft()); let release!: () => void; let delayed = true;
  // Delay only restoration's read; owner-scoped clear performs its own read.
  s.adapter.getItem = async () => { if (delayed) { delayed = false; await new Promise<void>(resolve => { release = resolve; }); } return JSON.stringify(draft()); };
  const r = route(s, []); effect('Draft persistence: restore on mount', r.context); await tick();
  const clear = s.helper.clearWorkoutDraft(); release(); await clear; await tick();
  assert.equal(r.rows().length, 0); assert.equal(r.metadata(), undefined);
});

test('unmounted restore callback cannot overwrite another mounted session', async () => {
  const s = storage(draft()); let release!: () => void;
  s.adapter.getItem = async () => { await new Promise<void>(resolve => { release = resolve; }); return JSON.stringify(draft()); };
  const r = route(s, []); const cleanup = effect('Draft persistence: restore on mount', r.context); await tick();
  if (cleanup) cleanup(); release(); await tick();
  assert.equal(r.rows().length, 0); assert.equal(r.metadata(), undefined);
});

test('same-render sequential deletes never restore a previously deleted row', async () => {
  const first = row; const second = { ...row, id: 'second', set: 1 }; const s = storage(draft([first, second]));
  const r = route(s, [first, second]); r.context.commitPendingAndGet = () => [first, second];
  const remove = sourceClosure('deleteRow', r.context); remove('set'); remove('second'); await tick();
  assert.equal(r.rows().length, 0); assert.equal((await s.helper.getWorkoutDraft()).rows.length, 0);
});

// Real session hook, real route options/reset/restore closures and real queued
// storage helper; doubles only for React scheduling, clock and native storage.
function midnightSession(r: ReturnType<typeof route>) {
  let today = '10/08'; let index = 0; let interval: any; let foreground: any;
  const states: any[] = []; const effects: (() => void)[] = [];
  const hook: any = {};
  const dependencies: any = {
    react: {
      useState: (v: any) => { const i = index++; if (!(i in states)) states[i] = v; return [states[i], (next: any) => { states[i] = next; }]; },
      useCallback: (fn: any) => fn, useMemo: (fn: any) => fn(), useEffect: (fn: any) => effects.push(fn),
    },
    'react-native': { AppState: { addEventListener: (_: any, fn: any) => { foreground = fn; return { remove() {} }; } } },
    '@/lib/workoutRules': { getTodayMMDD: () => today, todayISO: () => `2026-${today.replace('/', '-')}`, makeId: () => 'accidental-new' },
  };
  const hookSource = readFileSync(new URL('../../hooks/useWorkoutSession.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(hookSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: hook, require: (name: string) => { assert.ok(name in dependencies); return dependencies[name]; },
    setInterval: (fn: any) => { interval = fn; return 1; }, clearInterval() {}, console,
  });
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let options = '';
  const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useWorkoutSession') options = n.arguments[0].getText(ast); ts.forEachChild(n, visit); };
  visit(ast); assert.ok(options);
  const optionsCode = ts.transpileModule(`exports.options = ${options};`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const render = () => {
    index = 0; effects.length = 0;
    const exports: any = {};
    vm.runInNewContext(optionsCode, { exports, ...r.context, onResetForNewDay: sourceClosure('onResetForNewDay', r.context) });
    const session = hook.useWorkoutSession(exports.options);
    for (const fn of effects) fn();
    return session;
  };
  return { render, advance: () => { today = '10/09'; }, interval: () => interval(), foreground: () => foreground('active') };
}

for (const failure of ['malformed', 'read-error']) test(`midnight ${failure} recovery remains unresolved and raw data survives automatic cleanup`, async () => {
  const value = failure === 'malformed' ? { ...draft(), rows: null } : draft();
  const s = storage(value); const r = route(s, []);
  Object.assign(r.context, { draftChecked: false, workoutActive: false, setLoading: () => {} });
  if (failure === 'read-error') s.adapter.getItem = async () => { throw new Error('untrusted private error'); };
  const h = midnightSession(r); h.render();
  effect('Draft persistence: restore on mount', r.context); await tick();
  h.advance(); h.interval(); h.foreground(); await tick();
  assert.deepEqual(s.read(), value, 'automatic rollover must not delete unresolved recovery');
  assert.equal(s.readRaw(), JSON.stringify(value));
  assert.deepEqual(s.calls, []); assert.equal(r.checked(), false); assert.equal(r.metadata(), undefined);
  assert.ok(r.notices.some(n => /Recovery data was kept/.test(n)));
  assert.ok(r.notices.every(n => !n.includes('untrusted private error')));
});

test('route reset callback itself refuses unresolved recovery cleanup', async () => {
  const original = draft(); const s = storage(original); const r = route(s, [row]);
  Object.assign(r.context, { draftChecked: false, setLoading: () => assert.fail('must not reset pending recovery UI') });
  sourceClosure('onResetForNewDay', r.context)('10/09'); await tick();
  assert.deepEqual(s.read(), original); assert.deepEqual(r.rows(), [row]); assert.deepEqual(s.calls, []);
});

test('resolved empty recovery still allows normal rollover then new session', async () => {
  const s = storage(); const r = route(s, []);
  Object.assign(r.context, { draftChecked: false, workoutActive: false, setLoading: () => {} });
  const h = midnightSession(r); h.render();
  r.context.setDraftChecked = (v: boolean) => { r.context.draftChecked = v; };
  effect('Draft persistence: restore on mount', r.context); await tick();
  assert.equal(r.context.draftChecked, true);
  h.render(); h.advance(); h.interval(); await tick();
  let session = h.render(); assert.equal(session.title, '10/09 Workout');
  // Superseded P1 assertion (was ['clear']): rollover no longer deletes recovery.
  // Inactive + resolved recovery implies no stored draft for this owner.
  assert.deepEqual(s.calls, []);
  session.startWorkoutSession(['Pull']); session = h.render();
  assert.equal(session.workoutId, 'accidental-new'); assert.equal(session.workoutDateISO, '2026-10-09');
});

test('valid deferred restore spanning midnight keeps original identity/date and blocks restart', async () => {
  const original = draft(); const s = storage(original); const r = route(s, []);
  Object.assign(r.context, { draftChecked: false, workoutActive: false, setLoading: () => {} });
  let release!: () => void;
  s.adapter.getItem = async () => { await new Promise<void>(resolve => { release = resolve; }); return JSON.stringify(original); };
  const h = midnightSession(r); let session = h.render();
  r.context.restoreWorkoutSession = (...args: any[]) => session.restoreWorkoutSession(...args);
  r.context.setDraftChecked = (v: boolean) => { r.context.draftChecked = v; };
  effect('Draft persistence: restore on mount', r.context); await tick();
  h.advance(); h.interval(); h.foreground(); release(); await tick();
  assert.deepEqual(s.read(), original); assert.deepEqual(s.calls, []);
  session = h.render();
  assert.equal(s.readRaw(), JSON.stringify(original));
  assert.equal(session.workoutId, 'original'); assert.equal(session.workoutDateISO, original.dateISO);
  assert.equal(session.workoutCreatedAt, 1); assert.equal(session.title, '10/07 Push');
  assert.deepEqual(JSON.parse(JSON.stringify(r.rows())), original.rows);
  Object.assign(r.context, session, { startWorkoutSession: () => assert.fail('must not restart'), setNameModalVisible: () => {} });
  sourceClosure('confirmStartWorkout', r.context)(['New']);
  h.interval(); h.foreground(); await tick(); assert.deepEqual(s.calls, []);
});

// Render actual WorkoutCard JSX children through React's real reconciler.
// Native host components are mapped to spans; malformed plain children are not
// converted, so the original object-child defect really throws.
function renderRecoveredCards(rows: any[]) {
  const element = (node: any, key = 'root'): any => Array.isArray(node) ? node.map((child, i) => element(child, `${key}.${i}`)) :
    node && typeof node === 'object' && 'type' in node && 'props' in node ?
      createElement('span', { key }, element(node.props.children, key)) : node;
  return rows.map(row => renderToStaticMarkup(element(renderWorkoutCard(row)))).join('');
}

test('object planned target rejects at actual storage/restore boundary before React sees it', async () => {
  const corrupt = { ...row, plannedTarget: { reps: { private: 'untrusted metadata' } } };
  assert.throws(() => renderRecoveredCards([corrupt]), /Objects are not valid as a React child/);
  const original = draft([corrupt]); const s = storage(original); const r = route(s, []);
  await assert.rejects(s.helper.getWorkoutDraft(), /Stored recovery data has not been removed/);
  effect('Draft persistence: restore on mount', r.context); await tick();
  assert.equal(r.checked(), false); assert.equal(r.metadata(), undefined); assert.deepEqual(r.rows(), []);
  assert.deepEqual(s.read(), original); assert.deepEqual(s.calls, []);
  assert.ok(r.notices.some(n => /Recovery data was kept/.test(n)));
  assert.equal(s.readRaw(), JSON.stringify(original));
  assert.ok(r.notices.every(n => !n.includes('untrusted metadata')));
  assert.doesNotThrow(() => renderRecoveredCards(r.rows()));
});

const optionalBadValues: Record<string, any[]> = {
  status: ['unknown', null, {}, [], 1, true],
  performance: ['unknown', null, {}, [], 1, false],
  setKind: ['unknown', null, {}, [], 1, true],
  pendingInput: [null, {}, [], 1, false],
  isRest: [null, {}, [], 'false', 0],
  isCardio: [null, {}, [], 'true', 1],
  distanceUnit: ['yards', null, {}, [], 1, true],
  durationMins: [null, {}, [], '5', true],
  distance: [null, {}, [], '5', true],
  heartRate: [null, {}, [], '5', true],
  calories: [null, {}, [], '5', true],
  level: [null, {}, [], '5', true],
  plannedTarget: [null, [], {}, '8', 8, true, { reps: null }, { reps: [] }, { reps: 8 }, { reps: true },
    { reps: '8', weightLbs: null }, { reps: '8', weightLbs: {} }, { reps: '8', weightLbs: [] }, { reps: '8', weightLbs: 0 }],
};
for (const [field, values] of Object.entries(optionalBadValues)) for (const value of values) {
  test(`invalid optional ${field}=${JSON.stringify(value)} rejects without restore or mutation`, async () => {
    const original = draft([{ ...row, [field]: value }]); const s = storage(original); const r = route(s, []);
    await assert.rejects(s.helper.getWorkoutDraft(), /Stored recovery data has not been removed/);
    effect('Draft persistence: restore on mount', r.context); await tick();
    assert.equal(r.checked(), false); assert.equal(r.metadata(), undefined); assert.deepEqual(r.rows(), []);
    assert.deepEqual(s.read(), original); assert.deepEqual(s.calls, []);
    assert.equal(s.readRaw(), JSON.stringify(original));
    assert.ok(r.notices.some(n => /Recovery data was kept/.test(n)));
    Object.assign(r.context, { draftChecked: r.checked(), workoutActive: false, startWorkoutSession: () => assert.fail('must not unlock'), setNameModalVisible: () => {} });
    sourceClosure('confirmStartWorkout', r.context)(['New']);
    assert.doesNotThrow(() => renderRecoveredCards(r.rows()));
  });
}
for (const field of ['durationMins', 'distance', 'heartRate', 'calories', 'level']) {
  test(`nonfinite persisted ${field} rejects without raw deletion`, async () => {
    const s = storage(); const raw = JSON.stringify(draft([{ ...row, [field]: 'NONFINITE' }])).replace('"NONFINITE"', '1e999');
    s.adapter.getItem = async () => raw;
    await assert.rejects(s.helper.getWorkoutDraft()); assert.deepEqual(s.calls, []);
    assert.equal(await s.adapter.getItem(), raw);
  });
}

test('empty row identity cannot enter recovery UI', async () => {
  const s = storage(draft([{ ...row, id: '' }])); await assert.rejects(s.helper.getWorkoutDraft()); assert.deepEqual(s.calls, []);
});

test('legacy absent metadata, zero/bodyweight and valid target/cardio metadata remain compatible', async () => {
  const legacy: any = { ...row }; for (const field of ['status', 'performance', 'setKind', 'plannedTarget']) delete legacy[field];
  const rows = [legacy, { ...row, id: 'target', plannedTarget: { reps: '8', weightLbs: '0', future: { data: true } }, pendingInput: ' exact  ', isRest: false, isCardio: false, futureMetadata: ['forward compatible'] },
    { ...row, id: 'rest', isRest: true, plannedTarget: { reps: '' }, pendingInput: '' },
    { ...row, id: 'planned', performance: 'planned', plannedTarget: { reps: '8' }, weightLbs: '', reps: '' },
    ...['miles', 'km', 'meters'].map((unit, i) => ({ ...row, id: `cardio${i}`, isCardio: true, durationMins: 0, distance: 0, distanceUnit: unit, heartRate: 125, calories: 0, level: 1, setKind: 'cardio' })),
    ...['work', 'warmup', 'backoff', 'drop', 'superset', 'cardio'].map((setKind, i) => ({ ...row, id: `kind${i}`, setKind }))];
  const original = { ...draft(rows), futureSession: { version: 2 } }; const s = storage(original); const r = route(s, []);
  assert.deepEqual(JSON.parse(JSON.stringify(await s.helper.getWorkoutDraft())), original);
  effect('Draft persistence: restore on mount', r.context); await tick();
  assert.equal(r.checked(), true); assert.deepEqual(JSON.parse(JSON.stringify(r.rows())), rows);
  assert.doesNotThrow(() => renderRecoveredCards(r.rows())); assert.deepEqual(s.read(), original); assert.deepEqual(s.calls, []);
});

test('rerender of a cleared session cannot adopt auth cleanup generation', async () => {
  const s = storage();
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  const draftGeneration'); const end = source.indexOf('  const persistDraftRows', start);
  const code = ts.transpileModule(`exports.bind = (workoutId) => { ${source.slice(start, end)} return draftGeneration; };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: any = {}; let ref: any;
  vm.runInNewContext(code, { exports, getWorkoutDraftGeneration: s.helper.getWorkoutDraftGeneration, useRef: (v: any) => ref ??= { current: v } });
  const first = exports.bind('original'); await s.helper.clearWorkoutDraft();
  assert.equal(exports.bind('original'), first);
  assert.equal(exports.bind('new'), s.helper.getWorkoutDraftGeneration());
});
