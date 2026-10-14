import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';
import { createSessionOwnership } from '../sessionOwnership.ts';
import { createHash } from 'node:crypto';
import { COACHING_POLICY } from '../coachingPolicy.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';
import * as nextSetDecision from '../nextSetDecision.ts';

const tick = () => new Promise(resolve => setImmediate(resolve));
const node = (type: any, props: any) => ({ type, props });

// Minimal hook runtime: state/refs persist across renders, effects run after
// render when their deps change, so the real CoachModal effects execute.
function hookRuntime() {
  const slots: any[] = []; let index = 0; let effects: (() => void)[] = [];
  const react = {
    useState: (initial: any) => {
      const k = index++; slots[k] ??= { value: initial }; const slot = slots[k];
      return [slot.value, (next: any) => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useRef: (current: any) => { const k = index++; slots[k] ??= { current }; return slots[k]; },
    useEffect: (fn: () => void, deps?: any[]) => {
      const k = index++; const prev = slots[k];
      if (!prev || !deps || deps.some((d, j) => !Object.is(d, prev.deps[j]))) { slots[k] = { deps }; effects.push(fn); }
    },
  };
  const render = (component: any, props: any) => { index = 0; effects = []; const tree = component(props); effects.forEach(fn => fn()); return tree; };
  return { react, render };
}

function loadCoachModal() {
  const runtime = hookRuntime();
  const rn = Object.fromEntries(['ActivityIndicator', 'FlatList', 'KeyboardAvoidingView', 'Modal', 'Pressable', 'Text', 'TextInput', 'View'].map(k => [k, k]));
  const { CoachModal } = sourceModule('components/modals/CoachModal.tsx', {
    'react/jsx-runtime': { jsx: node, jsxs: node }, react: runtime.react,
    'react-native': { ...rn, Alert: { alert: () => {} }, Platform: { OS: 'ios' }, StyleSheet: { create: (v: any) => v } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/ui/screen-header': { ScreenHeader: 'ScreenHeader' },
    '@/components/ui/themed-text': { ThemedText: 'ThemedText' },
    '@/components/ui/themed-view': { ThemedView: 'ThemedView' },
    '@/components/ui/Toast': { Toast: 'Toast' },
    '@/hooks/useColorScheme': { useColorScheme: () => 'light' },
    '@/hooks/useThemeColor': { useThemeColor: () => 'themed' },
    '@/hooks/useToast': { useToast: () => ({ toast: null, showToast: () => {}, hideToast: () => {} }) },
    '@/lib/chatStorage': { fetchChatHistory: async () => [], clearAllChatHistory: async () => {} },
    '@expo/vector-icons/MaterialCommunityIcons': { default: 'Icon' },
  });
  const questions: string[] = []; const submits: any[][] = [];
  const props: any = {
    visible: true, question: '', loading: false, answer: null, error: null, onClose: () => {},
    onChangeQuestion: (q: string) => { questions.push(q); props.question = q; },
    onSubmit: (...args: any[]) => submits.push(args),
  };
  const render = () => runtime.render(CoachModal, props);
  return { props, questions, submits, render };
}

function descendants(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return [];
  const list = tree.type === 'FlatList' ? tree.props.data.map((item: any) => tree.props.renderItem({ item })) : [];
  return [tree, ...[tree.props?.children, tree.props?.ListHeaderComponent, ...list].flat(3).flatMap(descendants)];
}
const texts = (tree: any) => descendants(tree).flatMap(n => [n.props?.children].flat()).filter(v => typeof v === 'string');
const listData = (tree: any) => descendants(tree).find(n => n.type === 'FlatList').props.data;
const send = (tree: any) => descendants(tree).find(n => n.props?.accessibilityLabel === 'Send message').props.onPress();

async function failedStream() {
  const m = loadCoachModal();
  m.render(); await tick();
  m.props.question = 'Is my bench stalling?';
  send(m.render());
  m.props.loading = true; m.render();
  m.props.answer = 'Your bench went fr'; m.render();
  m.props.loading = false; m.props.error = 'HTTP 500: {"error":"upstream timeout"}'; m.render();
  return { ...m, tree: m.render() };
}

test('Coach error renders readable copy and does not commit partial stream', async () => {
  const { tree } = await failedStream();
  const visible = texts(tree).join(' ');
  assert.doesNotMatch(visible, /HTTP 500|[{}]|upstream timeout/, 'raw transport error must not be shown');
  assert.match(visible, /Coach couldn't answer/);
  assert.doesNotMatch(visible, /Your bench went fr/, 'partial stream must not stay on screen');
  assert.equal(listData(tree).filter((m: any) => m.role === 'assistant').length, 0, 'partial stream must not be archived');
});

test('failed submit restores exact question', async () => {
  const m = await failedStream();
  assert.equal(m.questions.at(-1), 'Is my bench stalling?');
  const input = descendants(m.tree).find(n => n.type === 'TextInput');
  assert.equal(input.props.value, 'Is my bench stalling?');
  // Resend: parent clears error/answer and streams a full answer.
  send(m.tree);
  assert.equal(m.submits.length, 2);
  assert.deepEqual(m.submits[1], [], 'onSubmit takes no chat history (route builds session turns)');
  assert.deepEqual([...listData(m.render())].filter((msg: any) => msg.role === 'user').map((msg: any) => msg.content), ['Is my bench stalling?'], 'failed attempt is not duplicated');
  m.props.error = null; m.props.answer = null; m.props.loading = true; m.render();
  m.props.answer = 'Hold 185 for one more week.'; m.render();
  m.props.loading = false; m.render();
  const tree = m.render();
  assert.deepEqual([...listData(tree)].filter((msg: any) => msg.role === 'assistant').map((msg: any) => msg.content), ['Hold 185 for one more week.']);
  assert.doesNotMatch(texts(tree).join(' '), /Coach couldn't answer/);
});

function presentationResetEffect(context: any) {
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('Session ownership: presentation reset'); assert.ok(start >= 0);
  const ast = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.CallExpression[] = [];
  const visit = (n: ts.Node) => { if (ts.isCallExpression(n) && n.expression.getText(ast) === 'useEffect' && n.getStart(ast) > start) matches.push(n); ts.forEachChild(n, visit); }; visit(ast);
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(`exports.run = ${matches[0].arguments[0].getText(ast)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, ...context });
  return exports.run;
}

test('End and owner change clear rest prompt', async () => {
  const restPrompts: any[] = []; const noOp = () => {};
  const rows = [{ id: 'r1', exercise: 'Bench', set: 1, weightLbs: '185', reps: '5', performance: 'performed', status: 'committed' }];
  const ownership = createSessionOwnership('user-A:w1');
  const ctx: any = Object.fromEntries(['setRows', 'setLoading', 'setCoachLoading', 'setAiBubbleText', 'setCoachAnswer', 'setCoachError', 'setCoachOpen', 'setSavePhase', 'setReviewModalVisible', 'setSessionReview', 'setReviewLoading'].map(k => [k, noOp]));
  let alerts = 0;
  Object.assign(ctx, {
    ownership, renderOwner: ownership.capture(), useCallback: (fn: any) => fn, workoutActive: true,
    commitPendingAndGet: () => rows, setRestPrompt: (v: any) => restPrompts.push(v),
    Alert: { alert: (_t: any, _c: any, buttons: any[]) => { alerts++; buttons[0].onPress(); } },
  });
  // End: real onEndWorkout invoking the real invalidateResponses closure.
  ctx.invalidateResponses = sourceClosure('invalidateResponses', ctx);
  await sourceClosure('onEndWorkout', ctx)();
  assert.equal(alerts, 1);
  assert.deepEqual(restPrompts, [null], 'End clears the rest prompt');

  // Owner change: real presentation-reset effect.
  restPrompts.length = 0;
  const run = presentationResetEffect({ ...ctx, presentationOwnerRef: { current: 'user-A:w1' }, sessionOwnerKey: 'user-B:w2' });
  run();
  assert.deepEqual(restPrompts, [null], 'owner change clears the rest prompt');
  run();
  assert.deepEqual(restPrompts, [null], 'same owner does not re-reset');
});

// ---------- Lane B ----------

test('empty coach stream is unavailable, not archived', async () => {
  const saved: any[] = []; const errors: any[] = []; const answers: any[] = [];
  const ctx: any = {
    coachQuestion: 'Should I deload?', coachLoading: false, rows: [], workoutId: 'session-a',
    setCoachLoading: () => {}, setCoachError: (e: any) => errors.push(e), setCoachAnswer: (a: any) => answers.push(typeof a === 'function' ? a(answers.at(-1) ?? null) : a),
    saveCoachChatQA: async (...args: any[]) => { saved.push(args); },
    toApiRows: (rows: any[]) => rows, Platform: { OS: 'web' }, console,
    FeatureGateError: class extends Error {}, showAiLimitAlert: () => {},
    api: { askCoach: async (_q: string, _rows: any[], onChunk: any) => { onChunk('  \n'); return { answer: '  \n' }; } },
  };
  await sourceClosure('submitCoachQuestion', ctx)();
  assert.equal(saved.length, 0, 'empty answer must not be archived');
  assert.equal(answers.at(-1), null, 'no invented answer is shown');
  assert.doesNotMatch(JSON.stringify(answers), /Coach had no response/);
  const error = errors.at(-1);
  assert.equal(typeof error, 'string'); assert.ok(error.trim());
  assert.doesNotMatch(error, /HTTP|[{}]/);
  assert.equal(ctx.coachingRecordRef.current?.turns?.length ?? 0, 0, 'unanswered question is not a session turn');
});

const reviewRows = [
  { id: 'w0', exercise: 'Squat', set: 1, weightLbs: '95', reps: '5', notes: '', performance: 'performed', setKind: 'warmup' },
  { id: 'w1', exercise: 'Squat', set: 2, weightLbs: '225', reps: '5', notes: '', performance: 'performed', setKind: 'work' },
  { id: 'w2', exercise: 'Squat', set: 3, weightLbs: '185', reps: '8', notes: '', performance: 'performed', setKind: 'backoff' },
];
const valid = { rating: 6, strengths: ['Squat 225x5'], weakness: 'w', nextSessionNote: 'n' };
async function reviewBody(policy?: any) {
  let body: any = null;
  const api = sourceModule('lib/api.ts', {
    './performedSets': { isPerformedRow: (r: any) => r.performance === 'performed' }, './nextSetDecision': nextSetDecision,
    './supabase': { supabaseUrl: 'https://offline.invalid' },
    './auth': { fetchWithAuth: async (_url: string, init: any) => { body = init.body; return { ok: true, text: async () => JSON.stringify(valid) }; } },
    './profile': { fetchProfile: async () => null }, './entitlements': { parseFeatureGateError: () => null },
    './nutrition': {}, './coaching': {}, './programming': {}, './bodyMetrics': {}, './exerciseLibrary': {},
  }).api;
  await api.generateSessionReview(structuredClone(reviewRows), 'Legs', policy);
  return body as string;
}
const OFF = { ...COACHING_POLICY };
// sha256 of the HEAD (80a039d) request body for reviewRows/'Legs'/no profile.
const HEAD_REVIEW_BODY_SHA256 = '77af65fa564863ebd1a51dd536dabb6b7324903cebd621df89c72a5bc86fc1ae';

test('review policy flags off: payload and prompt byte-identical to HEAD', async () => {
  assert.equal(OFF.reviewSetPolicy, false); assert.equal(OFF.suppressReviewLoadAdvice, false);
  const body = await reviewBody(OFF);
  assert.equal(createHash('sha256').update(body).digest('hex'), HEAD_REVIEW_BODY_SHA256);
  assert.equal(await reviewBody(), body, 'omitted policy is off');
});

test('reviewSetPolicy on: warmups excluded, prescribed backoff/drop exempt from drop penalty', async () => {
  const off = JSON.parse(await reviewBody(OFF));
  const on = JSON.parse(await reviewBody({ ...OFF, reviewSetPolicy: true }));
  assert.deepEqual(on.rows.map((r: any) => r.id), ['w1', 'w2']);
  assert.match(on.question, /setKind "backoff" or "drop".*never apply this penalty/);
  assert.doesNotMatch(off.question, /never apply this penalty/);
  assert.equal(on.question.replace(/ Rows with setKind[^\n]*/, ''), off.question, 'only the penalty line changes');
});

test('suppressReviewLoadAdvice on: nextSessionNote prompt forbids numeric load prescription', async () => {
  const off = JSON.parse(await reviewBody(OFF)).question;
  const on = JSON.parse(await reviewBody({ ...OFF, suppressReviewLoadAdvice: true })).question;
  assert.match(off, /try 190x8/);
  assert.doesNotMatch(on, /try 190x8|progressive overload/);
  assert.match(on, /NEXT_SESSION_NOTE[^\n]*Do not prescribe any weight, load or load increase/);
});

function restRoute(setKind: string, policy: any) {
  return runWorkoutRoute('Bench and Squat 185 8', [], { rows: [{ exercise: 'Squat', set: 1, weightLbs: 185, reps: 8, notes: '', setKind }] }, 1, false, { COACHING_POLICY: policy });
}
const rests = (r: any) => r.calls.filter((c: any) => c.method === 'rest');

test('restWorkSetsOnly off: warmup still triggers rest (current behaviour)', async () => {
  assert.equal(COACHING_POLICY.restWorkSetsOnly, false);
  assert.equal(rests(await restRoute('warmup', COACHING_POLICY)).length, 1);
});

test('restWorkSetsOnly on: only performed work sets trigger rest', async () => {
  const on = { ...COACHING_POLICY, restWorkSetsOnly: true };
  for (const kind of ['warmup', 'backoff', 'drop', 'superset']) assert.equal(rests(await restRoute(kind, on)).length, 0, kind);
  assert.equal(rests(await restRoute('work', on)).length, 1);
});

test('auto-start restarts an already-running timer for a new eligible set', () => {
  const starts: any[] = [];
  const trigger = sourceClosure('triggerRestTimer', {
    useCallback: (fn: any) => fn, decideRestTimerAction: (on: boolean) => on ? 'start' : 'prompt', suggestRestSeconds: () => 90,
    getConfirmedPrefs: () => ({ user_id: 'a', auto_start_rest_timer: true }), session: { user: { id: 'a' } }, restTimerStateRef: { current: { kind: 'running' } },
    startRestTimer: async (hints: any) => { starts.push(hints); }, setRestPrompt: () => assert.fail('no prompt in auto-start'),
  });
  trigger({ exercise: 'Squat', repsLastSet: 5, isCompound: true });
  assert.equal(starts.length, 1);
});

// ---------- SPEC repairs ----------

function coachState(askCoach: any) {
  const state: any = { loading: false, answer: null, error: null, open: false }; const saved: any[] = [];
  const ctx: any = {
    coachQuestion: 'Is my bench stalling?', coachLoading: false, rows: [], workoutId: 'session-a',
    setCoachLoading: (v: any) => { state.loading = v; }, setCoachError: (v: any) => { state.error = v; },
    setCoachAnswer: (v: any) => { state.answer = typeof v === 'function' ? v(state.answer) : v; }, setCoachOpen: (v: any) => { state.open = v; },
    saveCoachChatQA: async (...args: any[]) => { saved.push(args); }, commitPendingAndGet: () => [],
    toApiRows: (rows: any[]) => rows, Platform: { OS: 'web' }, console,
    // Host Error: the API runs in a separate VM realm in the stall test.
    FeatureGateError: class extends Error {}, showAiLimitAlert: () => {}, api: { askCoach }, Error,
  };
  return { state, saved, ctx, submit: () => sourceClosure('submitCoachQuestion', ctx)(), open: () => sourceClosure('openCoach', ctx)() };
}
// Feed the route's final state into the real modal: send, stream, settle, then close and reopen.
async function modalAfter(route: ReturnType<typeof coachState>, pending: Promise<void>, streamed: string | null) {
  const m = loadCoachModal(); m.render(); await tick();
  m.props.question = 'Is my bench stalling?'; send(m.render());
  m.props.loading = true; m.render();
  if (streamed) { m.props.answer = streamed; m.render(); }
  await pending;
  Object.assign(m.props, { loading: route.state.loading, answer: route.state.answer, error: route.state.error }); m.render();
  const settled = m.render();
  route.open(); m.props.visible = false; m.render();
  Object.assign(m.props, { visible: true, answer: route.state.answer, error: route.state.error }); m.render(); await tick();
  return { m, settled, reopened: m.render() };
}

test('partial stream never reappears after error and reopen', async () => {
  const route = coachState(async (_q: string, _r: any, onChunk: any) => { onChunk('Your bench went fr'); throw new Error('HTTP 500: {"error":"reset"}'); });
  const { reopened } = await modalAfter(route, route.submit(), 'Your bench went fr');
  assert.equal(route.state.answer, null, 'route clears the partial answer on error');
  assert.doesNotMatch(texts(reopened).join(' '), /Your bench went fr/);
  assert.equal([...listData(reopened)].filter((x: any) => x.role === 'assistant').length, 0);
});

function fakeClock() {
  const timers = new Map<number, () => void>(); let id = 0;
  return { timers, setTimeout: (fn: () => void) => { timers.set(++id, fn); return id; }, clearTimeout: (t: number) => { timers.delete(t); },
    fire: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } };
}
function streamingApi(reader: any, clock: any, signals: any[]) {
  // Own VM: the streaming path needs the runtime's TextDecoder/AbortController globals.
  const deps: any = {
    './performedSets': { isPerformedRow: () => true }, './nextSetDecision': nextSetDecision, './supabase': { supabaseUrl: 'https://offline.invalid' },
    './auth': { fetchWithAuth: async (_url: string, init: any) => { signals.push(init.signal); return { ok: true, body: { getReader: () => reader } }; } },
    './profile': { fetchProfile: async () => null }, './entitlements': { parseFeatureGateError: () => null },
    './nutrition': {}, './coaching': {}, './programming': {}, './bodyMetrics': {}, './exerciseLibrary': {},
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; }, console, TextDecoder, AbortController, Error, setTimeout: () => assert.fail('real timer used'), clearTimeout: () => {} });
  const real = exports.api;
  return (q: string, rows: any, onChunk: any, history: any, context: any) => real.askCoach(q, rows, onChunk, history, context, clock);
}

test('stalled coach stream hits the idle deadline: Loading clears, error shows, question restored, nothing archived', async () => {
  const clock = fakeClock(); const signals: any[] = []; const enc = new TextEncoder(); let reads = 0;
  // Like real fetch bodies, a pending read rejects with a raw AbortError once the request is aborted.
  const reader = { read: () => (reads++ === 0 ? Promise.resolve({ done: false, value: enc.encode('Your bench went fr') })
    : new Promise((_, reject) => signals[0].addEventListener('abort', () => reject(new Error('This operation was aborted'))))) };
  const route = coachState(streamingApi(reader, clock, signals));
  const pending = route.submit();
  for (let i = 0; i < 5 && reads < 2; i++) await tick();
  assert.equal(reads, 2, 'second read is pending (stalled)');
  assert.equal(clock.timers.size, 1, 'one idle deadline armed');
  clock.fire();
  const { m, settled } = await modalAfter(route, pending, null);
  assert.equal(signals[0].aborted, true, 'request aborted');
  assert.equal(route.state.loading, false);
  assert.equal(route.state.answer, null);
  assert.equal(route.saved.length, 0, 'nothing archived');
  assert.match(texts(settled).join(' '), /Coach stopped responding\. Your question is back in the box — tap send to retry\./);
  assert.equal(m.props.question, 'Is my bench stalling?');
});

test('idle deadline is reset by each chunk and cleared on completion', async () => {
  const clock = fakeClock(); const enc = new TextEncoder(); const chunks = ['Hold ', '185.']; let i = 0;
  const reader = { read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined }) };
  const res = await streamingApi(reader, clock, [])('Q?', [], () => {}, [], undefined);
  assert.equal(res.answer, 'Hold 185.');
  assert.equal(clock.timers.size, 0);
});

test('retry copy only when the question was actually restored', async () => {
  const m = loadCoachModal(); m.render(); await tick();
  m.props.error = "You've hit today's free message limit."; const unsent = m.render();
  assert.equal(texts(unsent).filter(t => /free message limit/.test(t)).join(''), "You've hit today's free message limit.");
  assert.doesNotMatch(texts(unsent).join(' '), /back in the box/);
  m.props.error = 'HTTP 503: {"error":"down"}'; const technical = texts(m.render()).join(' ');
  assert.match(technical, /Coach couldn't answer right now\./);
  assert.doesNotMatch(technical, /back in the box/, 'no restore happened, so no claim');
  const restored = (await failedStream()).tree;
  assert.match(texts(restored).join(' '), /Coach couldn't answer right now\. Your question is back in the box — tap send to retry\./);
  // Uniform: a restored non-technical error carries the same retry line.
  const limited = loadCoachModal(); limited.render(); await tick();
  limited.props.question = 'Q?'; send(limited.render()); limited.props.loading = true; limited.render();
  limited.props.loading = false; limited.props.error = "You've hit today's free message limit."; limited.render();
  assert.match(texts(limited.render()).join(' '), /free message limit\. Your question is back in the box — tap send to retry\./);
});

test('restWorkSetsOnly on: a [work, warmup] batch still rests once for the work set', async () => {
  const on = { ...COACHING_POLICY, restWorkSetsOnly: true };
  const rows = [{ exercise: 'Bench', set: 1, weightLbs: 185, reps: 8, notes: '', setKind: 'work' }, { exercise: 'Squat', set: 1, weightLbs: 95, reps: 5, notes: '', setKind: 'warmup' }];
  const result = await runWorkoutRoute('Bench and Squat 185 8', [], { rows }, 1, false, { COACHING_POLICY: on });
  assert.deepEqual(rests(result).map((c: any) => c.data.exercise), ['Bench']);
  const off = await runWorkoutRoute('Bench and Squat 185 8', [], { rows }, 1, false, { COACHING_POLICY });
  assert.deepEqual(rests(off).map((c: any) => c.data.exercise), ['Squat'], 'flag off unchanged: last non-cardio row');
});

async function reviewNote(note: string, policy?: any) {
  const api = sourceModule('lib/api.ts', {
    './performedSets': { isPerformedRow: () => true }, './nextSetDecision': nextSetDecision, './supabase': { supabaseUrl: 'https://offline.invalid' },
    './auth': { fetchWithAuth: async () => ({ ok: true, text: async () => JSON.stringify({ ...valid, nextSessionNote: note }) }) },
    './profile': { fetchProfile: async () => null }, './entitlements': { parseFeatureGateError: () => null },
    './nutrition': {}, './coaching': {}, './programming': {}, './bodyMetrics': {}, './exerciseLibrary': {},
  }).api;
  return (await api.generateSessionReview(structuredClone(reviewRows), 'Legs', policy)).nextSessionNote;
}

test('suppressReviewLoadAdvice enforces: numeric load in nextSessionNote is dropped, never fabricated', async () => {
  const on = { ...OFF, suppressReviewLoadAdvice: true };
  for (const note of ['Try 190 lbs for 8.', 'Add 2.5kg next time', 'Go to 80% of max', 'Use 200 pounds']) {
    assert.equal(await reviewNote(note, on), '', note);
    assert.equal(await reviewNote(note, OFF), note, 'flag off unchanged');
  }
  assert.equal(await reviewNote('Keep every rep smooth on the last set.', on), 'Keep every rep smooth on the last set.');
});
