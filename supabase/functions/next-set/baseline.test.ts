import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as lift from '../_shared/liftMatching.ts';
import * as validation from '../_shared/workoutValidation.ts';
import * as policyModule from '../_shared/coachingPolicy.ts';
import * as nextSetDecision from '../_shared/nextSetDecision.ts';
import { sourceModule } from '../../../lib/__tests__/workoutIdentityHarness.ts';

// Loaded per test so a missing module fails each assertion separately.
let loaded: any;
const shaping: any = new Proxy({}, { get: (_, k) => (loaded ??= sourceModule('supabase/functions/next-set/baseline.ts'))[k] });
const row = (over: any = {}) => ({ workout_id: 'w1', workout_date: '2026-10-12', set_number: 1, set_kind: 'work', weight_lbs: 182.5, reps: 8, e1rm: 231.2, ...over });

test('shapeBaseline maps one completed workout to the camelCase contract', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(shaping.shapeBaseline([row(), row({ set_number: 2, set_kind: 'backoff', weight_lbs: '160', reps: 10, e1rm: '213.3' })], 'Bench Press'))), {
    workoutId: 'w1', date: '2026-10-12', exercise: 'Bench Press',
    sets: [
      { setNumber: 1, setKind: 'work', weightLbs: 182.5, reps: 8, e1rm: 231.2 },
      { setNumber: 2, setKind: 'backoff', weightLbs: 160, reps: 10, e1rm: 213.3 },
    ],
  });
});
test('shapeBaseline returns null only for an empty result', () => {
  assert.equal(shaping.shapeBaseline([], 'Bench Press'), null);
});
test('shapeBaseline rejects malformed payloads instead of claiming no history', () => {
  assert.throws(() => shaping.shapeBaseline({ ok: true }, 'Bench Press'));
  assert.throws(() => shaping.shapeBaseline(null, 'Bench Press'));
  assert.throws(() => shaping.shapeBaseline([row(), row({ workout_id: 'w2' })], 'Bench Press'), /merge/);
  assert.throws(() => shaping.shapeBaseline([row({ weight_lbs: 'NaN' })], 'Bench Press'));
  assert.throws(() => shaping.shapeBaseline([row({ reps: 0 })], 'Bench Press'));
});

const ENV: Record<string, string> = { SUPABASE_URL: 'https://offline.invalid', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
async function nextSet(request: { method?: string; query?: string; body?: any }, opts: { tracked?: string[]; trackedError?: any; rpc?: { data: any; error: any }; authorized?: boolean; policy?: Record<string, unknown>; nextSetPolicy?: unknown } = {}) {
  const clients: any[] = []; const rpcCalls: any[] = []; const tableReads: string[] = [];
  const createClient = (url: string, key: string, options: any) => {
    clients.push({ url, key, authorization: options?.global?.headers?.Authorization });
    const query: any = new Proxy({}, { get: (_, method) => {
      if (method === 'then') return (resolve: any) => resolve(opts.trackedError ? { data: null, error: opts.trackedError } : { data: (opts.tracked ?? []).map((lift_name) => ({ lift_name })), error: null });
      return () => query;
    } });
    return {
      auth: { getUser: async () => ({ data: { user: opts.authorized === false ? null : { id: 'user-a' } }, error: null }) },
      from: (table: string) => { tableReads.push(table); return query; },
      rpc: async (name: string, args: any) => { rpcCalls.push(JSON.parse(JSON.stringify({ name, args }))); /* cross-realm -> plain */ return opts.rpc ?? { data: [], error: null }; },
    };
  };
  let handler: any;
  const dependencies: any = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: any) => handler = fn },
    'https://esm.sh/@supabase/supabase-js@2.50.1': { createClient },
    '../_shared/liftMatching.ts': lift,
    './baseline.ts': shaping,
    '../_shared/coachingPolicy.ts': { ...policyModule, ...(opts.policy && { COACHING_POLICY: opts.policy }) },
    '../_shared/nextSetDecision.ts': { ...nextSetDecision, ...(opts.nextSetPolicy !== undefined && { NEXT_SET_POLICY: opts.nextSetPolicy }) },
    './evidence.ts': sourceModule('supabase/functions/next-set/evidence.ts', { '../_shared/workoutValidation.ts': validation, '../_shared/nextSetDecision.ts': nextSetDecision }),
  };
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: {}, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
    Deno: { env: { get: (k: string) => ENV[k] } }, Response, URL, console: { log: () => {}, warn: () => {}, error: () => {} },
  });
  const method = request.method ?? 'POST';
  const response = await handler(new Request(`https://offline.invalid/next-set${request.query ?? ''}`, {
    method, headers: { Authorization: 'Bearer user-jwt', 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(request.body ?? {}) : undefined,
  }));
  const text = await response.text();
  return { status: response.status, text, body: JSON.parse(text), clients, rpcCalls, tableReads };
}

test('next-set resolves typed alias to the tracked canonical lift and queries all its variants with the caller JWT', async () => {
  const r = await nextSet({ body: { exercise: ' bench ', sessionId: 'live-1' } }, { tracked: ['Bench Press', 'Squat'], rpc: { data: [row()], error: null } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.rpcCalls, [{ name: 'exercise_history_baseline', args: { p_names: lift.liftNameVariants('Bench Press'), p_exclude_session: 'live-1' } }]);
  assert.equal(r.body.suggestion, null);
  assert.equal(r.body.reason, 'policy_unapproved');
  assert.equal(r.body.baseline.exercise, 'Bench Press');
  assert.equal(r.body.baseline.workoutId, 'w1');
  assert.deepEqual(r.tableReads, ['pr_tracked_lifts']);
  assert.ok(r.clients.length > 0);
  for (const c of r.clients) { assert.equal(c.key, 'anon-key'); assert.equal(c.authorization, 'Bearer user-jwt'); }
});
test('next-set GET accepts the session query and falls back to the typed name without inventing aliases', async () => {
  const r = await nextSet({ method: 'GET', query: '?exercise=Cable%20Fly&session=s-9' }, { tracked: ['Bench Press'] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.rpcCalls[0].args, { p_names: ['cable fly'], p_exclude_session: 's-9' });
  assert.equal(r.body.baseline, null);
  assert.equal(r.body.reason, 'policy_unapproved');
});
test('next-set without a session passes a null exclusion', async () => {
  const r = await nextSet({ body: { exercise: 'Squat' } });
  assert.equal(r.rpcCalls[0].args.p_exclude_session, null);
});
test('next-set RPC failure returns a sanitized 500, never a fake empty baseline', async () => {
  const r = await nextSet({ body: { exercise: 'Squat' } }, { rpc: { data: null, error: { message: 'relation "secret_table" does not exist' } } });
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /secret_table/);
  assert.equal(r.body.baseline, undefined);
});
test('next-set malformed RPC payload returns 500', async () => {
  const r = await nextSet({ body: { exercise: 'Squat' } }, { rpc: { data: { ok: true }, error: null } });
  assert.equal(r.status, 500);
});
test('next-set tracked-lift read failure returns a sanitized 500 before the RPC', async () => {
  const r = await nextSet({ body: { exercise: 'Squat' } }, { trackedError: { message: 'permission denied for pr_tracked_lifts' } });
  assert.equal(r.status, 500);
  assert.doesNotMatch(JSON.stringify(r.body), /permission denied/);
  assert.equal(r.rpcCalls.length, 0);
});
test('next-set keeps auth and validation barriers before any read', async () => {
  const unauth = await nextSet({ body: { exercise: 'Squat' } }, { authorized: false });
  assert.equal(unauth.status, 401); assert.equal(unauth.rpcCalls.length, 0); assert.deepEqual(unauth.tableReads, []);
  const blank = await nextSet({ body: { exercise: '  ' } });
  assert.equal(blank.status, 400); assert.equal(blank.rpcCalls.length, 0); assert.deepEqual(blank.tableReads, []);
});

// ---- A2 wiring: adaptive next-set decision behind COACHING_POLICY.adaptiveNextSet ----
// TEST ONLY. Not product policy: D07/D09 values are unapproved.
const TEST_ONLY_POLICY = {
  version: 'test-only', questionIds: { pain: 'pain', effort: 'effort', readiness: 'readiness' },
  pain: { noPainValues: ['none'], stopValues: ['present'] }, effortResponses: [], missedTargetResponse: 'hold',
  untargetedProgressionReps: null, incrementLbs: { barbell: 5 }, decrementLbs: {},
};
const FLAG_ON = { ...policyModule.COACHING_POLICY, adaptiveNextSet: true };
const painAnswer = (value: string, exerciseKey = 'bench') => ({ questionId: 'pain', state: 'answered', answer: {
  answerId: 'a1', sessionId: 'live-1', exerciseKey, questionId: 'pain', state: 'answered', value, capturedAt: 1, provenance: 'user' } });
const evidence = (over: any = {}) => ({
  sessionId: 'live-1', revision: 2, request: { sessionId: 'live-1', revision: 2 }, exerciseKey: 'bench', equipment: 'barbell',
  sessionSets: [{ id: 'r1', setKind: 'work', weightLbs: 182.5, reps: 8 }], answers: { pain: painAnswer('none') },
  target: { reps: { low: 6, high: 8 } }, ...over,
});
const HEAD_TEXT = JSON.stringify({ suggestion: null, reason: 'policy_unapproved', baseline: {
  workoutId: 'w1', date: '2026-10-12', exercise: 'Bench Press', sets: [{ setNumber: 1, setKind: 'work', weightLbs: 182.5, reps: 8, e1rm: 231.2 }] } });
const rpcRow = { rpc: { data: [row()], error: null }, tracked: ['Bench Press'] };

test('flag off: evidence (valid or malformed) is never read and the response is byte-identical to HEAD', async () => {
  for (const extra of [{}, { evidence: evidence() }, { evidence: 'junk' }, { evidence: { sessionId: 'other' } }]) {
    const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', ...extra } }, rpcRow);
    assert.equal(r.status, 200);
    assert.equal(r.text, HEAD_TEXT);
  }
});
test('flag on without evidence (and GET) keeps the HEAD response', async () => {
  assert.equal((await nextSet({ body: { exercise: 'bench', sessionId: 'live-1' } }, { ...rpcRow, policy: FLAG_ON })).text, HEAD_TEXT);
  assert.equal((await nextSet({ method: 'GET', query: '?exercise=bench&session=live-1' }, { ...rpcRow, policy: FLAG_ON })).text, HEAD_TEXT);
});
test('flag on with the shipped null policy returns an inert unavailable decision alongside the HEAD fields, with no quota RPC', async () => {
  const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', evidence: evidence() } }, { ...rpcRow, policy: FLAG_ON });
  assert.equal(r.status, 200);
  const { decision, ...rest } = r.body;
  assert.equal(JSON.stringify(rest), HEAD_TEXT);
  assert.deepEqual(decision, { code: 'unavailable', reason: 'policy_unapproved', evidenceIds: ['r1', 'baseline:w1'], policyVersion: null });
  assert.deepEqual(r.rpcCalls.map((c: any) => c.name), ['exercise_history_baseline']);
});
test('flag on: pain keyed by the client exercise key stops even when the typed name resolves to an alias', async () => {
  const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', evidence: evidence({ answers: { pain: painAnswer('present') } }) } },
    { ...rpcRow, policy: FLAG_ON, nextSetPolicy: TEST_ONLY_POLICY });
  assert.equal(r.body.decision.code, 'stop_or_clarify');
  assert.equal(r.body.decision.action, undefined);
});
test('flag on: an alias resolving to the same tracked lift is compared under the canonical key, answers included', async () => {
  const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', evidence: evidence() } }, { ...rpcRow, policy: FLAG_ON, nextSetPolicy: TEST_ONLY_POLICY });
  assert.deepEqual(r.body.decision, { code: 'increase', action: { loadLbs: 187.5, reps: { low: 6, high: 8 } }, reason: 'target_met',
    evidenceIds: ['r1', 'baseline:w1', 'a1'], policyVersion: 'test-only' });
});
test('flag on: a pain answer recorded for another lift stays foreign after canonicalization', async () => {
  const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', evidence: evidence({ answers: { pain: painAnswer('present', 'squat') } }) } },
    { ...rpcRow, tracked: ['Bench Press', 'Squat'], policy: FLAG_ON, nextSetPolicy: TEST_ONLY_POLICY });
  assert.deepEqual([r.body.decision.code, r.body.decision.reason], ['hold', 'pain_unanswered']);
});
test('flag on: evidence for a different lift than the requested exercise is rejected 400 before the baseline RPC', async () => {
  const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', evidence: evidence({ exerciseKey: 'squat' }) } },
    { ...rpcRow, tracked: ['Bench Press', 'Squat'], policy: FLAG_ON, nextSetPolicy: TEST_ONLY_POLICY });
  assert.equal(r.status, 400);
  assert.deepEqual(r.rpcCalls, []);
});
test('flag on: a client-supplied baseline is ignored; the server H1 baseline wins', async () => {
  const fake = { workoutId: 'fake', date: null, exercise: 'Bench Press', sets: [{ setNumber: 1, setKind: 'work', weightLbs: 900, reps: 8, e1rm: null }] };
  const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', evidence: { ...evidence({ sessionSets: [] }), baseline: fake } } },
    { ...rpcRow, policy: FLAG_ON, nextSetPolicy: TEST_ONLY_POLICY });
  assert.equal(r.body.decision.action.loadLbs, 187.5);
  assert.deepEqual(r.body.decision.evidenceIds, ['baseline:w1', 'a1']);
});
test('readNextSetEvidence whitelists keys: unknown fields never pass through', () => {
  const read = sourceModule('supabase/functions/next-set/evidence.ts', { '../_shared/workoutValidation.ts': validation, '../_shared/nextSetDecision.ts': nextSetDecision }).readNextSetEvidence;
  const input = { ...evidence(), baseline: { workoutId: 'fake' }, note: 'x', request: { sessionId: 'live-1', revision: 2, extra: 1 },
    sessionSets: [{ id: 'r1', setKind: 'work', weightLbs: 182.5, reps: 8, notes: 'x' }], target: { reps: { low: 6, high: 8, x: 1 }, load: 9 } };
  assert.deepEqual(JSON.parse(JSON.stringify(read(input, 'live-1'))), JSON.parse(JSON.stringify(evidence())));
});
test('flag on: a matching exercise key gets the engine decision from session sets plus the fetched baseline', async () => {
  const r = await nextSet({ body: { exercise: 'Bench Press', sessionId: 'live-1', evidence: evidence({ exerciseKey: 'bench press',
    answers: { pain: painAnswer('none', 'bench press') } }) } }, { ...rpcRow, policy: FLAG_ON, nextSetPolicy: TEST_ONLY_POLICY });
  assert.deepEqual(r.body.decision, { code: 'increase', action: { loadLbs: 187.5, reps: { low: 6, high: 8 } }, reason: 'target_met',
    evidenceIds: ['r1', 'baseline:w1', 'a1'], policyVersion: 'test-only' });
});
const answered = painAnswer('none');
for (const [name, bad] of [
  ['non-object evidence', 'junk'], ['array evidence', []],
  ['session differs from the excluded baseline session', evidence({ sessionId: 'other', request: { sessionId: 'other', revision: 2 } })],
  ['missing request', evidence({ request: undefined })], ['fractional revision', evidence({ revision: 1.5 })],
  ['blank exercise key', evidence({ exerciseKey: ' ' })], ['non-string equipment', evidence({ equipment: 5 })],
  ['string load', evidence({ sessionSets: [{ id: 'r1', weightLbs: '185', reps: 8 }] })],
  ['negative load', evidence({ sessionSets: [{ id: 'r1', weightLbs: -5, reps: 8 }] })],
  ['fractional reps', evidence({ sessionSets: [{ id: 'r1', weightLbs: 185, reps: 8.5 }] })],
  ['unknown set kind', evidence({ sessionSets: [{ id: 'r1', setKind: 'rest', weightLbs: 185, reps: 8 }] })],
  ['oversized set id', evidence({ sessionSets: [{ id: 'x'.repeat(201), weightLbs: 185, reps: 8 }] })],
  ['whitespace-only set id', evidence({ sessionSets: [{ id: '   ', weightLbs: 185, reps: 8 }] })],
  ['too many sets', evidence({ sessionSets: Array.from({ length: 101 }, (_, i) => ({ id: `r${i}`, weightLbs: 185, reps: 8 })) })],
  ['non-array sets', evidence({ sessionSets: {} })],
  ['answers keyed by another question', evidence({ answers: { effort: answered } })],
  ['answer with a model provenance', evidence({ answers: { pain: { ...answered, answer: { ...answered.answer, provenance: 'model' } } } })],
  ['answered state without a value', evidence({ answers: { pain: { ...answered, answer: { ...answered.answer, value: undefined } } } })],
  ['skipped answer with a value', evidence({ answers: { pain: { questionId: 'pain', state: 'skipped', answer: { ...answered.answer, state: 'skipped' } } } })],
  ['unknown state', evidence({ answers: { pain: { questionId: 'pain', state: 'maybe' } } })],
  ['empty conflict', evidence({ answers: { pain: { questionId: 'pain', state: 'conflict', evidence: [] } } })],
  ['malformed exclusion', evidence({ answers: { pain: { ...answered, excluded: [{ reason: 'stale' }] } } })],
  ['non-numeric target', evidence({ target: { reps: { low: '6', high: 8 } } })],
] as [string, unknown][]) {
  test(`flag on: ${name} is rejected 400 before any read`, async () => {
    const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', evidence: bad } }, { ...rpcRow, policy: FLAG_ON });
    assert.equal(r.status, 400);
    assert.deepEqual(r.tableReads, []); assert.deepEqual(r.rpcCalls, []);
  });
}
test('flag on: valid skipped, unknown, conflict and excluded answers are accepted', async () => {
  const skipped = { questionId: 'pain', state: 'skipped', answer: { ...answered.answer, state: 'skipped', value: undefined } };
  const conflict = { questionId: 'pain', state: 'conflict', evidence: [answered.answer, { ...answered.answer, answerId: 'a2', value: 'present' }] };
  for (const pain of [skipped, { questionId: 'pain', state: 'unknown' }, conflict, { ...answered, excluded: [{ answer: answered.answer, reason: 'stale' }] }]) {
    const r = await nextSet({ body: { exercise: 'bench', sessionId: 'live-1', evidence: evidence({ answers: { pain }, equipment: null, target: null,
      sessionSets: [{ id: 'r1', setKind: null, weightLbs: null, reps: 0 }] }) } }, { ...rpcRow, policy: FLAG_ON });
    assert.equal(r.status, 200, JSON.stringify(pain));
  }
});
