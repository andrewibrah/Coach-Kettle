import assert from 'node:assert/strict';
import test from 'node:test';
import { agreesWithDecision, decideNextSet, NEXT_SET_POLICY } from '../nextSetDecision.ts';
import type { NextSetDecision, NextSetEvidence, NextSetPolicy } from '../nextSetDecision.ts';
import type { CoachingAnswer, CurrentAnswer } from '../../types/coachingAnswers.ts';
import { sourceModule } from './workoutIdentityHarness.ts';

// TEST ONLY. Not product policy: D07/D09 values, thresholds and increments are unapproved.
const TEST_ONLY_POLICY: NextSetPolicy = {
  version: 'test-only',
  questionIds: { pain: 'pain', effort: 'effort', readiness: 'readiness' },
  pain: { noPainValues: ['none'], stopValues: ['present'] },
  effortResponses: [{ values: ['max'], response: 'reduce' }, { values: ['hard'], response: 'hold' }],
  missedTargetResponse: 'hold',
  untargetedProgressionReps: 12,
  incrementLbs: { barbell: 5, dumbbell: 2.5 },
  decrementLbs: { barbell: 10 },
};

let seq = 0;
const answer = (questionId: string, value?: number | string, over: Partial<CoachingAnswer> = {}): CoachingAnswer => ({
  answerId: `${questionId}${++seq}`, sessionId: 's1', exerciseKey: 'bench press', questionId,
  state: value === undefined ? 'skipped' : 'answered', ...(value !== undefined && { value }),
  capturedAt: 1, provenance: 'user', ...over,
});
const answered = (q: string, value: number | string): CurrentAnswer => ({ questionId: q, state: 'answered', answer: answer(q, value) });
const skipped = (q: string): CurrentAnswer => ({ questionId: q, state: 'skipped', answer: answer(q) });
const unknown = (q: string): CurrentAnswer => ({ questionId: q, state: 'unknown' });
const conflict = (q: string, ...values: (number | string)[]): CurrentAnswer =>
  ({ questionId: q, state: 'conflict', evidence: values.map(v => answer(q, v)) });
const excluding = (current: CurrentAnswer, value: number | string, reason: 'stale' | 'other_exercise' | 'other_session'): CurrentAnswer =>
  ({ ...current, excluded: [{ answer: answer(current.questionId, value), reason }] });

const work = (id: string, weightLbs: number | null, reps: number, setKind: string | null = 'work') => ({ id, setKind, weightLbs, reps });
const evidence = (over: Partial<NextSetEvidence> = {}): NextSetEvidence => ({
  sessionId: 's1', revision: 3, request: { sessionId: 's1', revision: 3 }, exerciseKey: 'bench press',
  equipment: 'barbell', sessionSets: [work('r1', 185, 8)], baseline: null,
  answers: { pain: answered('pain', 'none') }, target: { reps: { low: 6, high: 8 } }, ...over,
});
const decide = (over: Partial<NextSetEvidence> = {}) => decideNextSet(evidence(over), TEST_ONLY_POLICY);
const shape = (d: NextSetDecision) => ({ code: d.code, reason: d.reason, action: d.action });

// Table: [name, evidence override, expected code/reason/action]
const CASES: [string, Partial<NextSetEvidence>, ReturnType<typeof shape>][] = [
  ['painful high-rep set stops, no increase',
    { sessionSets: [work('r1', 185, 15)], answers: { pain: answered('pain', 'present') } },
    { code: 'stop_or_clarify', reason: 'pain_stop', action: undefined }],
  ['unresolved pain with low effort still stops/clarifies',
    { answers: { pain: answered('pain', 'unsure'), effort: answered('effort', 'easy') } },
    { code: 'stop_or_clarify', reason: 'pain_clarify', action: undefined }],
  ['pain conflict stops/clarifies',
    { answers: { pain: conflict('pain', 'none', 'present') } },
    { code: 'stop_or_clarify', reason: 'pain_conflict', action: undefined }],
  ['excluded same-context pain disclosure is not outvoted by a later no-pain',
    { answers: { pain: excluding(answered('pain', 'none'), 'present', 'stale') } },
    { code: 'stop_or_clarify', reason: 'pain_excluded', action: undefined }],
  ['effort conflict clarifies',
    { answers: { pain: answered('pain', 'none'), effort: conflict('effort', 'easy', 'max') } },
    { code: 'clarify', reason: 'answer_conflict', action: undefined }],
  ['excluded effort for this exercise clarifies',
    { answers: { pain: answered('pain', 'none'), effort: excluding(answered('effort', 'easy'), 'easy', 'stale') } },
    { code: 'clarify', reason: 'excluded_evidence', action: undefined }],
  ['other-exercise exclusion is not this exercise\'s evidence',
    { answers: { pain: excluding(answered('pain', 'none'), 'present', 'other_exercise') } },
    { code: 'increase', reason: 'target_met', action: { loadLbs: 190, reps: { low: 6, high: 8 } } }],
  ['max effort gets the policy effort response (reduce)',
    { answers: { pain: answered('pain', 'none'), effort: answered('effort', 'max') } },
    { code: 'reduce', reason: 'effort_response', action: { loadLbs: 175, reps: { low: 6, high: 8 } } }],
  ['hard effort gets the policy effort response (hold)',
    { answers: { pain: answered('pain', 'none'), effort: answered('effort', 'hard') } },
    { code: 'hold', reason: 'effort_response', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['missed target gets the policy missed-target response',
    { sessionSets: [work('r1', 185, 4)] },
    { code: 'hold', reason: 'missed_target', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['prescribed backoff is not failure: reference stays the last work set',
    { sessionSets: [work('r1', 185, 7), work('r2', 155, 3, 'backoff')] },
    { code: 'hold', reason: 'below_progression', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['a superset set is this session\'s reference; a miss is not overridden by the baseline',
    { sessionSets: [work('r1', 185, 4, 'superset')], baseline: { workoutId: 'w1', date: null, exercise: 'Bench Press', sets: [
      { setNumber: 1, setKind: 'work', weightLbs: 185, reps: 8, e1rm: null }] } },
    { code: 'hold', reason: 'missed_target', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['skipped pain is not no-pain: target met still holds',
    { answers: { pain: skipped('pain') } },
    { code: 'hold', reason: 'pain_unanswered', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['unknown pain is not no-pain',
    { answers: { pain: unknown('pain') } },
    { code: 'hold', reason: 'pain_unanswered', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['missing pain record is not no-pain',
    { answers: {} },
    { code: 'hold', reason: 'pain_unanswered', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['no history',
    { sessionSets: [], baseline: null },
    { code: 'no_history', reason: 'no_history', action: undefined }],
  ['warmup-only session with no baseline is no history',
    { sessionSets: [work('r1', 95, 10, 'warmup')], baseline: null },
    { code: 'no_history', reason: 'no_history', action: undefined }],
  ['bodyweight (null load) never gets an invented load',
    { equipment: 'bodyweight', sessionSets: [work('r1', null, 15)], target: null },
    { code: 'hold', reason: 'no_load', action: undefined }],
  ['target met increases by the policy barbell increment',
    {},
    { code: 'increase', reason: 'target_met', action: { loadLbs: 190, reps: { low: 6, high: 8 } } }],
  ['dumbbell uses its own policy increment',
    { equipment: 'dumbbell', sessionSets: [work('r1', 50, 8)] },
    { code: 'increase', reason: 'target_met', action: { loadLbs: 52.5, reps: { low: 6, high: 8 } } }],
  ['equipment without a policy increment holds',
    { equipment: 'machine' },
    { code: 'hold', reason: 'no_increment_for_equipment', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['unknown equipment holds',
    { equipment: null },
    { code: 'hold', reason: 'no_increment_for_equipment', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['equipment without a policy decrement reduces with no invented load',
    { equipment: 'dumbbell', sessionSets: [work('r1', 50, 8)], answers: { pain: answered('pain', 'none'), effort: answered('effort', 'max') } },
    { code: 'reduce', reason: 'effort_response', action: { reps: { low: 6, high: 8 } } }],
  ['untargeted progression uses the policy rep threshold',
    { target: null, sessionSets: [work('r1', 185, 12)] },
    { code: 'increase', reason: 'reps_threshold_met', action: { loadLbs: 190 } }],
  ['untargeted below threshold holds',
    { target: null, sessionSets: [work('r1', 185, 11)] },
    { code: 'hold', reason: 'below_progression', action: { loadLbs: 185 } }],
  ['baseline is the fallback reference when the session has no work set',
    { sessionSets: [], baseline: { workoutId: 'w1', date: '2026-10-12', exercise: 'Bench Press', sets: [
      { setNumber: 1, setKind: 'work', weightLbs: 182.5, reps: 8, e1rm: null },
      { setNumber: 2, setKind: 'backoff', weightLbs: 160, reps: 5, e1rm: null }] } },
    { code: 'increase', reason: 'target_met', action: { loadLbs: 187.5, reps: { low: 6, high: 8 } } }],
  ['stale revision race',
    { request: { sessionId: 's1', revision: 2 } },
    { code: 'stale', reason: 'revision_mismatch', action: undefined }],
  ['other session request is stale',
    { request: { sessionId: 's0', revision: 3 } },
    { code: 'stale', reason: 'revision_mismatch', action: undefined }],
];

for (const [name, over, expected] of CASES) {
  test(`decideNextSet: ${name}`, () => assert.deepEqual(shape(decide(over)), expected));
}

test('null policy is inert for every case and the shipped slot is null', () => {
  assert.equal(NEXT_SET_POLICY, null);
  for (const [, over] of CASES) {
    const d = decideNextSet(evidence(over), null);
    assert.deepEqual({ code: d.code, reason: d.reason, action: d.action, policyVersion: d.policyVersion },
      { code: 'unavailable', reason: 'policy_unapproved', action: undefined, policyVersion: null });
    assert.ok(Array.isArray(d.evidenceIds));
  }
});

test('invariant: no increase or higher load is ever possible unless pain is explicitly cleared', () => {
  const painStates: Record<string, CurrentAnswer | undefined>[] = [
    { pain: answered('pain', 'present') }, { pain: answered('pain', 'unsure') },
    { pain: conflict('pain', 'none', 'present') }, { pain: skipped('pain') }, { pain: unknown('pain') }, {},
    { pain: excluding(answered('pain', 'none'), 'present', 'stale') },
    { pain: { ...answered('pain', 'present'), skippedLater: true } },
  ];
  let checked = 0;
  for (const [, over] of CASES) {
    for (const pain of painStates) {
      for (const effort of [undefined, answered('effort', 'easy'), answered('effort', 'max')]) {
        const answers = { ...pain, ...(effort && { effort }) } as Record<string, CurrentAnswer>;
        const ev = evidence({ ...over, answers, request: { sessionId: 's1', revision: 3 } });
        const d = decideNextSet(ev, TEST_ONLY_POLICY);
        // Never above the heaviest load already performed (session or baseline).
        const performed = [...ev.sessionSets, ...(ev.baseline?.sets ?? [])].map(s => s.weightLbs).filter((w): w is number => w !== null);
        assert.notEqual(d.code, 'increase');
        if (d.action?.loadLbs !== undefined) assert.ok(d.action.loadLbs <= Math.max(...performed));
        if (d.code === 'stop_or_clarify' || d.code === 'clarify') assert.equal(d.action, undefined);
        checked++;
      }
    }
  }
  assert.equal(checked, CASES.length * 8 * 3);
});

test('decisions are reproducible and cite ordered evidence ids and the policy version', () => {
  const ev = evidence({ sessionSets: [work('r1', 185, 8), work('r2', 185, 8)],
    baseline: { workoutId: 'w1', date: null, exercise: 'Bench Press', sets: [] },
    answers: { effort: answered('effort', 'easy'), pain: answered('pain', 'none') } });
  const a = decideNextSet(ev, TEST_ONLY_POLICY);
  assert.deepEqual(a, decideNextSet(structuredClone(ev), TEST_ONLY_POLICY));
  assert.deepEqual(a.evidenceIds, ['r1', 'r2', 'baseline:w1', ev.answers.pain.state === 'answered' ? ev.answers.pain.answer.answerId : '',
    ev.answers.effort.state === 'answered' ? ev.answers.effort.answer.answerId : '']);
  assert.equal(a.policyVersion, 'test-only');
});

// Item 2: equipment names are data, never prototype keys.
for (const equipment of ['toString', '__proto__', 'constructor', 'hasOwnProperty']) {
  test(`decideNextSet: prototype-key equipment "${equipment}" has no increment or decrement`, () => {
    assert.deepEqual(shape(decide({ equipment })),
      { code: 'hold', reason: 'no_increment_for_equipment', action: { loadLbs: 185, reps: { low: 6, high: 8 } } });
    assert.deepEqual(shape(decide({ equipment, answers: { pain: answered('pain', 'none'), effort: answered('effort', 'max') } })),
      { code: 'reduce', reason: 'effort_response', action: { reps: { low: 6, high: 8 } } });
  });
}

// Item 3: answers/baseline from another session or exercise are never applicable.
const foreign = (value: string, over: Partial<CoachingAnswer>): CurrentAnswer =>
  ({ questionId: 'pain', state: 'answered', answer: answer('pain', value, over) });
const CONTEXT: [string, Partial<NextSetEvidence>, ReturnType<typeof shape>][] = [
  ['no-pain from another session does not clear pain',
    { answers: { pain: foreign('none', { sessionId: 's0' }) } },
    { code: 'hold', reason: 'pain_unanswered', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['no-pain from another exercise does not clear pain',
    { answers: { pain: foreign('none', { exerciseKey: 'squat' }) } },
    { code: 'hold', reason: 'pain_unanswered', action: { loadLbs: 185, reps: { low: 6, high: 8 } } }],
  ['a foreign effort conflict is not this exercise\'s conflict',
    { answers: { pain: answered('pain', 'none'), effort: { questionId: 'effort', state: 'conflict',
      evidence: [answer('effort', 'easy', { exerciseKey: 'squat' }), answer('effort', 'max', { exerciseKey: 'squat' })] } } },
    { code: 'increase', reason: 'target_met', action: { loadLbs: 190, reps: { low: 6, high: 8 } } }],
  ['exercise keys compare canonically',
    { exerciseKey: '  Bench   Press ' },
    { code: 'increase', reason: 'target_met', action: { loadLbs: 190, reps: { low: 6, high: 8 } } }],
  ['a Squat baseline never drives a bench decision',
    { sessionSets: [], baseline: { workoutId: 'w9', date: null, exercise: 'Squat', sets: [
      { setNumber: 1, setKind: 'work', weightLbs: 315, reps: 8, e1rm: null }] } },
    { code: 'baseline_mismatch', reason: 'baseline_mismatch', action: undefined }],
];
for (const [name, over, expected] of CONTEXT) {
  test(`decideNextSet context: ${name}`, () => assert.deepEqual(shape(decide(over)), expected));
}
test('decideNextSet context: foreign answers stay cited as evidence', () => {
  const pain = foreign('none', { sessionId: 's0' });
  assert.ok(decide({ answers: { pain } }).evidenceIds.includes(pain.state === 'answered' ? pain.answer.answerId : '?'));
});
test('decideNextSet context: a foreign excluded entry is ignored, not clarified', () => {
  const pain: CurrentAnswer = { ...answered('pain', 'none'), excluded: [{ answer: answer('pain', 'present', { exerciseKey: 'squat' }), reason: 'stale' }] };
  assert.equal(decide({ answers: { pain } }).code, 'increase');
});

// Item 4: invalid sets are ignored as evidence; nothing valid left → no_history. Invalid target → invalid_evidence.
const INVALID_SETS: [string, number | null, number][] = [
  ['NaN load', NaN, 8], ['infinite load', Infinity, 8], ['negative load', -5, 8],
  ['fractional reps', 185, 8.5], ['zero reps', 185, 0], ['negative reps', 185, -1], ['NaN reps', 185, NaN],
];
for (const [name, weight, reps] of INVALID_SETS) {
  test(`decideNextSet invalid: ${name} alone is no history`, () =>
    assert.deepEqual(shape(decide({ sessionSets: [work('bad', weight, reps)] })), { code: 'no_history', reason: 'no_history', action: undefined }));
  test(`decideNextSet invalid: ${name} after a valid set is ignored`, () =>
    assert.deepEqual(shape(decide({ sessionSets: [work('r1', 185, 8), work('bad', weight, reps)] })),
      { code: 'increase', reason: 'target_met', action: { loadLbs: 190, reps: { low: 6, high: 8 } } }));
  test(`decideNextSet invalid: ${name} in the baseline is ignored`, () =>
    assert.deepEqual(shape(decide({ sessionSets: [], baseline: { workoutId: 'w1', date: null, exercise: 'Bench Press', sets: [
      { setNumber: 1, setKind: 'work', weightLbs: weight ?? NaN, reps, e1rm: null }] } })),
    { code: 'no_history', reason: 'no_history', action: undefined }));
}
for (const [name, low, high] of [['inverted', 8, 6], ['fractional', 6.5, 8], ['zero', 0, 8], ['NaN', NaN, 8]] as const) {
  test(`decideNextSet invalid: ${name} target range is invalid_evidence with no action`, () =>
    assert.deepEqual(shape(decide({ target: { reps: { low, high } } })), { code: 'invalid_evidence', reason: 'invalid_target', action: undefined }));
}

// Item 1: structured comparator. Model output is a structured field; prose is never parsed.
const increase: NextSetDecision = { code: 'increase', action: { loadLbs: 190, reps: { low: 6, high: 8 } }, reason: 'target_met', evidenceIds: [], policyVersion: 'test-only' };
const hold: NextSetDecision = { code: 'hold', action: { loadLbs: 185, reps: { low: 6, high: 8 } }, reason: 'below_progression', evidenceIds: [], policyVersion: 'test-only' };
const bodyweight: NextSetDecision = { code: 'hold', reason: 'no_load', evidenceIds: [], policyVersion: 'test-only' };
const stop: NextSetDecision = { code: 'stop_or_clarify', reason: 'pain_stop', evidenceIds: [], policyVersion: 'test-only' };
type Proposal = Parameters<typeof agreesWithDecision>[1];
const AGREEMENT: [string, NextSetDecision, Proposal, boolean][] = [
  ['exact match', increase, { code: 'increase', loadLbs: 190, reps: { low: 6, high: 8 } }, true],
  ['stop + "push through and add weight" (as increase)', stop, { code: 'increase' }, false],
  ['stop + any load', stop, { code: 'stop_or_clarify', loadLbs: 185 }, false],
  ['stop + any reps', stop, { code: 'stop_or_clarify', reps: { low: 6, high: 8 } }, false],
  ['stop + nothing else', stop, { code: 'stop_or_clarify' }, true],
  ['stop + explicit nulls', stop, { code: 'stop_or_clarify', loadLbs: null, reps: null }, true],
  ['hold + "add five pounds"', hold, { code: 'increase', loadLbs: 190, reps: { low: 6, high: 8 } }, false],
  ['hold + "add 8 lb, then do 6 reps"', hold, { code: 'hold', loadLbs: 193, reps: { low: 6, high: 6 } }, false],
  ['hold + right code, missing load', hold, { code: 'hold', reps: { low: 6, high: 8 } }, false],
  ['hold + right load, missing reps', hold, { code: 'hold', loadLbs: 185 }, false],
  ['hold + swapped rep bounds', hold, { code: 'hold', loadLbs: 185, reps: { low: 8, high: 6 } }, false],
  ['bodyweight hold + no numbers', bodyweight, { code: 'hold' }, true],
  ['bodyweight hold + invented load', bodyweight, { code: 'hold', loadLbs: 0 }, false],
  ['no-action decision + non-object reps', stop, { code: 'stop_or_clarify', reps: 5 } as any, false],
  ['no-action decision + empty reps object', stop, { code: 'stop_or_clarify', reps: {} } as any, false],
  ['bodyweight hold + empty reps object', bodyweight, { code: 'hold', reps: {} } as any, false],
];
for (const [name, decision, proposal, expected] of AGREEMENT) {
  test(`agreesWithDecision: ${name}`, () => assert.equal(agreesWithDecision(decision, proposal), expected));
}

test('pain safety outranks a baseline mismatch (priority order is pinned)', () => {
  const d = decide({ sessionSets: [], answers: { pain: answered('pain', 'present') }, baseline: { workoutId: 'w9', date: null, exercise: 'Squat', sets: [
    { setNumber: 1, setKind: 'work', weightLbs: 315, reps: 8, e1rm: null }] } });
  assert.deepEqual(shape(d), { code: 'stop_or_clarify', reason: 'pain_stop', action: undefined });
});

// ---- Client wiring (A2 lane B). Everything here is behind COACHING_POLICY.adaptiveNextSet. ----
const engine = await import('../nextSetDecision.ts');
const json200 = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });
const programming = (fetchWithAuth: (url: string, init: any) => Promise<Response>) =>
  sourceModule('lib/programming.ts', { './supabase': { supabaseUrl: 'https://offline.invalid' }, './auth': { fetchWithAuth } });
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const holdDecision = { code: 'hold', action: { loadLbs: 185, reps: { low: 6, high: 8 } }, reason: 'below_progression', evidenceIds: ['r1'], policyVersion: 'test-only' };

test('client: a response with a decision maps to status decision; existing statuses are unchanged', async () => {
  const baseline = { workoutId: 'w1', date: null, exercise: 'Bench', sets: [] };
  assert.deepEqual(plain(await programming(json200({ suggestion: null, reason: 'policy_unapproved', baseline, decision: holdDecision })).fetchNextSetSuggestion('Bench')),
    { status: 'decision', decision: holdDecision, baseline });
  assert.deepEqual(plain(await programming(json200({ suggestion: null, reason: 'policy_unapproved', baseline })).fetchNextSetSuggestion('Bench')),
    { status: 'unavailable', reason: 'policy_unapproved', baseline });
  assert.deepEqual(plain(await programming(json200({ suggestion: null, reason: 'policy_unapproved', baseline: null })).fetchNextSetSuggestion('Bench')), { status: 'no_history' });
});
test('client: fetchNextSetDecision POSTs exercise, session and evidence and maps the decision', async () => {
  const calls: any[] = [];
  const input = { sessionId: 's1', revision: 3, request: { sessionId: 's1', revision: 3 }, exerciseKey: 'bench press', equipment: null,
    sessionSets: [], answers: {}, target: null };
  const r = await programming(async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ baseline: null, decision: holdDecision })); })
    .fetchNextSetDecision('Bench Press', input);
  assert.deepEqual(plain(r), { status: 'decision', decision: holdDecision, baseline: null });
  assert.equal(calls[0].url, 'https://offline.invalid/functions/v1/next-set');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { exercise: 'Bench Press', sessionId: 's1', evidence: input });
  const failed = await programming(async () => { throw new TypeError('offline'); }).fetchNextSetDecision('Bench Press', input);
  assert.deepEqual(plain(failed), { status: 'unavailable', reason: 'error', baseline: null });
});

// Review: the model's structured `nextSet` is kept only when it agrees exactly; never retried or fabricated.
function reviewApi(modelJson: unknown) {
  const sent: string[] = [];
  const api = sourceModule('lib/api.ts', {
    './performedSets': { isPerformedRow: () => true }, './nextSetDecision': engine,
    './supabase': { supabaseUrl: 'https://offline.invalid' },
    './auth': { fetchWithAuth: async (_url: string, init: any) => { sent.push(JSON.parse(init.body).question); return { ok: true, text: async () => JSON.stringify(modelJson) }; } },
    './profile': { fetchProfile: async () => null }, './entitlements': { parseFeatureGateError: () => null },
    './nutrition': {}, './coaching': {}, './programming': {}, './bodyMetrics': {}, './exerciseLibrary': {},
  }).api;
  return { sent, review: (policy: any, decision?: unknown) => api.generateSessionReview(reviewRows, 'Push', policy, decision) };
}
const reviewRows = [{ exercise: 'Bench', set: 1, weightLbs: '185', reps: '8', notes: '' }];
const review = { rating: 6, strengths: ['Hit 185 x 8'], weakness: 'Set 3 slowed', nextSessionNote: 'Keep bar path' };
const OFF = { reviewSetPolicy: false, suppressReviewLoadAdvice: false, adaptiveNextSet: false };
const ON = { ...OFF, adaptiveNextSet: true };
const proposal = { code: 'hold', loadLbs: 185, reps: { low: 6, high: 8 } };

test('review: adaptive off (or no decision) keeps the prompt and the result byte-identical, even if the model sends nextSet', async () => {
  const legacy = reviewApi({ ...review, nextSet: proposal });
  const base = plain(await legacy.review(OFF));
  for (const [policy, decision] of [[OFF, holdDecision], [ON, undefined], [undefined, holdDecision]] as const) {
    assert.deepEqual(plain(await legacy.review(policy, decision)), base);
  }
  assert.deepEqual(base, review);
  assert.equal(new Set(legacy.sent).size, 1);
  assert.equal(legacy.sent[0].includes('nextSet'), false);
  assert.ok(legacy.sent[0].includes('try 190x8'), 'flag off keeps the legacy example');
});
test('review: adaptive on asks for a structured nextSet copy of the decision', async () => {
  const r = reviewApi({ ...review, nextSet: proposal });
  await r.review(ON, holdDecision);
  assert.ok(r.sent[0].includes(JSON.stringify(holdDecision)));
  // nextSet is part of the exact JSON shape, so an obedient model does not drop it.
  assert.match(r.sent[0], /respond with exactly this structure:\n\{[^\n]*"nextSessionNote": <string>,"nextSet": \{"code": [^\n]*\}\}/);
  // The legacy overload note (with its "try 190x8" example) is replaced, so the prompt cannot contradict the decision.
  assert.equal(r.sent[0].includes('190x8'), false);
  assert.equal(r.sent[0].includes('progressive overload'), false);
  assert.match(r.sent[0], /Give no load or rep number other than the NEXT_SET decision's action, and none at all if it has no action/);
});
test('review: an agreeing structured nextSet is kept, normalized from the decision', async () => {
  const r = reviewApi({ ...review, nextSet: { ...proposal, note: 'go heavy' } });
  assert.deepEqual(plain(await r.review(ON, holdDecision)), { ...review, nextSet: proposal });
  const stop = { code: 'stop_or_clarify', reason: 'pain_stop', evidenceIds: [], policyVersion: 'test-only' };
  assert.deepEqual(plain(await reviewApi({ ...review, nextSet: { code: 'stop_or_clarify', loadLbs: null, reps: null } }).review(ON, stop)),
    { ...review, nextSet: { code: 'stop_or_clarify' } });
});
for (const [name, nextSet] of [
  ['higher load', { ...proposal, loadLbs: 190 }], ['different code', { ...proposal, code: 'increase' }], ['missing', undefined],
  ['prose instead of a field', 'Add 5 lb next time'], ['string reps', { ...proposal, reps: '6-8' }], ['null', null],
] as [string, unknown][]) {
  test(`review: a disagreeing nextSet (${name}) is dropped without retry; the review survives`, async () => {
    const r = reviewApi({ ...review, nextSet });
    assert.deepEqual(plain(await r.review(ON, holdDecision)), review);
    assert.equal(r.sent.length, 1);
  });
}

// Every engine reason maps to the codes it can appear with, and round-trips through the Edge reader.
test('every engine reason is in the exported table and round-trips through readNextSetDecision', async () => {
  const { readNextSetDecision } = await import('../../supabase/functions/_shared/nextSetDecision.ts');
  const { NEXT_SET_REASONS } = engine;
  const decisions = [...CASES, ...CONTEXT].map(([, over]) => decide(over));
  decisions.push(decide({ target: { reps: { low: 8, high: 6 } } }), decideNextSet(evidence(), null));
  assert.deepEqual([...new Set(decisions.map(d => d.reason))].sort(), Object.keys(NEXT_SET_REASONS).sort());
  for (const d of decisions) {
    assert.ok(NEXT_SET_REASONS[d.reason].includes(d.code), `${d.reason} with ${d.code}`);
    assert.deepEqual(readNextSetDecision(plain(d), d.policyVersion), d);
  }
});
