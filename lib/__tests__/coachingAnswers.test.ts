import assert from 'node:assert/strict';
import test from 'node:test';
import { currentAnswer, isApplicable, isMalformedScale, validateAnswer } from '../coachingAnswers.ts';
import { sourceModule } from './workoutIdentityHarness.ts';
import type { CoachingAnswer, QuestionnairePolicy } from '../../types/coachingAnswers';

// TEST ONLY. Not product policy: D09/Q8 wording, scales and freshness are unapproved.
const TEST_ONLY_POLICY: QuestionnairePolicy = {
  version: 'test-only',
  freshnessMs: 1000,
  questions: [
    { id: 'pain', kind: 'choice', prompt: 'test pain prompt', scope: 'exercise', choices: ['none', 'present'] },
    { id: 'effort', kind: 'scale', prompt: 'test effort prompt', scope: 'exercise', min: 6, max: 10, step: 0.5 },
    { id: 'readiness', kind: 'scale', prompt: 'test readiness prompt', scope: 'session', min: 1, max: 5, step: 1 },
  ],
};
const NOW = 10_000;
const ctx = { sessionId: 's1', exerciseKey: 'bench press' };
let seq = 0;
// Skips are built without a `value` key, as persisted answers are.
const ans = (over: Partial<CoachingAnswer> = {}): CoachingAnswer => JSON.parse(JSON.stringify({
  answerId: `a${++seq}`, sessionId: 's1', exerciseKey: 'bench press', questionId: 'pain',
  state: 'answered', value: 'present', capturedAt: NOW - 100, provenance: 'user', ...over,
}));
const reject = (reason: string) => ({ ok: false, reason });

test('null policy is inert everywhere', () => {
  const a = ans();
  assert.deepEqual(validateAnswer(a, null), reject('policy_unapproved'));
  assert.deepEqual(isApplicable(a, ctx, null, NOW), reject('policy_unapproved'));
  assert.deepEqual(currentAnswer([a], ctx, null, NOW), {});
});

test('validate: bounds, step, choice, value presence', () => {
  const P = TEST_ONLY_POLICY;
  assert.deepEqual(validateAnswer(ans(), P), { ok: true });
  assert.deepEqual(validateAnswer(ans({ questionId: 'nope' }), P), reject('unknown_question'));
  assert.deepEqual(validateAnswer(ans({ value: 'maybe' }), P), reject('invalid_choice'));
  assert.deepEqual(validateAnswer(ans({ value: undefined }), P), reject('invalid_choice'));
  assert.deepEqual(validateAnswer(ans({ questionId: 'effort', value: 8.5 }), P), { ok: true });
  assert.deepEqual(validateAnswer(ans({ questionId: 'effort', value: 10.5 }), P), reject('out_of_range'));
  assert.deepEqual(validateAnswer(ans({ questionId: 'effort', value: 5 }), P), reject('out_of_range'));
  assert.deepEqual(validateAnswer(ans({ questionId: 'effort', value: 7.25 }), P), reject('off_step'));
  for (const value of [NaN, Infinity, '8', undefined]) {
    assert.deepEqual(validateAnswer(ans({ questionId: 'effort', value }), P), reject('invalid_value'), String(value));
  }
  assert.deepEqual(validateAnswer(ans({ state: 'skipped', value: undefined }), P), { ok: true });
  assert.deepEqual(validateAnswer(ans({ state: 'unknown', value: undefined }), P), { ok: true });
  assert.deepEqual(validateAnswer(ans({ state: 'skipped', value: 'none' }), P), reject('unexpected_value'), 'skip is never a value');
  assert.deepEqual(validateAnswer(ans({ state: 'unknown', value: 0 }), P), reject('unexpected_value'));
});

test('no answer: every question is unknown, no default effort or no-pain invented', () => {
  const current = currentAnswer([], ctx, TEST_ONLY_POLICY, NOW);
  assert.deepEqual(current, {
    pain: { questionId: 'pain', state: 'unknown' },
    effort: { questionId: 'effort', state: 'unknown' },
    readiness: { questionId: 'readiness', state: 'unknown' },
  });
});

test('skip stays skipped, never a value; explicit no-pain is distinct', () => {
  const skip = ans({ state: 'skipped', value: undefined });
  assert.deepEqual(currentAnswer([skip], ctx, TEST_ONLY_POLICY, NOW).pain, { questionId: 'pain', state: 'skipped', answer: skip });
  const none = ans({ value: 'none' });
  assert.deepEqual(currentAnswer([none], ctx, TEST_ONLY_POLICY, NOW).pain, { questionId: 'pain', state: 'answered', answer: none });
});

test('skip after a painful answer never clears it (different or same answerId)', () => {
  const pain = ans();
  const laterSkip = ans({ state: 'skipped', value: undefined, capturedAt: NOW - 50 });
  assert.deepEqual(currentAnswer([pain, laterSkip], ctx, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'answered', answer: pain, skippedLater: true });
  const editedToSkip = { ...pain, state: 'skipped' as const, value: undefined, capturedAt: NOW - 50 };
  assert.deepEqual(currentAnswer([pain, editedToSkip], ctx, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'answered', answer: pain, skippedLater: true });
  const unknown = ans({ state: 'unknown', value: undefined });
  assert.equal(currentAnswer([pain, unknown], ctx, TEST_ONLY_POLICY, NOW).pain.state, 'answered');
});

test('changed answer: differing values conflict and keep both, even under one answerId', () => {
  const first = ans({ value: 'present' });
  const edited = { ...first, value: 'none', capturedAt: NOW - 10 };
  assert.deepEqual(currentAnswer([first, edited], ctx, TEST_ONLY_POLICY, NOW).pain, { questionId: 'pain', state: 'conflict', evidence: [first, edited] });
  const other = ans({ value: 'none', capturedAt: NOW - 10 });
  assert.deepEqual(currentAnswer([first, other], ctx, TEST_ONLY_POLICY, NOW).pain, { questionId: 'pain', state: 'conflict', evidence: [first, other] });
  const same = ans({ value: 'present', capturedAt: NOW - 10 });
  assert.deepEqual(currentAnswer([first, same], ctx, TEST_ONLY_POLICY, NOW).pain, { questionId: 'pain', state: 'answered', answer: same });
});

test('stale timestamp: boundary is still fresh, beyond it is stale', () => {
  const edge = ans({ capturedAt: NOW - TEST_ONLY_POLICY.freshnessMs });
  assert.deepEqual(isApplicable(edge, ctx, TEST_ONLY_POLICY, NOW), { ok: true });
  const old = ans({ capturedAt: NOW - TEST_ONLY_POLICY.freshnessMs - 1 });
  assert.deepEqual(isApplicable(old, ctx, TEST_ONLY_POLICY, NOW), reject('stale'));
  // Excluded answered evidence is never dropped: with no survivor it needs clarification.
  assert.deepEqual(currentAnswer([old], ctx, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'conflict', evidence: [old], excluded: [{ answer: old, reason: 'stale' }] });
});

test('clock change: future capture is excluded, not applicable; later correction wins by log order, not timestamp', () => {
  const future = ans({ capturedAt: NOW + 1 });
  assert.deepEqual(isApplicable(future, ctx, TEST_ONLY_POLICY, NOW), reject('clock_skew'));
  assert.equal(currentAnswer([future], ctx, TEST_ONLY_POLICY, NOW).pain.state, 'conflict');
  // Clock moved backwards between entries: log position, not capturedAt, decides "later".
  const original = ans({ value: 'present', capturedAt: NOW - 10 });
  const repeat = { ...original, capturedAt: NOW - 500 };
  assert.deepEqual(currentAnswer([original, repeat], ctx, TEST_ONLY_POLICY, NOW).pain, { questionId: 'pain', state: 'answered', answer: repeat });
  const backdatedSkip = ans({ state: 'skipped', value: undefined, capturedAt: NOW - 500 });
  assert.deepEqual(currentAnswer([original, backdatedSkip], ctx, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'answered', answer: original, skippedLater: true });
});

test('other session is never applicable, for both scopes', () => {
  assert.deepEqual(isApplicable(ans({ sessionId: 's0' }), ctx, TEST_ONLY_POLICY, NOW), reject('other_session'));
  const readiness = ans({ questionId: 'readiness', value: 3, sessionId: 's0' });
  assert.deepEqual(isApplicable(readiness, ctx, TEST_ONLY_POLICY, NOW), reject('other_session'));
  assert.equal(currentAnswer([readiness], ctx, TEST_ONLY_POLICY, NOW).readiness.state, 'unknown');
});

test('other exercise / rename: exercise scope does not carry over; session scope does', () => {
  const squat = ans({ exerciseKey: 'squat' });
  assert.deepEqual(isApplicable(squat, ctx, TEST_ONLY_POLICY, NOW), reject('other_exercise'));
  const renamed = { ...ctx, exerciseKey: 'incline bench press' };
  assert.equal(currentAnswer([ans()], renamed, TEST_ONLY_POLICY, NOW).pain.state, 'unknown');
  const readiness = ans({ questionId: 'readiness', value: 3, exerciseKey: 'squat' });
  assert.deepEqual(isApplicable(readiness, ctx, TEST_ONLY_POLICY, NOW), { ok: true });
});

test('row revision: older or deleted (tombstone) revision of the same row is not applicable', () => {
  const a = ans({ rowId: 'r1', rowRevision: 2 });
  assert.deepEqual(isApplicable(a, { ...ctx, rowId: 'r1', rowRevision: 2 }, TEST_ONLY_POLICY, NOW), { ok: true });
  assert.deepEqual(isApplicable(a, { ...ctx, rowId: 'r1', rowRevision: 3 }, TEST_ONLY_POLICY, NOW), reject('revision_mismatch'));
  assert.deepEqual(isApplicable(a, { ...ctx, rowId: 'r1', rowRevision: Number.MAX_SAFE_INTEGER }, TEST_ONLY_POLICY, NOW), reject('revision_mismatch'));
  assert.equal(currentAnswer([a], { ...ctx, rowId: 'r1', rowRevision: 3 }, TEST_ONLY_POLICY, NOW).pain.state, 'conflict');
});

test('row-bound pain still applies to the exercise and to its next set', () => {
  const a = ans({ rowId: 'r1', rowRevision: 2 });
  assert.deepEqual(isApplicable(a, ctx, TEST_ONLY_POLICY, NOW), { ok: true });
  assert.deepEqual(isApplicable(a, { ...ctx, rowId: 'r2', rowRevision: 1 }, TEST_ONLY_POLICY, NOW), { ok: true });
  assert.equal(currentAnswer([a], { ...ctx, rowId: 'r2', rowRevision: 1 }, TEST_ONLY_POLICY, NOW).pain.state, 'answered');
});

test('overnight recovery: round-trip, then past freshness in a new session, is retained but not applicable', () => {
  const answers = [ans(), ans({ state: 'skipped', value: undefined }), ans({ questionId: 'effort', value: 8.5, rowId: 'r1', rowRevision: 1 })];
  const restored = JSON.parse(JSON.stringify(answers));
  assert.deepEqual(restored, answers);
  const c = { ...ctx, rowId: 'r1', rowRevision: 1 };
  assert.deepEqual(currentAnswer(restored, c, TEST_ONLY_POLICY, NOW), currentAnswer(answers, c, TEST_ONLY_POLICY, NOW));
  const nextMorning = NOW + TEST_ONLY_POLICY.freshnessMs + 1;
  const current = currentAnswer(restored, { ...c, sessionId: 's2' }, TEST_ONLY_POLICY, nextMorning);
  assert.deepEqual(current.pain, { questionId: 'pain', state: 'unknown', excluded: [{ answer: restored[0], reason: 'other_session' }] });
  assert.deepEqual(current.effort, { questionId: 'effort', state: 'unknown', excluded: [{ answer: restored[2], reason: 'other_session' }] });
  assert.deepEqual(current.readiness, { questionId: 'readiness', state: 'unknown' });
});

// Reviewer repair: excluded answered evidence must never let a later "none" win silently.
test('clock set back: pain then none is a conflict at any evaluation time', () => {
  const pain = ans({ value: 'present', capturedAt: 10_000 });
  const none = ans({ value: 'none', capturedAt: 9_600 });
  for (const now of [9_700, 10_100]) {
    const r: any = currentAnswer([pain, none], ctx, TEST_ONLY_POLICY, now).pain;
    assert.equal(r.state, 'conflict', `now=${now}`);
    assert.ok(r.evidence.includes(pain) && r.evidence.includes(none), `pain retained at now=${now}`);
  }
  assert.deepEqual(currentAnswer([pain, none], ctx, TEST_ONLY_POLICY, 9_700).pain,
    { questionId: 'pain', state: 'conflict', evidence: [pain, none], excluded: [{ answer: pain, reason: 'clock_skew' }] });
});

test('stale pain plus fresh none is a conflict retaining the pain', () => {
  const pain = ans({ value: 'present', capturedAt: NOW - TEST_ONLY_POLICY.freshnessMs - 1 });
  const none = ans({ value: 'none', capturedAt: NOW - 10 });
  assert.deepEqual(currentAnswer([pain, none], ctx, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'conflict', evidence: [pain, none], excluded: [{ answer: pain, reason: 'stale' }] });
});

test('revision-mismatch pain plus fresh none is a conflict retaining the pain', () => {
  const pain = ans({ value: 'present', rowId: 'r1', rowRevision: 1 });
  const none = ans({ value: 'none', rowId: 'r1', rowRevision: 2, capturedAt: NOW - 10 });
  assert.deepEqual(currentAnswer([pain, none], { ...ctx, rowId: 'r1', rowRevision: 2 }, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'conflict', evidence: [pain, none], excluded: [{ answer: pain, reason: 'revision_mismatch' }] });
});

test('excluded evidence is reported on every state, so unknown differs from "existed but excluded"', () => {
  const elsewhere = ans({ sessionId: 's0' });
  assert.deepEqual(currentAnswer([elsewhere], ctx, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'unknown', excluded: [{ answer: elsewhere, reason: 'other_session' }] });
  assert.deepEqual(currentAnswer([], ctx, TEST_ONLY_POLICY, NOW).pain, { questionId: 'pain', state: 'unknown' });
  const skip = ans({ state: 'skipped', value: undefined });
  assert.deepEqual(currentAnswer([elsewhere, skip], ctx, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'skipped', answer: skip, excluded: [{ answer: elsewhere, reason: 'other_session' }] });
  const stalePain = ans({ capturedAt: NOW - TEST_ONLY_POLICY.freshnessMs - 1 });
  const freshPain = ans();
  assert.deepEqual(currentAnswer([stalePain, freshPain], ctx, TEST_ONLY_POLICY, NOW).pain,
    { questionId: 'pain', state: 'answered', answer: freshPain, excluded: [{ answer: stalePain, reason: 'stale' }] });
});

test('validate rejects unknown state and provenance', () => {
  assert.deepEqual(validateAnswer(ans({ state: 'maybe' as any, value: undefined }), TEST_ONLY_POLICY), reject('invalid_state'));
  assert.deepEqual(validateAnswer(ans({ provenance: 'coach' as any }), TEST_ONLY_POLICY), reject('invalid_provenance'));
});

// --- Component (real TSX, offline) ---
const node = (type: any, props: any) => ({ type, props });
function loadComponent() {
  return sourceModule('components/workout/CoachingQuestions.tsx', {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' }, react: {},
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: (v: any) => v } },
    '@/components/ui/themed-text': { ThemedText: 'ThemedText' },
    '@/hooks/useThemeColor': { useThemeColor: () => 'themed' },
    '@/lib/coachingAnswers': { isMalformedScale, currentAnswer },
  }).CoachingQuestions;
}
const descendants = (t: any): any[] => (!t || typeof t !== 'object') ? [] : [t, ...[t.props?.children].flat(3).flatMap(descendants)];
const baseProps = () => {
  const answers: any[] = []; const skips: string[] = [];
  return { answers, skips, props: { policy: TEST_ONLY_POLICY, enabled: true, sessionId: 's1', exerciseKey: 'bench press', rowId: 'r1', rowRevision: 2, answers: [] as CoachingAnswer[],
    now: () => NOW, newAnswerId: () => 'id-1', onAnswer: (a: any) => answers.push(a), onSkip: (q: string) => skips.push(q) } };
};

test('component renders null when flag is off or policy is null', () => {
  const C = loadComponent();
  assert.equal(C({ ...baseProps().props, enabled: false }), null);
  assert.equal(C({ ...baseProps().props, policy: null }), null);
});

test('component emits valid answers and skips with accessible controls', () => {
  const C = loadComponent();
  const { props, answers, skips } = baseProps();
  const nodes = descendants(C(props));
  const buttons = nodes.filter(n => n.type === 'Pressable');
  assert.ok(buttons.every(b => b.props.accessibilityRole === 'button' && typeof b.props.accessibilityLabel === 'string'));
  assert.ok(!nodes.some(n => n.type === 'Modal'), 'inline, never blocking');
  buttons.find(b => b.props.accessibilityLabel === 'test pain prompt: present').props.onPress();
  assert.deepEqual(answers.map(a => ({ ...a })), [{ answerId: 'id-1', sessionId: 's1', exerciseKey: 'bench press', rowId: 'r1', rowRevision: 2,
    questionId: 'pain', state: 'answered', value: 'present', capturedAt: NOW, provenance: 'user' }]);
  assert.deepEqual(validateAnswer(answers[0], TEST_ONLY_POLICY), { ok: true });
  buttons.find(b => b.props.accessibilityLabel === 'test effort prompt: 8.5').props.onPress();
  assert.equal(answers[1].value, 8.5);
  const rowless = baseProps();
  descendants(C({ ...rowless.props, rowId: undefined, rowRevision: undefined }))
    .find(n => n.props?.accessibilityLabel === 'test pain prompt: none').props.onPress();
  assert.deepEqual(Object.keys(rowless.answers[0]).filter(k => k.startsWith('row')), [], 'no undefined row keys persisted');
  assert.equal(buttons.filter(b => /^test effort prompt: /.test(b.props.accessibilityLabel)).length, 9);
  buttons.find(b => b.props.accessibilityLabel === 'Skip test readiness prompt').props.onPress();
  assert.deepEqual(skips, ['readiness']);
});

test('a malformed scale (step <= 0 or non-finite bounds) is rejected, never thrown', () => {
  for (const bad of [{ step: 0 }, { step: -1 }, { max: Infinity }]) {
    const policy: QuestionnairePolicy = { ...TEST_ONLY_POLICY, questions: [{ id: 'effort', kind: 'scale', prompt: 'p', scope: 'exercise', min: 6, max: 10, step: 1, ...bad }] };
    assert.deepEqual(validateAnswer(ans({ questionId: 'effort', value: 6 }), policy), reject('invalid_policy'), JSON.stringify(bad));
    const C = loadComponent();
    const nodes = descendants(C({ ...baseProps().props, policy }));
    assert.deepEqual(nodes.filter(n => n.type === 'Pressable').map(n => n.props.accessibilityLabel), ['Skip p'], 'no options, Skip remains');
  }
});

test('component shows excluded answered evidence as a dated, labelled line for its question', () => {
  const C = loadComponent();
  const stalePain = ans({ value: 'present', capturedAt: NOW - TEST_ONLY_POLICY.freshnessMs - 1 });
  const { props } = baseProps();
  const lines = descendants(C({ ...props, rowId: undefined, rowRevision: undefined, answers: [stalePain] }))
    .filter(n => n.props?.accessibilityLabel?.startsWith?.('Excluded answer'));
  assert.equal(lines.length, 1, 'one line, under the pain question only');
  const text = [lines[0].props.children].flat().join('');
  assert.match(text, /present/);
  assert.match(text, /stale/);
  assert.ok(text.includes(new Date(stalePain.capturedAt).toLocaleString()), 'dated');
  assert.equal(C({ ...props, enabled: false, answers: [stalePain] }), null, 'flag-gated');
});

test('component marks the current answered value as selected for assistive tech', () => {
  const C = loadComponent();
  const { props } = baseProps();
  const answered = ans({ answerId: 'a1', questionId: 'pain', value: 'present', capturedAt: NOW - 1 });
  const chip = (nodes: any[], label: string) => nodes.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === label);
  const nodes = descendants(C({ ...props, answers: [answered] }));
  assert.equal(chip(nodes, 'test pain prompt: present').props.accessibilityState.selected, true);
  assert.equal(chip(nodes, 'test pain prompt: none').props.accessibilityState.selected, false);
  const fresh = descendants(C(props));
  assert.equal(chip(fresh, 'test pain prompt: present').props.accessibilityState.selected, false);
});
