import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';

export const deferred = () => {
  let resolve!: (value?: any) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const row = { id: 'set-original', exercise: 'Bench', set: 1, weightLbs: '100', reps: '5', notes: 'literal', performance: 'performed', timestamp: 1 };
const tick = () => new Promise(resolve => setImmediate(resolve));
export function fixture() {
  const review = deferred(); const save = deferred();
  const calls: any[] = []; let rows: any[] = [structuredClone(row)];
  const helper = existsSync(new URL('../sessionOwnership.ts', import.meta.url)) ? sourceModule('lib/sessionOwnership.ts') : null;
  const ownership = helper?.createSessionOwnership('user:original');
  const ctx: any = {
    ownership, renderOwner: ownership?.capture(), draftGeneration: 0, getWorkoutDraftGeneration: () => 0, useCallback: (fn: any) => fn, workoutId: 'original', workoutActive: true,
    rows, draftRowsRef: { current: rows }, selectedPart: 'Push', savedWorkoutIdRef: { current: null },
    setRows: (value: any) => { rows = typeof value === 'function' ? value(rows) : value; ctx.rows = rows; ctx.draftRowsRef.current = rows; },
    setMessageInput: () => {}, setEditingCell: () => {}, setEditValue: () => {},
    setReviewModalVisible: () => {}, setReviewLoading: () => {}, setSessionReview: () => {},
    setSavePhase: (phase: string) => calls.push(['phase', phase]),
    showToast: (text: string) => calls.push(['toast', text]),
    invalidateResponses: () => { ownership?.invalidateRequests(); },
    api: { generateSessionReview: () => { calls.push(['review']); return review.promise; } },
    buildWorkoutToSave: (rows: any[]) => ({ id: 'original', rows }),
    saveWorkoutLocalFirst: (payload: any, options: any) => { calls.push(['save', payload, options]); return save.promise; },
    clearWorkoutDraft: async () => { calls.push(['clear']); },
    endWorkoutSession: () => calls.push(['end']),
    persistDraftRows: (rows: any[]) => calls.push(['draft', rows]),
    Platform: { OS: 'web' }, console: { error: (...args: any[]) => calls.push(['error', ...args]) },
    settleOptionalReview: helper?.settleOptionalReview,
  };
  return { ctx, calls, review, save, rows: () => rows, run: () => sourceClosure('handleEndWorkoutWithReview', ctx)(ctx.rows) };
}

test('real local-first storage writes performance before review and persists valid review in final history', async () => {
  const review = deferred(); let raw: string | null = null; const sent: any[] = [];
  const storage = sourceModule('lib/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } } },
    './api': { api: { saveWorkout: async (payload: any) => sent.push(payload) } },
  });
  const save = storage.saveWorkout({ id: 'original', rows: [row], dateISO: '2026-10-09', part: 'Push', createdAt: 1 }, { review: review.promise });
  await tick();
  assert.equal(JSON.parse(raw!)[0].rows[0].id, 'set-original');
  assert.equal(sent.length, 0, 'review should be included when it promptly succeeds');
  review.resolve({ rating: 5, strengths: [], weakness: '', nextSessionNote: '', generatedAt: 2 });
  await save;
  assert.equal(JSON.parse(raw!)[0].review.generatedAt, 2);
  assert.equal(sent[0].review.generatedAt, 2);
});

function aiFixture(question = false) {
  const f = fixture(); const chat = deferred(); const rules = sourceModule('lib/workoutRules.ts');
  Object.assign(f.ctx, rules, {
    messageInput: question ? 'Should I stop?' : 'offline parse input', loading: false, workoutDateISO: '2026-10-09',
    editingCell: null, applyPendingEdit: (rows: any[]) => ({ nextRows: rows }),
    commitPendingAndGet: () => f.rows(),
    decideAndParse: () => ({ kind: 'ai', reason: question ? 'conversational_question' : 'missing_reps' }),
    toApiRows: sourceClosure('toApiRows', {}), buildRowsFromApi: sourceClosure('buildRowsFromApi', {}),
    setLoading: (value: any) => f.calls.push(['loading', value]),
    setAiBubbleText: (text: any) => f.calls.push(['bubble', text]),
    saveWorkoutChatQA: async (...args: any[]) => f.calls.push(['history', ...args]),
    celebratePR: (...args: any[]) => f.calls.push(['pr', ...args]),
    triggerRestTimer: (...args: any[]) => f.calls.push(['rest', ...args]),
    scrollToBottom: () => {}, scrollToRowIndex: () => {}, isCompoundExercise: () => true,
    FeatureGateError: class extends Error {}, showAiLimitAlert: () => {},
    Alert: { alert: (_title: any, _copy: any, buttons: any[]) => buttons[1].onPress() },
    console: { warn: (...args: any[]) => { throw new Error('unexpected caught route error: ' + args); }, error: (...args: any[]) => { throw new Error('unexpected route error: ' + args); } },
  });
  f.ctx.api.chat = () => chat.promise;
  f.ctx.api.logSet = async (payload: any) => { f.calls.push([payload.operation === 'drop' ? 'drop' : 'log', payload]); return { pr: payload.operation === 'drop' ? null : { liftName: 'Bench' } }; };
  f.ctx.withPendingRows = sourceClosure('withPendingRows', f.ctx);
  f.ctx.invalidateResponses = () => sourceClosure('invalidateResponses', f.ctx)();
  Object.assign(f.ctx, Object.fromEntries(['setCoachLoading','setCoachAnswer','setCoachError','setCoachOpen','setRestPrompt'].map(name => [name, () => {}])));
  return { ...f, chat, send: () => sourceClosure('sendMessage', f.ctx)() };
}

test('actual late parse after confirmed Clear cannot restore rows or emit log/rest/PR effects', async () => {
  const f = aiFixture(); const pending = f.send();
  sourceClosure('onClearRows', f.ctx)();
  await tick(); // Clear now persists destructive intent before removing UI rows.
  assert.equal(f.rows().length, 0);
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] });
  await pending; await tick();
  assert.equal(f.rows().length, 0, 'cleared table cannot be resurrected');
  assert.equal(f.calls.filter(c => ['log','rest','pr'].includes(c[0])).length, 0);
});

test('actual late question after End cannot return a bubble or write history', async () => {
  const f = aiFixture(true); const pending = f.send(); const ending = f.run();
  f.chat.resolve({ answer: 'obsolete answer' }); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'bubble' && c[1] === 'obsolete answer').length, 0);
  assert.equal(f.calls.filter(c => c[0] === 'history').length, 0);
  f.review.resolve(null); f.save.resolve({ synced: true }); await ending;
});

test('actual old finally cannot unlock a newer request after Clear', async () => {
  const f = aiFixture(true); const first = f.send();
  sourceClosure('onClearRows', f.ctx)();
  const secondResponse = deferred(); f.ctx.api.chat = () => secondResponse.promise;
  const second = f.send(); const mark = f.calls.length;
  f.chat.resolve({ answer: 'old' }); await first;
  assert.equal(f.calls.slice(mark).filter(c => c[0] === 'loading' && c[1] === false).length, 0);
  secondResponse.resolve({ answer: 'new current answer' }); await second;
  assert.ok(f.calls.some(c => c[0] === 'bubble' && c[1] === 'new current answer'));
  assert.equal(f.calls.filter(c => c[0] === 'history').length, 1);
});

test('actual deletion of pending ghost cannot be replaced by a late parse', async () => {
  const f = aiFixture(); const pending = f.send();
  const ghost = f.rows().find(r => r.status === 'syncing'); assert.ok(ghost);
  sourceClosure('deleteRow', f.ctx)(ghost.id);
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] }); await pending;
  assert.equal(f.rows().length, 1); assert.equal(f.rows()[0].id, 'set-original');
  assert.equal(f.calls.filter(c => c[0] === 'log').length, 0);
});

test('actual new-session Start invalidates old parse before the next render', async () => {
  const f = aiFixture(); const pending = f.send();
  Object.assign(f.ctx, { draftChecked: true, workoutActive: false, setNameModalVisible: () => {}, startWorkoutSession: () => {} });
  sourceClosure('confirmStartWorkout', f.ctx)('New');
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] }); await pending;
  assert.equal(f.rows().length, 0);
});

test('actual coach stream and final answer are fenced; old finally leaves newer request locked', async () => {
  const f = aiFixture(); const firstResponse = deferred(); const secondResponse = deferred(); const chunks: any[] = [];
  Object.assign(f.ctx, { coachQuestion: 'Question', coachLoading: false,
    setCoachAnswer: (value: any) => f.calls.push(['coachAnswer', value]),
    setCoachLoading: (value: any) => f.calls.push(['coachLoading', value]),
    saveCoachChatQA: async (...args: any[]) => f.calls.push(['coachHistory', ...args]),
  });
  f.ctx.api.askCoach = (_q: any, _rows: any, onChunk: any) => { chunks.push(onChunk); return chunks.length === 1 ? firstResponse.promise : secondResponse.promise; };
  const submit = () => sourceClosure('submitCoachQuestion', f.ctx)();
  const first = submit(); sourceClosure('onClearRows', f.ctx)(); const second = submit(); const mark = f.calls.length;
  chunks[0]('obsolete chunk'); firstResponse.resolve({ answer: 'obsolete final' }); await first;
  assert.equal(f.calls.slice(mark).filter(c => c[0] === 'coachAnswer' || c[0] === 'coachHistory' || c[0] === 'coachLoading').length, 0);
  chunks[1]('valid chunk'); secondResponse.resolve({ answer: 'valid final' }); await second;
  assert.ok(f.calls.some(c => c[0] === 'coachAnswer' && c[1] === 'valid final'));
  assert.equal(f.calls.filter(c => c[0] === 'coachHistory').length, 1);
});

test('actual parse response requires its original syncing ghost to still exist', async () => {
  const f = aiFixture(); const pending = f.send();
  f.ctx.setRows(f.rows().filter(r => r.status !== 'syncing'));
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] }); await pending;
  assert.equal(f.rows().length, 1); assert.equal(f.calls.filter(c => c[0] === 'log').length, 0);
});

test('actual late live log acknowledgement cannot celebrate a PR after End', async () => {
  const f = aiFixture(); const ack = deferred();
  f.ctx.decideAndParse = () => ({ kind: 'fast', rows: [{ exercise: 'Squat', weightLbs: '100', reps: '5', notes: '', kind: 'normal' }] });
  f.ctx.api.logSet = () => ack.promise;
  await f.send(); const ending = f.run();
  ack.resolve({ pr: { liftName: 'Squat' } }); await tick();
  assert.equal(f.calls.filter(c => c[0] === 'pr').length, 0);
  f.review.resolve(null); f.save.resolve({ synced: true }); await ending;
});

test('actual typed done dispatches through button confirmation path', async () => {
  const f = aiFixture(); let buttonEnds = 0;
  f.ctx.decideAndParse = () => ({ kind: 'end_workout' });
  f.ctx.onEndWorkout = async () => buttonEnds++;
  f.ctx.handleEndWorkoutWithReview = () => f.calls.push(['directEnd']);
  await f.send();
  assert.equal(buttonEnds, 1);
});

test('owner change and unmount invalidate pending End without unlocking another owner', async () => {
  const f = fixture();
  assert.equal(typeof f.ctx.ownership.setOwner, 'function', 'session/auth identity change must be fenced');
  assert.equal(typeof f.ctx.ownership.dispose, 'function', 'unmount must invalidate callbacks');
  const old = f.run(); f.ctx.ownership.setOwner('user:new');
  f.ctx.setRows([{ ...row, id: 'new-owner-row' }]);
  const newer = f.ctx.ownership.beginEnd(f.rows());
  f.review.resolve({ rating: 5 }); f.save.resolve({ synced: true }); await old;
  assert.equal(f.rows()[0].id, 'new-owner-row'); assert.equal(f.calls.filter(c => c[0] === 'clear' || c[0] === 'end').length, 0);
  assert.equal(f.ctx.ownership.isCurrentEnd(newer), true);
  f.ctx.ownership.dispose(); assert.equal(f.ctx.ownership.isCurrentEnd(newer), false);
});

for (const [name, args] of [
  ['onClearRows', []], ['deleteRow', ['set-original']], ['beginCellEdit', ['set-original', 'notes', 'changed']],
  ['commitCellEdit', []], ['handleReorderRow', [0, 1]], ['handleImportRoutine', [{ name: 'Routine' }, []]],
  ['handleOpenEditSet', ['set-original']], ['openCoach', []], ['sendMessage', []],
] as const) {
  test(`actual ${name} cannot mutate a finalizing session`, async () => {
    const f = aiFixture(); f.ctx.setRows([row, { ...row, id: 'second' }]);
    Object.assign(f.ctx, { draftChecked: true, editingCell: { rowId: 'set-original', field: 'notes' },
      editValue: 'changed', scrollRef: { current: null }, requestAnimationFrame: (fn: any) => fn(),
      applyPendingEdit: (rows: any[]) => ({ nextRows: rows.map(r => ({ ...r, notes: 'changed' })), changed: true }),
    });
    for (const setter of ['setEditingCell','setEditValue','setRoutineModalVisible','setTargetRowId','setEditSetModalVisible','setCoachOpen']) f.ctx[setter] = () => f.calls.push(['mutation', setter]);
    f.ctx.Alert = { alert: () => f.calls.push(['mutation', 'alert']) };
    f.ctx.ownership.beginEnd(f.rows());
    const before = JSON.stringify(f.rows());
    await sourceClosure(name, f.ctx)(...args);
    assert.equal(JSON.stringify(f.rows()), before);
    assert.equal(f.calls.filter(c => c[0] === 'mutation' || c[0] === 'draft').length, 0);
  });
}

test('actual confirming End invalidates pending parse immediately and leaves an editable interrupted row on Cancel', async () => {
  const f = aiFixture(); const pending = f.send(); const alerts: any[] = [];
  f.ctx.Alert = { alert: (...args: any[]) => alerts.push(args) };
  const ending = sourceClosure('onEndWorkout', f.ctx)();
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] }); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'log').length, 0);
  alerts[0][2][0].onPress(); await ending;
  const interrupted = f.rows().find(r => r.id !== 'set-original');
  assert.ok(interrupted); assert.equal(interrupted.status, 'committed'); assert.equal(interrupted.performance, 'planned');
  assert.equal(interrupted.pendingInput, 'offline parse input');
  assert.equal(interrupted.reps, ''); assert.equal(interrupted.weightLbs, '');
});

function ownershipEffect(section: string, context: any, contains?: string) {
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const start = source.indexOf(section); assert.ok(start >= 0, 'actual route must wire ' + section);
  const ast = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.getStart(ast) > start) matches.push(n); ts.forEachChild(n, visit); }; visit(ast);
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(`exports.run = ${(contains ? matches.find(n => n.getText(ast).includes(contains))! : matches[0]).arguments[0].getText(ast)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, canUseSession: () => true, ...context });
  return exports.run();
}

test('actual mount cleanup fences late parse and a remounted request is not unlocked by old finally', async () => {
  const f = aiFixture();
  const cleanup = ownershipEffect('Session ownership: mount/unmount', f.ctx);
  const first = f.send(); cleanup();
  ownershipEffect('Session ownership: mount/unmount', f.ctx);
  const nextResponse = deferred(); f.ctx.api.chat = () => nextResponse.promise;
  const second = f.send(); const mark = f.calls.length;
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] }); await first;
  assert.equal(f.calls.slice(mark).filter(c => ['log','rest','pr'].includes(c[0]) || (c[0] === 'loading' && c[1] === false)).length, 0);
  nextResponse.resolve({ answer: 'current' }); await second;
});

test('actual render owner includes auth and original workout identity, and changes fence pending save', async () => {
  const f = fixture();
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /ownership\.setOwner\(sessionOwnerKey\)/, 'ownership must synchronize in render, not only after an effect');
  const key = sourceClosure('sessionOwnerKey', { session: { user: { id: 'user-A' } }, workoutId: 'original', savedWorkoutIdRef: { current: null } });
  assert.equal(key, 'user-A:original');
  f.ctx.ownership.setOwner(key); const pending = f.run();
  f.ctx.ownership.setOwner(sourceClosure('sessionOwnerKey', { session: { user: { id: 'user-B' } }, workoutId: 'new', savedWorkoutIdRef: { current: null } }));
  f.ctx.setRows([{ ...row, id: 'new' }]); f.save.resolve({ synced: true }); f.review.resolve(null); await pending;
  assert.equal(f.rows()[0].id, 'new'); assert.equal(f.calls.filter(c => c[0] === 'clear').length, 0);
});

test('actual End commit uses latest same-render row identity, not the stale render snapshot', () => {
  const f = fixture(); f.ctx.editingCell = null;
  f.ctx.draftRowsRef.current = [...f.rows(), { ...row, id: 'same-render-new' }];
  const committed = sourceClosure('commitPendingAndGet', f.ctx)();
  assert.equal(committed.length, 2); assert.equal(committed[1].id, 'same-render-new');
});

test('real storage late optional review cannot rewrite a newer owner history or dispatch under new auth', async () => {
  const review = deferred(); let current = true; let raw: string | null = null; let remote = 0;
  const storage = sourceModule('lib/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } } },
    './api': { api: { saveWorkout: async () => { remote++; } } },
  });
  const pending = storage.saveWorkout({ id: 'old', rows: [row], dateISO: '2026-10-09', part: 'Push', createdAt: 1 }, { review: review.promise, isCurrent: () => current });
  await tick(); current = false; raw = JSON.stringify([{ id: 'new-owner-history', rows: [] }]);
  review.resolve({ rating: 5, generatedAt: 2 }); await pending;
  assert.equal(JSON.parse(raw!)[0].id, 'new-owner-history'); assert.equal(remote, 0);
});

test('real storage old remote acknowledgement cannot overwrite a newer owner local history', async () => {
  const ack = deferred(); let current = true; let raw: string | null = null;
  const storage = sourceModule('lib/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } } },
    './api': { api: { saveWorkout: () => ack.promise } },
  });
  const pending = storage.saveWorkout({ id: 'old', rows: [row] }, { isCurrent: () => current });
  await tick(); current = false; raw = JSON.stringify([{ id: 'new-owner-history' }]);
  ack.resolve(); await pending; assert.equal(JSON.parse(raw!)[0].id, 'new-owner-history');
});

for (const [name, args] of [
  ['handleImportRoutine', [{ name: 'Routine' }, []]],
  ['beginCellEdit', ['set-original', 'notes', 'edited']],
  ['handleReorderRow', [0, 0]],
  ['withPendingRows', [(rows: any[]) => rows]],
] as const) test(`actual ${name} invalidates stale parse context and preserves editable input`, async () => {
  const f = aiFixture(); const pending = f.send();
  Object.assign(f.ctx, { draftChecked: true, setRoutineModalVisible: () => {}, scrollRef: { current: null }, requestAnimationFrame: (fn: any) => fn(), setEditingCell: () => {}, setEditValue: () => {} });
  sourceClosure(name, f.ctx)(...args);
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] }); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'log').length, 0);
  assert.ok(f.rows().some(r => r.pendingInput === 'offline parse input' && r.performance === 'planned' && r.status === 'committed'));
});

test('actual fast composer route is also frozen during End', async () => {
  const f = aiFixture();
  f.ctx.decideAndParse = () => ({ kind: 'fast', rows: [{ exercise: 'Squat', weightLbs: '100', reps: '5', notes: '' }] });
  f.ctx.ownership.beginEnd(f.rows()); await f.send();
  assert.equal(f.rows().length, 1); assert.equal(f.calls.filter(c => c[0] === 'log').length, 0);
});

test('actual delayed Clear confirmation cannot clear a newer session', () => {
  const f = aiFixture(); const alerts: any[] = []; f.ctx.Alert = { alert: (...args: any[]) => alerts.push(args) };
  sourceClosure('onClearRows', f.ctx)();
  f.ctx.ownership.setOwner('user:new'); f.ctx.setRows([{ ...row, id: 'new-session' }]);
  alerts[0][2][1].onPress(); assert.equal(f.rows()[0]?.id, 'new-session');
});

test('actual P1 draft invalidation before save resolves prevents old End clearing replacement recovery', async () => {
  const f = fixture(); let generation = 0;
  Object.assign(f.ctx, { draftGeneration: 0, getWorkoutDraftGeneration: () => generation });
  const pending = f.run(); generation++;
  f.ctx.setRows([{ ...row, id: 'replacement' }]); f.save.resolve({ synced: true }); f.review.resolve(null); await pending;
  assert.equal(f.rows()[0]?.id, 'replacement'); assert.equal(f.calls.filter(c => c[0] === 'clear').length, 0);
  assert.equal(f.ctx.ownership.busy, false, 'invalidated token cannot strand a finalization latch');
});

test('actual owner-change presentation reset removes old answers, review and frozen save phase', () => {
  const f = aiFixture(); const changes: any[] = [];
  Object.assign(f.ctx, { presentationOwnerRef: { current: 'old' }, sessionOwnerKey: 'new',
    setSavePhase: (phase: any) => changes.push(phase), setReviewModalVisible: (visible: any) => changes.push(visible),
    setSessionReview: (value: any) => changes.push(value),
  });
  ownershipEffect('Session ownership: presentation reset', f.ctx);
  assert.ok(changes.includes('idle')); assert.ok(changes.includes(false)); assert.ok(changes.includes(null));
});

test('actual registered rest sink refuses append during End', () => {
  const f = aiFixture(); let sink: any;
  f.ctx.registerRestEntrySink = (fn: any) => { sink = fn; return () => {}; };
  ownershipEffect('When a rest timer is started', f.ctx);
  f.ctx.ownership.beginEnd(f.rows()); sink({ durationSec: 60 });
  assert.equal(f.rows().length, 1);
});

test('actual failed draft cleanup retains original recovery metadata and refreshes generation for retry edits', async () => {
  const f = fixture(); const metadata = { ownerId: 'offline-owner', workoutId: 'original', dateISO: '2026-10-07', createdAt: 1, bodyParts: ['Push'], rows: [row], updatedAt: 2 };
  let raw = JSON.stringify(metadata);
  const adapter = { getItem: async () => raw, setItem: async (_key: any, value: any) => { raw = value; }, removeItem: async () => { throw new Error('clear failed'); } };
  const draft = sourceModule('lib/workoutDraft.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: adapter } });
  Object.assign(f.ctx, draft, { draftGeneration: draft.getWorkoutDraftGeneration(), draftGenerationRef: { current: { workoutId: 'original', generation: draft.getWorkoutDraftGeneration() } },
    saveWorkoutLocalFirst: async () => ({ synced: false }),
  });
  f.review.resolve(null); await f.run();
  assert.equal(f.rows()[0].id, 'set-original'); assert.deepEqual(JSON.parse(raw), metadata);
  assert.equal(f.ctx.draftGenerationRef.current.generation, draft.getWorkoutDraftGeneration());
  Object.assign(f.ctx, { draftGeneration: f.ctx.draftGenerationRef.current.generation, draftChecked: true, workoutDateISO: metadata.dateISO, workoutCreatedAt: 1, bodyParts: ['Push'], draftSaveTimerRef: { current: null }, clearTimeout: () => {} });
  sourceClosure('persistDraftRows', f.ctx)([{ ...row, notes: 'retry edit' }]); await tick();
  assert.equal(JSON.parse(raw).rows[0].notes, 'retry edit'); assert.equal(JSON.parse(raw).workoutId, 'original'); assert.equal(JSON.parse(raw).dateISO, '2026-10-07');
});

test('actual template Start invalidates prior question and clears prior response presentation', async () => {
  const f = aiFixture(true); const pending = f.send();
  Object.assign(f.ctx, { draftChecked: true, workoutActive: false, setNameModalVisible: () => {}, startWorkoutSession: () => {} });
  sourceClosure('handleSelectTemplateForStart', f.ctx)({ name: 'Routine' }, []);
  f.chat.resolve({ answer: 'prior-session answer' }); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'history').length, 0);
  assert.equal(f.calls.filter(c => c[0] === 'bubble' && c[1] === 'prior-session answer').length, 0);
});

test('actual old rest entry registration cannot append into another owner session', () => {
  const f = aiFixture(); let sink: any; f.ctx.registerRestEntrySink = (fn: any) => { sink = fn; return () => {}; };
  ownershipEffect('When a rest timer is started', f.ctx);
  f.ctx.ownership.setOwner('user:new'); f.ctx.setRows([{ ...row, id: 'new' }]); sink({ durationSec: 60 });
  assert.equal(f.rows().length, 1); assert.equal(f.rows()[0].id, 'new');
});

test('actual successful parse keeps the original performed row and emits one valid current-owner effect path', async () => {
  const f = aiFixture(); const pending = f.send();
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] }); await pending; await tick();
  assert.equal(f.rows().length, 2); assert.equal(f.rows()[0].id, 'set-original');
  assert.equal(f.calls.filter(c => c[0] === 'log').length, 1);
  assert.equal(f.calls.filter(c => c[0] === 'rest').length, 1);
  assert.equal(f.calls.filter(c => c[0] === 'pr').length, 1);
});

test('actual synchronous setter updates the ownership snapshot before React flushes', () => {
  const f = fixture(); let rendered: any;
  f.ctx.setRowsState = (value: any) => { rendered = value; };
  const setRows = sourceClosure('setRows', f.ctx);
  setRows((rows: any[]) => [...rows, { ...row, id: 'next' }]);
  assert.equal(f.ctx.draftRowsRef.current.length, 2); assert.equal(rendered[1].id, 'next');
});

test('actual stale rendered coach callback cannot dispatch against another session owner', async () => {
  const f = aiFixture(); let calls = 0;
  Object.assign(f.ctx, { coachQuestion: 'Old question', coachLoading: false, saveCoachChatQA: async () => {} });
  f.ctx.api.askCoach = async () => { calls++; return { answer: 'old' }; };
  const submit = sourceClosure('submitCoachQuestion', f.ctx);
  f.ctx.ownership.setOwner('user:new'); await submit(); assert.equal(calls, 0);
});

test('actual Clear of an empty table still fences pending question presentation', async () => {
  const f = aiFixture(true); f.ctx.setRows([]); const pending = f.send();
  sourceClosure('onClearRows', f.ctx)(); f.chat.resolve({ answer: 'cleared question' }); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'history').length, 0);
});

test('actual stale rendered Send cannot dispatch into a newer owner', async () => {
  const f = aiFixture(); let calls = 0; f.ctx.api.chat = async () => { calls++; return {}; };
  const send = sourceClosure('sendMessage', f.ctx); f.ctx.ownership.setOwner('user:new'); await send();
  assert.equal(calls, 0);
});

for (const reason of ['owner-change','finalizing','inactive']) test(`actual realtime PR backup refuses ${reason} callback`, async () => {
  const f = aiFixture(); let callback: any; let celebrations = 0;
  const channel: any = { on: (_kind: any, _filter: any, fn: any) => { callback = fn; return channel; }, subscribe: () => channel, unsubscribe: () => {} };
  Object.assign(f.ctx, { session: { user: { id: 'user' } }, supabase: { channel: () => channel }, lastCelebratedRef: { current: '' }, showCelebration: () => celebrations++ });
  if (reason === 'inactive') f.ctx.workoutActive = false;
  ownershipEffect('Subscribe to PR breakthrough notifications', f.ctx, 'pr_breakthroughs');
  if (reason === 'owner-change') f.ctx.ownership.setOwner('user:new');
  if (reason === 'finalizing') f.ctx.ownership.beginEnd(f.rows());
  if (callback) await callback({ new: { lift_name: 'Bench', weight_lbs: 100, reps: 5 } });
  assert.equal(celebrations, 0);
});

test('actual typed done in an empty session uses the same explicit discard confirmation as End', async () => {
  const f = aiFixture(); f.ctx.setRows([]); let ends = 0;
  f.ctx.decideAndParse = () => ({ kind: 'end_workout' }); f.ctx.onEndWorkout = async () => ends++;
  await f.send(); assert.equal(ends, 1);
});

test('actual scheduled program Start fences a prior question using real program-day resolution', async () => {
  const f = aiFixture(true); const pending = f.send(); let starts = 0;
  Object.assign(f.ctx, sourceModule('lib/programSchedule.ts'), sourceModule('lib/trainingSchedule.ts'), sourceModule('lib/programFormat.ts'), {
    draftChecked: true, workoutActive: false, startWorkoutSession: () => starts++, setNameModalVisible: () => {},
    program: { days_per_week: 1, current_week: 1, weeks_total: 4 }, profile: { training_days: [new Date().getDay()] },
    currentWeek: { days: [{ day_index: 1, name: 'Push', exercises: [{ exercise_name: 'Bench', target_sets: 2, target_reps_low: 8 }] }] },
  });
  sourceClosure('handleStartFromHome', f.ctx)(); assert.equal(starts, 1);
  f.chat.resolve({ answer: 'previous answer' }); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'history').length, 0);
});

test('actual request response is fenced by P1 auth draft invalidation before owner rerender', async () => {
  const f = aiFixture(); let generation = 0; f.ctx.getWorkoutDraftGeneration = () => generation;
  const pending = f.send(); generation++;
  f.chat.resolve({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5' }] }); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'log').length, 0);
  assert.equal(f.calls.filter(c => c[0] === 'history').length, 0);
});

test('actual empty End confirmation cannot clear a P1-auth replacement generation', async () => {
  const f = fixture(); f.ctx.setRows([]); let generation = 0; let buttons: any[] = [];
  f.ctx.getWorkoutDraftGeneration = () => generation;
  Object.assign(f.ctx, { workoutActive: true, commitPendingAndGet: () => f.rows(), Alert: { alert: (_t: any, _m: any, b: any[]) => { buttons = b; } } });
  const pending = sourceClosure('onEndWorkout', f.ctx)(); generation++;
  f.ctx.setRows([{ ...row, id: 'replacement' }]); buttons[1].onPress(); await pending;
  assert.equal(f.calls.filter(c => c[0] === 'clear').length, 0); assert.equal(f.rows()[0].id, 'replacement'); assert.equal(f.ctx.ownership.busy, false);
});

test('actual stale rendered End callback cannot reserve a newer owner session', async () => {
  const f = fixture(); let alerts = 0;
  Object.assign(f.ctx, { workoutActive: true, commitPendingAndGet: () => f.rows(), Alert: { alert: () => alerts++ } });
  const end = sourceClosure('onEndWorkout', f.ctx); f.ctx.ownership.setOwner('user:new');
  void end(); assert.equal(alerts, 0); assert.equal(f.ctx.ownership.busy, false);
});

for (const empty of [false, true]) test(`actual ${empty ? 'empty' : 'performed'} End draft cleanup completion cannot reset a newer auth generation`, async () => {
  const f = fixture(); const clear = deferred(); let generation = 0;
  if (empty) f.ctx.setRows([]);
  Object.assign(f.ctx, { getWorkoutDraftGeneration: () => generation, clearWorkoutDraft: () => { generation++; return clear.promise; },
    saveWorkoutLocalFirst: async () => ({ synced: false }), commitPendingAndGet: () => f.rows(),
    Alert: { alert: (_t: any, _m: any, buttons: any[]) => buttons[1].onPress() },
  });
  f.review.resolve(null);
  const pending = empty ? sourceClosure('onEndWorkout', f.ctx)() : f.run(); await tick();
  assert.equal(generation, 1); generation++; f.ctx.setRows([{ ...row, id: 'replacement' }]); clear.resolve(); await pending;
  assert.equal(f.rows()[0]?.id, 'replacement'); assert.equal(f.calls.filter(c => c[0] === 'end').length, 0); assert.equal(f.ctx.ownership.busy, false);
});

test('actual empty End cleanup failure retains metadata and refreshes recovery generation', async () => {
  const f = fixture(); f.ctx.setRows([]); const metadata = { ownerId: 'offline-owner', workoutId: 'original', dateISO: '2026-10-07', createdAt: 1, bodyParts: ['Push'], rows: [], updatedAt: 2 };
  const raw = JSON.stringify(metadata);
  const adapter = { getItem: async () => raw, setItem: async () => {}, removeItem: async () => { throw new Error('clear failed'); } };
  const draft = sourceModule('lib/workoutDraft.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: adapter } });
  Object.assign(f.ctx, draft, { draftGeneration: draft.getWorkoutDraftGeneration(), draftGenerationRef: { current: { workoutId: 'original', generation: draft.getWorkoutDraftGeneration() } },
    commitPendingAndGet: () => f.rows(), Alert: { alert: (_t: any, _m: any, buttons: any[]) => buttons[1].onPress() },
  });
  await sourceClosure('onEndWorkout', f.ctx)();
  assert.deepEqual(JSON.parse(raw), metadata); assert.equal(f.ctx.draftGenerationRef.current.generation, draft.getWorkoutDraftGeneration());
  assert.equal(f.ctx.ownership.busy, false); assert.equal(f.calls.filter(c => c[0] === 'end').length, 0);
});

test('optional review has a bounded local deadline, ignores late success, and clears its timer', async () => {
  const helper = sourceModule('lib/sessionOwnership.ts');
  assert.equal(typeof helper.settleOptionalReview, 'function', 'bounded optional review is required');
  const review = deferred(); let timeout: any; let cleared = 0;
  const clock = { setTimeout: (fn: any) => { timeout = fn; return 1; }, clearTimeout: () => cleared++ };
  const bounded = helper.settleOptionalReview(review.promise, 5000, clock);
  timeout(); assert.equal(await bounded, null);
  review.resolve({ rating: 10 }); await tick();
  assert.equal(await bounded, null); assert.equal(cleared, 1);
});

test('actual save failure retains rows and offers honest retry without falling into a second save', async () => {
  const f = fixture(); const first = f.run(); f.save.reject(new Error('disk unavailable'));
  await first;
  assert.equal(f.rows()[0].id, 'set-original');
  assert.equal(f.calls.filter(c => c[0] === 'save').length, 1);
  assert.equal(f.calls.filter(c => c[0] === 'clear' || c[0] === 'end').length, 0);
  assert.ok(f.calls.some(c => c[0] === 'phase' && c[1] === 'failed'));
  assert.ok(f.calls.some(c => c[0] === 'toast' && /kept.*Retry/.test(c[1])));
  f.ctx.saveWorkoutLocalFirst = async () => ({ synced: false });
  f.review.reject(new Error('optional review offline'));
  await f.run();
  assert.equal(f.calls.filter(c => c[0] === 'end').length, 1);
});

test('actual mutation gateway refuses edits while finalizing', async () => {
  const f = fixture(); const ending = f.run();
  f.ctx.applyPendingEdit = (rows: any[]) => ({ nextRows: rows, changed: false });
  f.ctx.editingCell = null;
  sourceClosure('withPendingRows', f.ctx)((rows: any[]) => [...rows, { ...row, id: 'new-edit' }]);
  assert.equal(f.rows().length, 1, 'finalizing session must be frozen');
  f.review.resolve(null); f.save.resolve({ synced: true }); await ending;
});

test('actual button End reserves before confirmation; cancellation releases the same latch', async () => {
  const f = fixture(); const alerts: any[] = [];
  f.ctx.commitPendingAndGet = () => f.rows();
  f.ctx.Alert = { alert: (...args: any[]) => alerts.push(args) };
  f.ctx.handleEndWorkoutWithReview = (rows: any[], reserved: any) => sourceClosure('handleEndWorkoutWithReview', f.ctx)(rows, reserved);
  const end = sourceClosure('onEndWorkout', f.ctx);
  const first = end(); const second = end();
  assert.equal(alerts.length, 1, 'same-render double End must not open two confirmations');
  alerts[0][2][0].onPress(); await Promise.all([first, second]);
  assert.equal(f.ctx.ownership.busy, false);
  assert.equal(f.calls.filter(c => c[0] === 'save').length, 0);
});

test('actual End acquires synchronously: repeated callback finalizes only once and starts save before review', async () => {
  const f = fixture(); const first = f.run(); const second = f.run();
  await tick();
  assert.equal(f.calls.filter(c => c[0] === 'review').length, 1);
  assert.equal(f.calls.filter(c => c[0] === 'save').length, 1, 'performance save starts without waiting for optional review');
  f.review.resolve({ rating: 5, strengths: [], weakness: '', nextSessionNote: '' }); f.save.resolve({ synced: true });
  await Promise.all([first, second]);
  assert.equal(f.calls.filter(c => c[0] === 'end').length, 1);
});
