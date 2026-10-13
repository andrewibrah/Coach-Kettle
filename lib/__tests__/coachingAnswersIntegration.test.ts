import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';
import { COACHING_POLICY } from '../coachingPolicy.ts';
import { currentAnswer, isMalformedScale } from '../coachingAnswers.ts';
import type { QuestionnairePolicy } from '../../types/coachingAnswers';

// TEST ONLY. Not product policy: D09/Q8 wording, scales and freshness are unapproved.
const TEST_ONLY_POLICY: QuestionnairePolicy = {
  version: 'test-only', freshnessMs: 60_000,
  questions: [{ id: 'pain', kind: 'choice', prompt: 'test pain prompt', scope: 'exercise', choices: ['none', 'present'] }],
};
const FLAG_ON = { ...COACHING_POLICY, structuredQuestions: true, questionnaire: TEST_ONLY_POLICY };

const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };
const row = { id: 'r1', exercise: '  Bench Press ', set: 1, weightLbs: '100', reps: '5', notes: '', timestamp: 1, status: 'committed', performance: 'performed' };
const pain = { answerId: 'a1', sessionId: 'original', exerciseKey: 'bench press', questionId: 'pain', state: 'answered', value: 'present', capturedAt: 1000, provenance: 'user' };
const draft = (extra: any = {}) => ({ ownerId: 'offline-owner', workoutId: 'original', dateISO: '2026-10-07', bodyParts: ['Push'], createdAt: 1, rows: [row], updatedAt: 2, ...extra });

function storage(initial: any = null) {
  let raw: string | null = initial === null ? null : JSON.stringify(initial);
  const calls: string[] = [];
  const adapter = { getItem: async () => raw, setItem: async (_k: string, v: string) => { calls.push('save'); raw = v; }, removeItem: async () => { calls.push('clear'); raw = null; } };
  const helper = sourceModule('lib/workoutDraft.ts', { '@react-native-async-storage/async-storage': { __esModule: true, default: adapter } });
  return { helper, calls, readRaw: () => raw, read: () => raw && JSON.parse(raw) };
}

// Run the first useEffect after a section label in the real route source.
function effect(section: string, context: any) {
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const start = source.indexOf(section); assert.ok(start >= 0, `missing section ${section}`);
  const ast = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.getStart(ast) > start) matches.push(n); ts.forEachChild(n, visit); };
  visit(ast);
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(`exports.run = ${matches[0].arguments[0].getText(ast)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, ...context });
  return exports.run();
}

function route(s: ReturnType<typeof storage>, policy: any = COACHING_POLICY) {
  let answers = { owner: '', log: [] as any[] }; let rows: any[] = [row]; let checked = false;
  const sets: any[] = []; const toasts: string[] = [];
  const ctx: any = {
    ...s.helper, COACHING_POLICY: policy, rows, workoutActive: true, workoutId: 'original', workoutDateISO: '2026-10-07', bodyParts: ['Push'], workoutCreatedAt: 1,
    session: { user: { id: 'offline-owner' } }, sessionOwnerKey: 'offline-owner:original', draftChecked: true, finalizing: false,
    sessionProvenanceRef: { current: { ownerId: 'offline-owner', generation: 0 } }, recoveryOwnerRef: { current: null },
    draftRowsRef: { current: rows }, draftSaveTimerRef: { current: null }, draftToastTimerRef: { current: null }, draftGeneration: 0,
    canUseSession: () => true, useCallback: (fn: any) => fn, setTimeout: () => 0, clearTimeout: () => {},
    makeId: (() => { let n = 0; return () => `id-${++n}`; })(), getLastExerciseFromRows: sourceModule('lib/workoutRules.ts').getLastExerciseFromRows, normalizeExercise: sourceModule('lib/workoutRules.ts').normalizeExercise,
    coachingAnswers: answers, setCoachingAnswers: (v: any) => { answers = typeof v === 'function' ? v(answers) : v; ctx.coachingAnswers = answers; sets.push(answers); },
    showToast: (t: string) => toasts.push(t), setRows: (v: any) => { rows = typeof v === 'function' ? v(rows) : v; }, setDraftChecked: (v: boolean) => { checked = v; },
    endWorkoutSession: () => {}, setMessageInput: () => {}, setEditingCell: () => {}, setEditValue: () => {}, setLoading: () => {}, setCoachAnswer: () => {}, setCoachOpen: () => {},
    setReviewModalVisible: () => {}, setNameModalVisible: () => {}, setRoutineModalVisible: () => {}, restoreWorkoutSession: () => {}, setDraftRestoredToast: () => {},
    Date: { now: () => 5000 },
  };
  ctx.persistDraftRows = sourceClosure('persistDraftRows', ctx);
  ctx.coachingExerciseKey = sourceClosure('coachingExerciseKey', ctx);
  ctx.onCoachingAnswer = sourceClosure('onCoachingAnswer', ctx);
  ctx.onCoachingSkip = sourceClosure('onCoachingSkip', ctx);
  return { ctx, sets, toasts, rows: () => rows, checked: () => checked, answers: () => answers };
}

// --- Policy ---
test('shipped policy: structured questions off and no approved questionnaire', () => {
  assert.equal(COACHING_POLICY.structuredQuestions, false);
  assert.equal(COACHING_POLICY.questionnaire, null);
});

// --- Draft persistence (real lib/workoutDraft.ts) ---
test('characterization: legacy draft without coachingAnswers restores unchanged', async () => {
  const s = storage(draft());
  assert.deepEqual(JSON.parse(JSON.stringify(await s.helper.getWorkoutDraft())), draft());
});

test('answers log round-trips as-is', async () => {
  const s = storage(draft({ coachingAnswers: [pain, { ...pain, answerId: 'a2', state: 'skipped', value: undefined }] }));
  assert.deepEqual(JSON.parse(JSON.stringify(await s.helper.getWorkoutDraft())), s.read());
});

for (const [label, corrupt] of [
  ['bad state', [{ ...pain, state: 'maybe' }]], ['bad provenance', [{ ...pain, provenance: 'coach' }]],
  ['skip carrying a value', [{ ...pain, state: 'skipped' }]], ['non-array log', { pain }],
] as const) test(`corrupt answers (${label}) reject the whole read and keep the raw bytes`, async () => {
  const s = storage(draft({ coachingAnswers: corrupt })); const before = s.readRaw();
  await assert.rejects(s.helper.getWorkoutDraft(), /could not be read/);
  assert.equal(s.readRaw(), before);
  const r = route(s);
  effect('Draft persistence: restore on mount', r.ctx); await tick();
  assert.equal(r.checked(), false, 'restore/Start stay unresolved');
  assert.deepEqual(Array.from(r.rows()), [], 'no rows restored');
  assert.equal(s.readRaw(), before, 'raw bytes intact');
});

test('a rows save never drops the stored answers log of the same session, even a corrupt one', async () => {
  for (const log of [[pain], { corrupt: true }]) {
    const s = storage(draft({ coachingAnswers: log }));
    await s.helper.saveWorkoutDraft(draft({ rows: [], updatedAt: 3 }));
    assert.deepEqual(s.read().coachingAnswers, log);
    assert.deepEqual(s.read().rows, []);
  }
  const other = storage(draft({ coachingAnswers: [pain] }));
  await other.helper.saveWorkoutDraft(draft({ workoutId: 'next' }));
  assert.equal('coachingAnswers' in other.read(), false, 'never carried into another session');
});

test('append is validated and append-only; refuses corrupt logs and other sessions without writing', async () => {
  const s = storage(draft());
  await s.helper.appendWorkoutDraftAnswer('offline-owner', 'original', pain);
  const skip = { ...pain, answerId: 'a2', state: 'skipped' }; delete (skip as any).value;
  await s.helper.appendWorkoutDraftAnswer('offline-owner', 'original', skip);
  assert.deepEqual(s.read().coachingAnswers, [pain, skip]);
  const before = s.readRaw();
  await assert.rejects(s.helper.appendWorkoutDraftAnswer('offline-owner', 'original', { ...pain, provenance: 'coach' }));
  await assert.rejects(s.helper.appendWorkoutDraftAnswer('someone-else', 'original', pain));
  await assert.rejects(s.helper.appendWorkoutDraftAnswer('offline-owner', 'other', pain));
  assert.equal(s.readRaw(), before);
  const corrupt = storage(draft({ coachingAnswers: { pain } })); const raw = corrupt.readRaw();
  await assert.rejects(corrupt.helper.appendWorkoutDraftAnswer('offline-owner', 'original', pain));
  assert.equal(corrupt.readRaw(), raw);
});

// --- Route (real app/(tabs)/index.tsx closures and effects) ---
test('flag off: no answer is recorded and the rows save writes no coachingAnswers field', async () => {
  const s = storage(draft()); const r = route(s);
  r.ctx.onCoachingAnswer(pain); r.ctx.onCoachingSkip('pain'); await tick();
  assert.deepEqual(r.sets, []);
  assert.deepEqual(s.calls, []);
  r.ctx.persistDraftRows([row]); await tick();
  assert.equal(s.readRaw()!.includes('coachingAnswers'), false);
  effect('Structured coaching answers: restore', r.ctx); await tick();
  assert.deepEqual(r.sets, [], 'restore inert with the flag off');
});

test('flag on: answer and skip append, persist with canonical key, survive a rows save, restore overnight', async () => {
  const s = storage(draft()); const r = route(s, FLAG_ON);
  assert.equal(r.ctx.coachingExerciseKey, 'bench press');
  r.ctx.onCoachingAnswer(pain); await tick();
  r.ctx.onCoachingSkip('pain'); await tick();
  const skip = { answerId: 'id-1', sessionId: 'original', exerciseKey: 'bench press', questionId: 'pain', state: 'skipped', capturedAt: 5000, provenance: 'user' };
  assert.deepEqual(JSON.parse(JSON.stringify(r.answers())), { owner: 'offline-owner:original', log: [pain, skip] });
  assert.deepEqual(s.read().coachingAnswers, [pain, skip]);
  assert.equal('value' in s.read().coachingAnswers[1], false, 'a skip has no value');
  r.ctx.persistDraftRows([]); await tick();
  assert.deepEqual(s.read().coachingAnswers, [pain, skip], 'rows save keeps the log');
  const stored = s.readRaw();

  // Next morning: a fresh route restores rows (existing effect) and the log (new effect).
  const next = route(s, FLAG_ON); next.ctx.todayISO = () => '2026-10-08';
  effect('Draft persistence: restore on mount', next.ctx); await tick();
  assert.equal(next.checked(), true);
  effect('Structured coaching answers: restore', next.ctx); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(next.answers())), { owner: 'offline-owner:original', log: [pain, skip] });
  assert.equal(s.readRaw(), stored, 'restore does not rewrite the log');
  // Past freshness the restored pain is excluded, not converted to no-pain.
  const later = currentAnswer(next.answers().log, { sessionId: 'original', exerciseKey: 'bench press' }, TEST_ONLY_POLICY, 1000 + 86_400_000);
  assert.equal(later.pain.state, 'conflict');
});

test('End and account switch: the derived log is empty and End clears the draft', async () => {
  const s = storage(draft({ coachingAnswers: [pain] })); const r = route(s, FLAG_ON);
  r.ctx.coachingAnswers = { owner: 'offline-owner:original', log: [pain] };
  assert.deepEqual(Array.from(sourceClosure('coachingAnswerLog', r.ctx)), [pain]);
  assert.deepEqual(Array.from(sourceClosure('coachingAnswerLog', { ...r.ctx, workoutActive: false })), [], 'after End');
  assert.deepEqual(Array.from(sourceClosure('coachingAnswerLog', { ...r.ctx, sessionOwnerKey: 'other-user:original' })), [], 'account switch');
  await s.helper.clearWorkoutDraft('offline-owner');
  assert.equal(s.readRaw(), null, 'End removes the persisted log with the draft');
});

test('mount: exactly one CoachingQuestions bound to the shipped flag and policy; renders nothing as shipped', () => {
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const mounts = source.match(/<CoachingQuestions\b[^>]*>/g) ?? [];
  assert.equal(mounts.length, 1);
  assert.match(mounts[0], /enabled=\{COACHING_POLICY\.structuredQuestions\}/);
  assert.match(mounts[0], /policy=\{COACHING_POLICY\.questionnaire\}/);
  const node = (type: any, props: any) => ({ type, props });
  const { CoachingQuestions } = sourceModule('components/workout/CoachingQuestions.tsx', {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' }, react: {},
    'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: (v: any) => v } },
    '@/components/ui/themed-text': { ThemedText: 'ThemedText' }, '@/hooks/useThemeColor': { useThemeColor: () => 'themed' },
    '@/lib/coachingAnswers': { isMalformedScale, currentAnswer },
  });
  assert.equal(CoachingQuestions({ enabled: COACHING_POLICY.structuredQuestions, policy: COACHING_POLICY.questionnaire, sessionId: 'original',
    exerciseKey: 'bench press', answers: [pain], now: () => 5000, newAnswerId: () => 'x', onAnswer: () => {}, onSkip: () => {} }), null);
});

// SPEC LOW repairs.
test('flag off: the answers restore path does no draft read, even when the draft holds answers', async () => {
  const s = storage(draft({ coachingAnswers: [pain] })); const r = route(s);
  let reads = 0; const real = r.ctx.getWorkoutDraft;
  r.ctx.getWorkoutDraft = () => { reads++; return real(); };
  effect('Structured coaching answers: restore', r.ctx); await tick();
  assert.equal(reads, 0);
  assert.deepEqual(r.sets, []);
});

test('append refuses, without writing, an array log that contains a corrupt entry', async () => {
  const s = storage(draft({ coachingAnswers: [pain, { junk: 1 }] })); const before = s.readRaw();
  await assert.rejects(s.helper.appendWorkoutDraftAnswer('offline-owner', 'original', { ...pain, answerId: 'a2' }));
  assert.equal(s.readRaw(), before);
});

test('exercise key comes from the shared normalizeExercise', () => {
  const s = storage(draft()); const r = route(s); const seen: string[] = [];
  const key = sourceClosure('coachingExerciseKey', { ...r.ctx, normalizeExercise: (v: string) => { seen.push(v); return v.trim().toLowerCase(); } });
  assert.equal(key, 'bench press');
  assert.deepEqual(seen, ['Bench Press']);
});
