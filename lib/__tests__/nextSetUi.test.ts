// A3: mounted, refreshed in-session next-set decision UI. Executes the real route
// helpers/closures/JSX from app/(tabs)/index.tsx and the real NextSetSuggestionPill
// under a minimal hook runtime with a fake clock. Device behaviour is V2, not claimed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './workoutIdentityHarness.ts';
import { COACHING_POLICY } from '../coachingPolicy.ts';
import { currentAnswer } from '../coachingAnswers.ts';
import { performedRows, isPendingSet, isPerformedRow } from '../performedSets.ts';

const rules = sourceModule('lib/workoutRules.ts');
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const plain = (v: any) => JSON.parse(JSON.stringify(v));

// ── fake clock ───────────────────────────────────────────────────────────────
function fakeClock() {
  let now = 0; let seq = 0; const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout: (fn: () => void, ms = 0) => { timers.set(++seq, { at: now + ms, fn }); return seq; },
    clearTimeout: (id: number) => { timers.delete(id); },
    async advance(ms: number) {
      now += ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]); due[1].fn();
      }
      await flush();
    },
    pending: () => timers.size,
  };
}

// ── minimal hook runtime (one mounted component) ─────────────────────────────
function hookRuntime() {
  let store: { states: any[]; refs: any[]; effects: any[] } | null = null;
  let si = 0, ri = 0, ei = 0; let queued: (() => void)[] = [];
  const react = {
    useState: (init: any) => { const s = store!; const i = si++; if (!(i in s.states)) s.states[i] = typeof init === 'function' ? init() : init;
      return [s.states[i], (v: any) => { s.states[i] = typeof v === 'function' ? v(s.states[i]) : v; }]; },
    useRef: (current: any) => { const s = store!; const i = ri++; return s.refs[i] ??= { current }; },
    useMemo: (fn: () => any) => fn(),
    useEffect: (fn: () => any, deps?: any[]) => {
      const s = store!; const i = ei++; const prev = s.effects[i];
      if (!prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps[k]))) queued.push(() => { prev?.cleanup?.(); s.effects[i] = { deps, cleanup: fn() }; });
    },
  };
  const unmount = () => { for (const e of store?.effects ?? []) e?.cleanup?.(); store = null; };
  const render = (element: any) => {
    if (!element) { unmount(); return null; }
    store ??= { states: [], refs: [], effects: [] };
    si = ri = ei = 0; queued = [];
    const tree = element.type(element.props);
    queued.forEach((f) => f());
    return tree;
  };
  return { react, render, unmount };
}
const node = (type: any, props: any) => ({ type, props });
const jsxRuntime = { jsx: node, jsxs: node, Fragment: 'Fragment' };
const text = (n: any): string => n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(text).join(' ') : typeof n === 'object' ? text(n.props?.children) : String(n);
const buttons = (n: any, out: any[] = []): any[] => {
  if (Array.isArray(n)) n.forEach((c) => buttons(c, out));
  else if (n && typeof n === 'object') { if (n.type === 'Pressable') out.push(n.props); buttons(n.props?.children, out); }
  return out;
};

function loadPill(runtime: ReturnType<typeof hookRuntime>, clock: ReturnType<typeof fakeClock>, fetchNextSetSuggestion = async () => ({ status: 'no_history' })) {
  const source = readFileSync(new URL('../../components/workout/NextSetSuggestion.tsx', import.meta.url), 'utf8');
  const deps: Record<string, any> = {
    'react/jsx-runtime': jsxRuntime, react: { __esModule: true, default: runtime.react, ...runtime.react },
    'react-native': { View: 'View', Pressable: 'Pressable', StyleSheet: { create: (v: any) => v } },
    '@/components/ui/themed-text': { ThemedText: 'ThemedText' }, '@/hooks/useThemeColor': { useThemeColor: () => 'themed' },
    '@/lib/programming': { fetchNextSetSuggestion },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: (n: string) => { assert.ok(n in deps, `missing ${n}`); return deps[n]; }, console, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  return exports;
}

// ── real route source ────────────────────────────────────────────────────────
const ROUTE = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
const AST = ts.createSourceFile('index.tsx', ROUTE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compiled = new Map<string, string>();
function routeCode(name: string): string {
  if (compiled.has(name)) return compiled.get(name)!;
  const found: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n)) && n.name && ts.isIdentifier(n.name) && n.name.text === name) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(AST);
  assert.equal(found.length, 1, `route must declare exactly one ${name}`);
  const n = found[0] as any;
  const expression = ts.isVariableDeclaration(n) ? n.initializer.getText(AST) : n.getText(AST);
  const code = ts.transpileModule(`exports.run = ${ts.isFunctionDeclaration(n) ? `(${expression})` : expression};`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  // Function scope: repeated evaluation in one context must not redeclare transpiler bindings.
  const scoped = `(function () {\n${code}\n})();`;
  compiled.set(name, scoped);
  return scoped;
}
function routeValue(name: string, ctx: any) {
  if (!vm.isContext(ctx)) vm.createContext(ctx);
  ctx.exports = {};
  ctx.require = (n: string) => { assert.equal(n, 'react/jsx-runtime'); return jsxRuntime; };
  vm.runInContext(routeCode(name), ctx);
  return ctx.exports.run;
}
const HELPERS = ['rowContent', 'nextPlannedRowIndex', 'nextSetExercise', 'nextSetSignature', 'trackNextSet', 'nextSetEvidence', 'applyNextSetLoad'];
const CLOSURES = ['loadNextSet', 'isNextSetCurrent', 'onNextSetResult', 'currentNextSetDecision', 'onUseNextSet'];

// TEST ONLY. Not product policy (D09/Q8 unapproved).
const TEST_QUESTIONNAIRE = { version: 'test-only', freshnessMs: 600_000, questions: [{ id: 'pain', kind: 'choice', prompt: 'test', scope: 'exercise', choices: ['none', 'present'] }] };

const planned = (id: string, exercise: string, set: number, reps = '8') => ({ id, exercise, set, weightLbs: '', reps: '', notes: '', timestamp: 1, status: 'committed', performance: 'planned', setKind: 'work', plannedTarget: { reps } });
const done = (id: string, exercise: string, set: number, w: string, r: string, extra: any = {}) => ({ id, exercise, set, weightLbs: w, reps: r, notes: '', timestamp: 1, status: 'committed', performance: 'performed', setKind: 'work', ...extra });
const decision = (code: string, extra: any = {}) => ({ status: 'decision', baseline: { workoutId: 'w0', date: '2026-10-12', exercise: 'Bench Press', sets: [] },
  decision: { code, reason: extra.reason ?? 'target_met', evidenceIds: extra.evidenceIds ?? ['r1', 'baseline:w0'], policyVersion: 'test', ...(extra.action && { action: extra.action }) } });

function mountRoute(opts: { rows: any[]; flag?: boolean; answers?: any[]; fetch?: (exercise: string, evidence: any) => Promise<any> }) {
  const clock = fakeClock(); const runtime = hookRuntime(); const pill = loadPill(runtime, clock);
  const calls: { exercise: string; evidence: any }[] = []; const toasts: string[] = [];
  const pending: { resolve: (v: any) => void; evidence: any }[] = [];
  const policy = { ...COACHING_POLICY, adaptiveNextSet: opts.flag ?? true, questionnaire: TEST_QUESTIONNAIRE };
  const ctx: any = vm.createContext({
    COACHING_POLICY: policy, workoutActive: true, workoutId: 's1', rows: opts.rows, coachingAnswerLog: opts.answers ?? [],
    editingCell: null, canUseSession: () => true, ownership: { busy: false },
    showToast: (t: string) => toasts.push(t), Date, JSON, Number, String, Math, Object, Array, Promise, Set, Map, Boolean,
    normalizeExercise: rules.normalizeExercise, getLastExerciseFromRows: rules.getLastExerciseFromRows,
    performedRows, isPendingSet, isPerformedRow, currentAnswer, NextSetSuggestionPill: pill.NextSetSuggestionPill,
    useRef: (current: any) => ({ current }),
    fetchNextSetDecision: (exercise: string, evidence: any) => {
      calls.push({ exercise, evidence: plain(evidence) });
      if (opts.fetch) return opts.fetch(exercise, evidence);
      return new Promise((resolve) => pending.push({ resolve, evidence }));
    },
  });
  ctx.draftRowsRef = { current: ctx.rows };
  ctx.setRows = (v: any) => { const next = typeof v === 'function' ? v(ctx.draftRowsRef.current) : v; ctx.draftRowsRef.current = next; ctx.rows = next; };
  ctx.NEXT_SET_DEBOUNCE_MS = routeValue('NEXT_SET_DEBOUNCE_MS', ctx);
  ctx.NEXT_SET_MAX_SETS = routeValue('NEXT_SET_MAX_SETS', ctx);
  for (const name of HELPERS) ctx[name] = routeValue(name, ctx);
  ctx.nextSetStateRef = routeValue('nextSetStateRef', ctx);
  ctx.nextSetDecisionRef = routeValue('nextSetDecisionRef', ctx);
  let tree: any = null;
  const render = () => {
    ctx.nextSet = routeValue('nextSet', ctx);
    for (const name of CLOSURES) ctx[name] = routeValue(name, ctx);
    tree = runtime.render(routeValue('nextSetPill', ctx));
    return text(tree);
  };
  const r = {
    ctx, clock, calls, toasts, pending,
    render,
    shown: () => text(tree), buttons: () => buttons(tree),
    setRows(next: any[]) { ctx.setRows(next); return render(); },
    async settle() { render(); await clock.advance(ctx.NEXT_SET_DEBOUNCE_MS); return render(); },
    async resolve(i: number, value: any) { pending[i].resolve(value); await flush(); return render(); },
    press(label: RegExp) { const b = buttons(tree).find((p) => label.test(p.accessibilityLabel ?? '')); assert.ok(b, `no button ${label}`); b.onPress(); },
  };
  return r;
}

const template = () => [planned('b1', 'Bench Press', 1), planned('b2', 'Bench Press', 2), planned('s1', 'Squat', 1), planned('s2', 'Squat', 2)];

// ── flag off ─────────────────────────────────────────────────────────────────
test('flag off: HomeScreen mounts no pill, tracks nothing and fetches nothing (HEAD render)', async () => {
  const r = mountRoute({ rows: [done('r1', 'Bench Press', 1, '185', '8')], flag: false });
  let tracked = 0; const real = r.ctx.trackNextSet; r.ctx.trackNextSet = (...a: any[]) => { tracked++; return real(...a); };
  assert.equal(r.render(), '');
  assert.equal(r.ctx.nextSet, false);
  assert.equal(routeValue('nextSetPill', r.ctx), null);
  await r.clock.advance(10_000);
  assert.equal(r.calls.length, 0); assert.equal(tracked, 0); assert.equal(r.clock.pending(), 0);
  // A1 keeps binding to the last row with the flag off.
  assert.equal(routeValue('coachingExerciseKey', { ...r.ctx, rows: template() }), 'squat');
  assert.equal(routeValue('currentNextSetDecision', r.ctx)(), undefined);
});

// ── flag on: binding + visibility ────────────────────────────────────────────
test('flag on: one pill bound to the exercise being acted on, not merely the last row', async () => {
  const r = mountRoute({ rows: template() });
  assert.match(await r.settle(), /Bench Press/);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].exercise, 'Bench Press');
  assert.equal(r.calls[0].evidence.exerciseKey, 'bench press');
  assert.deepEqual(r.calls[0].evidence.target, { reps: { low: 8, high: 8 } });
  assert.equal(r.calls[0].evidence.equipment, null, 'equipment unknown is sent as null (server requires the key)');
  // A1 answers bind to the same key as the pill.
  assert.equal(routeValue('coachingExerciseKey', r.ctx), 'bench press');
  // Logging a squat set moves the binding to squat.
  r.setRows([planned('b1', 'Bench Press', 1), planned('b2', 'Bench Press', 2), done('s1', 'Squat', 1, '225', '5'), planned('s2', 'Squat', 2)]);
  assert.match(await r.settle(), /Squat/);
  assert.equal(r.calls.at(-1)!.evidence.exerciseKey, 'squat');
  assert.deepEqual(r.calls.at(-1)!.evidence.sessionSets, [{ id: 's1', setKind: 'work', weightLbs: 225, reps: 5 }]);
});
test('a reorder (positions/set numbers only) never rebinds the pill', async () => {
  const rows = [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2), planned('s1', 'Squat', 1)];
  const r = mountRoute({ rows });
  assert.match(await r.settle(), /Bench Press/);
  r.setRows([planned('s1', 'Squat', 1), { ...rows[0] }, { ...rows[1] }]);
  assert.match(await r.settle(), /Bench Press/);
});

// ── refresh triggers ─────────────────────────────────────────────────────────
test('refreshes once after a performed set, an edit, a delete, a fresh answer and a session change', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2), planned('b3', 'Bench Press', 3)] });
  await r.settle();
  const revisions = () => r.calls.map((c) => c.evidence.revision);
  assert.equal(r.calls.length, 1);
  // performed set
  r.setRows([done('b1', 'Bench Press', 1, '185', '8'), done('b2', 'Bench Press', 2, '185', '7'), planned('b3', 'Bench Press', 3)]);
  await r.settle(); assert.equal(r.calls.length, 2);
  assert.deepEqual(r.calls[1].evidence.sessionSets.map((s: any) => s.id), ['b1', 'b2']);
  // edit
  r.setRows([done('b1', 'Bench Press', 1, '185', '8'), done('b2', 'Bench Press', 2, '185', '6'), planned('b3', 'Bench Press', 3)]);
  await r.settle(); assert.equal(r.calls.length, 3); assert.equal(r.calls[2].evidence.sessionSets[1].reps, 6);
  // delete
  r.setRows([done('b1', 'Bench Press', 1, '185', '8'), planned('b3', 'Bench Press', 3)]);
  await r.settle(); assert.equal(r.calls.length, 4); assert.deepEqual(r.calls[3].evidence.sessionSets.map((s: any) => s.id), ['b1']);
  // fresh answer
  r.ctx.coachingAnswerLog = [{ answerId: 'a1', sessionId: 's1', exerciseKey: 'bench press', questionId: 'pain', state: 'answered', value: 'none', capturedAt: Date.now(), provenance: 'user' }];
  await r.settle(); assert.equal(r.calls.length, 5);
  assert.equal(r.calls[4].evidence.answers.pain.state, 'answered');
  // session change
  r.ctx.workoutId = 's2'; r.ctx.coachingAnswerLog = [];
  await r.settle(); assert.equal(r.calls.length, 6);
  assert.equal(r.calls[5].evidence.sessionId, 's2'); assert.deepEqual(r.calls[5].evidence.request, { sessionId: 's2', revision: r.calls[5].evidence.revision });
  // monotonic revision; an unchanged re-render does not refetch
  const revs = revisions();
  assert.deepEqual(revs, [...revs].sort((a, b) => a - b)); assert.equal(new Set(revs).size, revs.length);
  await r.settle(); assert.equal(r.calls.length, 6);
});
test('a fresh answer does not re-prompt or rebind the questionnaire', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('s1', 'Squat', 1)] });
  await r.settle();
  const before = routeValue('coachingExerciseKey', r.ctx);
  r.ctx.coachingAnswerLog = [{ answerId: 'a1', sessionId: 's1', exerciseKey: 'bench press', questionId: 'pain', state: 'skipped', capturedAt: 1, provenance: 'user' }];
  await r.settle();
  assert.equal(routeValue('coachingExerciseKey', r.ctx), before);
  assert.equal(r.ctx.coachingAnswerLog.length, 1, 'refresh never appends answers');
});

// ── fences ───────────────────────────────────────────────────────────────────
test('a stale response is rejected; only the current revision renders', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2)] });
  await r.settle(); assert.equal(r.pending.length, 1);
  r.setRows([done('b1', 'Bench Press', 1, '185', '9'), planned('b2', 'Bench Press', 2)]);
  await r.settle(); assert.equal(r.pending.length, 2);
  await r.resolve(0, decision('increase', { action: { loadLbs: 999 } }));
  assert.doesNotMatch(r.shown(), /999/); assert.match(r.shown(), /Checking/);
  await r.resolve(1, decision('hold', { reason: 'below_progression', action: { loadLbs: 185 } }));
  assert.match(r.shown(), /Hold: 185 lb/); assert.doesNotMatch(r.shown(), /999/);
});
test('a never-settling request ends in an explicit error with Retry, never stuck Loading', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8')] });
  await r.settle(); assert.match(r.shown(), /Checking/);
  await r.clock.advance(60_000); r.render();
  assert.match(r.shown(), /Suggestions unavailable/); assert.doesNotMatch(r.shown(), /Checking/);
  r.press(/Retry/); r.render(); await r.clock.advance(r.ctx.NEXT_SET_DEBOUNCE_MS);
  assert.equal(r.calls.length, 2);
});
test('a casing-only rename while a request is in flight does not stick on Loading', async () => {
  const r = mountRoute({ rows: [done('b1', 'bench press', 1, '185', '8')] });
  await r.settle();
  r.setRows([done('b1', 'Bench Press', 1, '185', '8')]);
  await r.settle();
  await r.resolve(0, decision('hold', { action: { loadLbs: 185 } }));
  await r.resolve(1, decision('hold', { action: { loadLbs: 185 } }));
  assert.doesNotMatch(r.shown(), /Checking/); assert.match(r.shown(), /Hold: 185 lb/);
  assert.equal(r.calls[1].evidence.exerciseKey, 'bench press');
});
test('a batch fill coalesces into a single refresh', async () => {
  const r = mountRoute({ rows: [planned('b1', 'Bench Press', 1), planned('b2', 'Bench Press', 2), planned('b3', 'Bench Press', 3)] });
  await r.settle(); const before = r.calls.length;
  r.setRows([done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2), planned('b3', 'Bench Press', 3)]);
  await r.clock.advance(50);
  r.setRows([done('b1', 'Bench Press', 1, '185', '8'), done('b2', 'Bench Press', 2, '185', '8'), planned('b3', 'Bench Press', 3)]);
  await r.clock.advance(50);
  r.setRows([done('b1', 'Bench Press', 1, '185', '8'), done('b2', 'Bench Press', 2, '185', '8'), done('b3', 'Bench Press', 3, '185', '8')]);
  await r.clock.advance(r.ctx.NEXT_SET_DEBOUNCE_MS);
  assert.equal(r.calls.length - before, 1);
  assert.deepEqual(r.calls.at(-1)!.evidence.sessionSets.map((s: any) => s.id), ['b1', 'b2', 'b3']);
});
test('syncing optimistic rows do not trigger their own refresh', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8')] });
  await r.settle();
  r.setRows([done('b1', 'Bench Press', 1, '185', '8'), done('b2', 'Bench Press', 2, '185', '8', { status: 'syncing' })]);
  await r.settle(); assert.equal(r.calls.length, 1);
  r.setRows([done('b1', 'Bench Press', 1, '185', '8'), done('b2', 'Bench Press', 2, '185', '8')]);
  await r.settle(); assert.equal(r.calls.length, 2);
});

// ── Use ──────────────────────────────────────────────────────────────────────
test('Use applies a current decision only to the next planned row, never a performed row', async () => {
  const performed = done('b1', 'Bench Press', 1, '185', '8');
  const r = mountRoute({ rows: [performed, planned('b2', 'Bench Press', 2), planned('b3', 'Bench Press', 3)] });
  await r.settle();
  await r.resolve(0, decision('increase', { action: { loadLbs: 190, reps: { low: 8, high: 8 } } }));
  assert.match(r.shown(), /Increase: 190 lb × 8/);
  r.press(/Use/);
  const rows = r.ctx.draftRowsRef.current;
  assert.deepEqual(plain(rows[0]), performed, 'performed row untouched');
  assert.deepEqual(plain(rows[1].plannedTarget), { reps: '8', weightLbs: '190' });
  assert.equal(rows[1].weightLbs, '', 'actual values stay empty'); assert.equal(rows[1].reps, '');
  assert.equal(rows[1].performance, 'planned'); assert.equal(isPerformedRow(rows[1]), false);
  assert.deepEqual(plain(rows[2]), planned('b3', 'Bench Press', 3));
  assert.deepEqual(r.toasts, []);
});
test('Use rejects a decision that went stale before the tap', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2)] });
  await r.settle();
  await r.resolve(0, decision('increase', { action: { loadLbs: 190 } }));
  const use = r.buttons().find((b) => /Use/.test(b.accessibilityLabel));
  r.ctx.setRows([done('b1', 'Bench Press', 1, '185', '6'), planned('b2', 'Bench Press', 2)]); // newer evidence, not yet re-rendered
  const snapshot = plain(r.ctx.draftRowsRef.current);
  use.onPress();
  assert.deepEqual(plain(r.ctx.draftRowsRef.current), snapshot);
  assert.equal(r.toasts.length, 1);
});
test('stop/clarify/unavailable decisions have no Use and no load', async () => {
  for (const [code, reason] of [['stop_or_clarify', 'pain_stop'], ['clarify', 'answer_conflict'], ['unavailable', 'policy_unapproved'], ['no_history', 'no_history']]) {
    const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2)] });
    await r.settle();
    await r.resolve(0, decision(code, { reason }));
    assert.equal(r.buttons().filter((b) => /Use/.test(b.accessibilityLabel ?? '')).length, 0, code);
    assert.doesNotMatch(r.shown(), /\d+ lb/, code);
    assert.match(r.shown(), new RegExp(reason), `${code} shows its neutral reason code`);
  }
});
test('no Use control when there is no planned row to apply to', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8')] });
  await r.settle();
  await r.resolve(0, decision('increase', { action: { loadLbs: 190 } }));
  assert.equal(r.buttons().filter((b) => /Use/.test(b.accessibilityLabel ?? '')).length, 0);
});
test('decision shows the evidence-linked reason and accessible controls', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2)] });
  await r.settle();
  await r.resolve(0, decision('hold', { reason: 'below_progression', action: { loadLbs: 185 }, evidenceIds: ['b1', 'baseline:w0'] }));
  assert.match(r.shown(), /below_progression/);
  assert.match(r.shown(), /2 evidence items.*last session \(2026-10-12\)/);
  for (const b of r.buttons()) { assert.equal(b.accessibilityRole, 'button'); assert.ok(b.accessibilityLabel); }
});

// ── coach/chat decision passing ──────────────────────────────────────────────
test('coach/chat get only the current decision, within the 50-id contract', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2)] });
  await r.settle();
  assert.equal(r.ctx.currentNextSetDecision(), undefined);
  await r.resolve(0, decision('hold', { action: { loadLbs: 185 } }));
  assert.equal(r.ctx.currentNextSetDecision()?.code, 'hold');
  r.setRows([done('b1', 'Bench Press', 1, '185', '9'), planned('b2', 'Bench Press', 2)]);
  assert.equal(r.ctx.currentNextSetDecision(), undefined, 'stale after new evidence');
  await r.clock.advance(r.ctx.NEXT_SET_DEBOUNCE_MS);
  await r.resolve(1, decision('hold', { action: { loadLbs: 185 }, evidenceIds: Array.from({ length: 51 }, (_, i) => `x${i}`) }));
  assert.equal(r.ctx.currentNextSetDecision(), undefined, 'omitted rather than truncated');
});
test('route passes the decision to chat and askCoach only behind the flag', () => {
  for (const name of ['sendMessage', 'submitCoachQuestion']) {
    const body = routeCode(name);
    // Flag off keeps the exact HEAD call shape (coachingContext pins chat to 4 args).
    assert.match(body, /COACHING_POLICY\.adaptiveNextSet\s*\?\s*api\.(chat|askCoach)\([^;]*currentNextSetDecision\(\)\)\s*:\s*api\.(chat|askCoach)\([^;]*context\)\)/, name);
  }
});
test('api.chat and api.askCoach send nextSetDecision only when given', async () => {
  const bodies: any[] = [];
  const fetchWithAuth = async (_url: string, init: any) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ answer: 'ok' })); };
  // Own VM: askCoach needs the runtime's AbortController/TextDecoder (as coachingFeedback does).
  const deps: Record<string, any> = {
    './performedSets': { isPerformedRow }, './nextSetDecision': sourceModule('lib/nextSetDecision.ts'),
    './supabase': { supabaseUrl: 'https://offline.invalid' }, './auth': { fetchWithAuth },
    './profile': { fetchProfile: async () => null }, './entitlements': { parseFeatureGateError: () => null },
    './nutrition': {}, './coaching': {}, './programming': {}, './bodyMetrics': {}, './exerciseLibrary': {},
  };
  const mod: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../api.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports: mod, require: (n: string) => { assert.ok(n in deps, n); return deps[n]; }, console, JSON, Response, TextDecoder, AbortController, Error, setTimeout, clearTimeout });
  const api = mod.api;
  const d = decision('hold', { action: { loadLbs: 185 } }).decision;
  await api.chat('m', [], undefined, undefined);
  await api.chat('m', [], undefined, undefined, d);
  await api.askCoach('q', [], undefined, undefined, undefined);
  await api.askCoach('q', [], undefined, undefined, undefined, undefined, d);
  assert.equal('nextSetDecision' in bodies[0], false); assert.deepEqual(bodies[1].nextSetDecision, plain(d));
  assert.equal('nextSetDecision' in bodies[2], false); assert.deepEqual(bodies[3].nextSetDecision, plain(d));
});

// ── program day ──────────────────────────────────────────────────────────────
test("program day renders a 'decision' result instead of loading forever", async () => {
  const clock = fakeClock(); const runtime = hookRuntime(); const pill = loadPill(runtime, clock);
  const result = decision('hold', { action: { loadLbs: 185 } });
  const exercise = { id: 'e1', exercise_name: 'Bench Press', target_sets: 3, target_reps_low: 8, target_reps_high: 8, rest_seconds: 90 };
  const day = { id: 'd1', day_index: 1, exercises: [exercise] };
  const mod = sourceModule('app/program/day.tsx', {
    'react/jsx-runtime': jsxRuntime, react: { __esModule: true, default: runtime.react, ...runtime.react },
    'react-native': { ScrollView: 'ScrollView', StyleSheet: { create: (v: any) => v }, View: 'View' },
    'expo-router': { useLocalSearchParams: () => ({ dayId: 'd1' }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/components/ui/themed-view': { ThemedView: 'ThemedView' }, '@/components/ui/themed-text': { ThemedText: 'ThemedText' },
    '@/components/ui/screen-header': { ScreenHeader: 'ScreenHeader' }, '@/hooks/useThemeColor': { useThemeColor: () => 'themed' },
    '@/contexts/ProgramContext': { useProgram: () => ({ currentWeek: { days: [day] } }) },
    '@/lib/programming': { fetchNextSetSuggestion: async () => result },
    '@/lib/programFormat': { formatProgramDayLabel: () => 'Push' },
    '@/components/workout/NextSetSuggestion': pill,
  });
  runtime.render({ type: mod.default, props: {} }); await flush();
  const shown = text(runtime.render({ type: mod.default, props: {} }));
  assert.doesNotMatch(shown, /loading/i); assert.match(shown, /Hold: 185 lb/);
});

// ── SPEC repair (reviewer findings) ──────────────────────────────────────────
test('R1: a stale drop whose rows revert before re-render never leaves Checking forever', async () => {
  const a = [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2)];
  const r = mountRoute({ rows: a });
  await r.settle(); assert.equal(r.pending.length, 1);
  r.ctx.setRows([done('b1', 'Bench Press', 1, '185', '6'), planned('b2', 'Bench Press', 2)]); // not yet rendered
  r.pending[0].resolve(decision('increase', { action: { loadLbs: 999 } })); await flush();
  r.ctx.setRows(a.map((row) => ({ ...row }))); // same signature again: no revision bump, no new effect
  r.render(); await r.clock.advance(60_000); r.render();
  assert.doesNotMatch(r.shown(), /Checking/); assert.doesNotMatch(r.shown(), /999/);
  assert.match(r.shown(), /Suggestions unavailable/);
  r.press(/Retry/); r.render(); await r.clock.advance(r.ctx.NEXT_SET_DEBOUNCE_MS);
  assert.equal(r.calls.length, 2);
  await r.resolve(1, decision('hold', { action: { loadLbs: 185 } }));
  assert.match(r.shown(), /Hold: 185 lb/);
});
test('R2: malformed stop_or_clarify/clarify carrying a load never offer Use and are refused by applyNextSetLoad', async () => {
  for (const [code, reason] of [['stop_or_clarify', 'pain_stop'], ['clarify', 'answer_conflict'], ['unavailable', 'policy_unapproved']]) {
    const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2)] });
    await r.settle();
    const bad = decision(code, { reason, action: { loadLbs: 300, reps: { low: 5, high: 5 } } });
    await r.resolve(0, bad);
    assert.equal(r.buttons().filter((b) => /Use/.test(b.accessibilityLabel ?? '')).length, 0, code);
    assert.doesNotMatch(r.shown(), /300/, code);
    assert.equal(r.ctx.applyNextSetLoad(r.ctx.rows, 'bench press', bad.decision), null, code);
    r.ctx.onUseNextSet(bad.decision, r.ctx.nextSet.revision);
    assert.equal(r.ctx.draftRowsRef.current[1].plannedTarget.weightLbs, undefined, `${code} never applied`);
  }
});
test('R3: a response landing before the re-render of changed rows is dropped at arrival', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8'), planned('b2', 'Bench Press', 2)] });
  await r.settle();
  r.ctx.setRows([done('b1', 'Bench Press', 1, '185', '6'), planned('b2', 'Bench Press', 2)]);
  r.pending[0].resolve(decision('increase', { action: { loadLbs: 999 } })); await flush();
  assert.equal(r.ctx.nextSetDecisionRef.current, null, 'not recorded for coach/chat');
  r.render();
  assert.doesNotMatch(r.shown(), /999/);
  assert.equal(r.buttons().filter((b) => /Use/.test(b.accessibilityLabel ?? '')).length, 0);
});
test('R4: after a reload the binding follows the last performed set by timestamp, not position', async () => {
  const rows = [done('s1', 'Squat', 1, '225', '5', { timestamp: 200 }), done('b1', 'Bench Press', 1, '185', '8', { timestamp: 100 }), planned('b2', 'Bench Press', 2)];
  const r = mountRoute({ rows }); // fresh mount = restored draft
  assert.match(await r.settle(), /Squat/);
  assert.equal(r.calls[0].evidence.exerciseKey, 'squat');
  // A later set on bench (composer stamps Date.now()) rebinds; a reorder does not.
  r.setRows([...rows.slice(0, 2), done('b2', 'Bench Press', 2, '185', '8', { timestamp: 300 })]);
  assert.match(await r.settle(), /Bench Press/);
  r.setRows([r.ctx.rows[2], r.ctx.rows[0], r.ctx.rows[1]]);
  assert.match(await r.settle(), /Bench Press/);
});
test('R6: evidence carries only the bound exercise\'s sets', async () => {
  const r = mountRoute({ rows: [done('s1', 'Squat', 1, '225', '5', { timestamp: 1 }), done('b1', 'Bench Press', 1, '185', '8', { timestamp: 2 }), done('c1', 'Run', 1, '', '', { isCardio: true, timestamp: 3 }), planned('b2', 'Bench Press', 2)] });
  await r.settle();
  assert.deepEqual(r.calls[0].evidence.sessionSets.map((s: any) => s.id), ['b1']);
});
test('R7: equal timestamps bind to the later row', async () => {
  const r = mountRoute({ rows: [done('b1', 'Bench Press', 1, '185', '8', { timestamp: 5 }), done('s1', 'Squat', 1, '225', '5', { timestamp: 5 }), planned('b2', 'Bench Press', 2)] });
  assert.match(await r.settle(), /Squat/);
});
test('R8: a non-finite timestamp never beats a finite one', async () => {
  for (const bad of [NaN, Infinity, undefined]) {
    const r = mountRoute({ rows: [done('s1', 'Squat', 1, '225', '5', { timestamp: 100 }), done('b1', 'Bench Press', 1, '185', '8', { timestamp: bad })] });
    assert.match(await r.settle(), /Squat/, String(bad));
  }
});
