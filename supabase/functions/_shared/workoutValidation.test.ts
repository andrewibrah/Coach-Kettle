import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as contract from './workoutValidation.ts';
import { sourceModule } from '../../../lib/__tests__/workoutIdentityHarness.ts';
const lift = sourceModule('supabase/functions/_shared/liftMatching.ts', { './workoutValidation.ts': contract });
const valid = { exercise: 'Bench', set: 1, weightLbs: '100', reps: '8', notes: '' };
test('epley rejects invalid or zero-rep performance rather than manufacturing a PR value', () => {
  for (const [weight, reps] of [[100, 0], [100, 8.5], [NaN, 8], [Infinity, 8], [-1, 8], [Number.MAX_VALUE, 8]]) {
    assert.equal(lift.epley1rm(weight, reps), null);
  }
  assert.equal(lift.epley1rm(100, 8), 126.7);
  assert.equal(lift.epley1rm(0, 12), 0);
});
test('actual chat rejects malformed HTTP context before provider IO', async () => {
  const result = await edge('chat', { message: 'Bench and squat', rows: [{ ...valid, reps: '8oops' }] }, { rows: [valid] });
  assert.equal(result.status, 400);
  assert.equal(result.providerCalls, 0);
});
test('explicit numeric zero values remain valid HTTP evidence', async () => {
  const result = await edge('log-set', { ...valid, weightLbs: 0, reps: 0 });
  assert.equal(result.status, 200); assert.equal(result.body.pr, null);
});
test('warmup classification reaches actual insert without PR', async () => {
  const result = await edge('log-set', { ...valid, setKind: 'warmup' });
  assert.equal(result.status, 200); assert.equal(result.body.pr, null);
  assert.equal(forwardedRow(result).setKind, 'warmup');
});
test('actual valid strength PR response agrees with SQL fixture126.7', async () => {
  const result = await edge('log-set', valid);
  assert.equal(result.status, 200); assert.equal(result.body.pr.newE1rm, 126.7);
});
for (const set of [0, '0', '00', 1, '01', undefined]) {
  test(`actual log-set set-number ${JSON.stringify(set)} agrees with normalized SQL eligibility`, async () => {
    const payload = { ...valid, set };
    const eligible = set === undefined || Number(set) > 0;
    assert.equal(contract.validateWorkoutRow(payload, true), null);
    const result = await edge('log-set', payload);
    assert.equal(result.status, 200);
    assert.equal(result.body.pr?.newE1rm ?? null, eligible ? 126.7 : null);
    assert.equal(contract.isStrengthEvidence(payload), eligible);
    assert.equal(Number(forwardedRow(result).set), set === undefined ? 1 : Number(set));
  });
}
for (const set of ['0oops', '00junk', '1oops', '1e2', '0.0', -1, null, '']) {
  test(`actual log-set rejects whole set-number token ${JSON.stringify(set)} before writes`, async () => {
    const payload = { ...valid, set };
    assert.ok(contract.validateWorkoutRow(payload, true));
    assert.equal(contract.isStrengthEvidence(payload), false);
    const result = await edge('log-set', payload);
    assert.equal(result.status, 400); assert.equal(result.writes.length, 0);
  });
}
test('safe reps outside legacy int32 PR storage remain raw but have no PR response', async () => {
  const result = await edge('log-set', { ...valid, reps: '9007199254740991' });
  assert.equal(result.status, 200); assert.equal(result.body.pr, null);
  assert.equal(forwardedRow(result).reps, '9007199254740991');
});
test('actual next-set disables unapproved adaptive RPC without inventing external load', async () => {
  const result = await edge('next-set', { exercise: 'Pushups' });
  assert.equal(result.status, 200); assert.equal(result.body.suggestion, null);
  assert.equal(result.body.reason, 'policy_unapproved');
  assert.equal(result.writes.length, 0);
});
test('actual chat converts finite JSON load into canonical decimal pounds', async () => {
  const result = await edge('chat', { message: 'Bench and squat' }, { rows: [{ ...valid, weightLbs: 1e22 }] });
  assert.equal(result.status, 200);
  assert.equal(result.body.rows[0].weightLbs, '10000000000000000000000');
});
const cardioModel = { exercise: 'Run', id: 'model-stable', set: 0, weightLbs: '', reps: '', notes: 'literal', isCardio: true, isRest: false, durationMins: 5.5, distance: 0, distanceUnit: 'miles', heartRate: 120.5, calories: 0, level: 0, performance: 'planned', setKind: 'cardio', plannedTarget: { reps: '8', weightLbs: '0' }, status: 'committed', timestamp: 0, pendingInput: 'raw' };
test('actual chat mapper preserves all validated metadata including zero false and stable identity through Home', async () => {
  const result = await edge('chat', { message: 'Run and bike' }, { rows: [cardioModel] });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.rows[0], cardioModel);
  const { runWorkoutRoute } = await import('../../../lib/__tests__/inSessionHarness.ts');
  const home = await runWorkoutRoute('Run and bike 5 8', [], result.body);
  assert.equal(home.rows[0].isCardio, true); assert.equal(home.rows[0].performance, 'planned');
  assert.equal(home.rows[0].distance, 0); assert.equal(home.rows[0].calories, 0);
  assert.equal(home.calls.some(c => ['logSet', 'rest', 'pr'].includes(c.method)), false);
});
test('actual chat mapper preserves warmup and does not fabricate missing optional metadata', async () => {
  const result = await edge('chat', { message: 'Bench and squat' }, { rows: [{ ...valid, performance: 'performed', setKind: 'warmup', isCardio: false }] });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.rows[0], { ...valid, performance: 'performed', setKind: 'warmup', isCardio: false });
  assert.equal(Object.hasOwn(result.body.rows[0], 'durationMins'), false);
});
for (const [field, value] of [['performance', 'bogus'], ['performance', null], ['setKind', 'bogus'], ['status', 'bogus'], ['notes', {}], ['id', 42], ['timestamp', -1], ['plannedTarget', []], ['plannedTarget', { reps: '8oops' }], ['plannedTarget', { reps: '8', weightLbs: '1kg' }], ['pendingInput', {}], ['durationMins', -1], ['distanceUnit', 'yards']] as const) {
  test(`classification and optional shape ${field} rejected before all effects`, async () => {
    const bad = { ...valid, [field]: value };
    assert.ok(contract.validateWorkoutRow(bad)); assert.equal(contract.isStrengthEvidence(bad), false);
    for (const name of ['log-set', 'history', 'chat']) {
      const body = name === 'history' ? { id: 'offline', part: 'Push', dateISO: '2026-10-08', rows: [bad] } : name === 'chat' ? { message: 'Bench and squat', rows: [bad] } : bad;
      const result = await edge(name, body, { rows: [valid] });
      assert.equal(result.status, 400, name); assert.equal(result.writes.length, 0); assert.equal(result.providerCalls, 0);
    }
    const model = await edge('chat', { message: 'Bench and squat' }, { rows: [bad] });
    assert.equal(model.status, 502); assert.equal(model.body.rows, undefined);
    const { runWorkoutRoute } = await import('../../../lib/__tests__/inSessionHarness.ts');
    const home = await runWorkoutRoute('Bench and squat 100 8', [], { rows: [bad] });
    assert.equal(home.messageInput, 'Bench and squat 100 8'); assert.equal(home.rows.length, 0);
    assert.equal(home.calls.some(c => ['logSet', 'rest', 'pr'].includes(c.method)), false);
  });
}
test('declared enum values and legacy omission retain evidence parity', () => {
  for (const performance of [undefined, 'planned', 'performed']) for (const setKind of [undefined, 'work', 'warmup', 'backoff', 'drop', 'superset', 'cardio']) {
    const row = { ...valid, performance, setKind };
    assert.equal(contract.validateWorkoutRow(row), null);
    assert.equal(contract.isStrengthEvidence(row), performance !== 'planned' && setKind !== 'warmup' && setKind !== 'cardio');
  }
});
test('cardio model metadata rejects non-number quantities and object display shapes', async () => {
  for (const update of [{ durationMins: '5' }, { durationMins: null }, { distance: {} }, { reps: {} }, { weightLbs: [] }]) {
    const result = await edge('chat', { message: 'Run and bike' }, { rows: [{ ...cardioModel, ...update }] });
    assert.equal(result.status, 502); assert.equal(result.body.rows, undefined);
  }
});
for (const body of [null, [], 42, { message: 42 }, { message: '' }, { message: 'Bench', lastExercise: 42 }, { message: 'Bench', rows: null }]) {
  test(`actual chat malformed HTTP envelope ${JSON.stringify(body)} is safe400 with no usage or provider`, async () => {
    const result = await edge('chat', body, { rows: [valid] });
    assert.equal(result.status, 400); assert.equal(result.providerCalls, 0); assert.equal(result.gateCalls, 0); assert.equal(result.writes.length, 0);
    assert.equal(JSON.stringify(result.body).includes('offline-fixture'), false);
  });
}
for (const model of [null, [], 42, {}, { answer: 42 }, { answer: {} }, { rows: null }, { rows: [valid], answer: 'ambiguous' }]) {
  test(`actual chat untrusted model envelope ${JSON.stringify(model)} safe502`, async () => {
    const result = await edge('chat', { message: 'Bench and squat' }, model);
    assert.equal(result.status, 502); assert.equal(result.body.rows, undefined); assert.equal(result.body.answer, undefined);
    assert.equal(JSON.stringify(result.body).includes('offline-fixture'), false);
  });
}
test('actual chat null provider envelope safe502', async () => {
  const result = await edge('chat', { message: 'Bench and squat' }, undefined, true, null);
  assert.equal(result.status, 502);
});
// P4 session-operation identity, with the same fields the app sends:
// log-set mirrors sessionOperationOutbox (`{...row, sessionId, rowId, dateISO, revision, operationKey, operation}`),
// history mirrors workoutStorage finalize (`{...session, revision, operationKey}`). Explicit body keys win.
const TRACKED = ['Bench'];
let opSeq = 0;
function withSessionOperation(name: string, body: any) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  if (name === 'log-set') {
    const rowId = typeof body.id === 'string' && body.id ? body.id : `offline-row-${++opSeq}`;
    return { id: rowId, sessionId: 'offline-session', rowId, dateISO: '2026-10-08', revision: 1, operationKey: `put:${rowId}:1`, operation: 'put', ...body };
  }
  if (name === 'history') {
    const rows = Array.isArray(body.rows) ? body.rows.map((row: any, i: number) => row && typeof row === 'object' && !Object.hasOwn(row, 'id') ? { id: `offline-row-${i}`, ...row } : row) : body.rows;
    return { revision: 1, operationKey: `finalize:${body.id}:1`, ...body, rows };
  }
  return body;
}
// Offline stand-in for SQL apply_workout_operation. PR is SQL-owned since P4, so the
// receipt is derived only from the row the Edge actually forwarded, using the SQL rules
// (i3_strength_eligible: shared evidence + load > 0 + i3_pr_reps int32 + finite epley,
// tracked lift, no prior e1RM in this fixture). Parity with real SQL: see evidence receipts.
function sqlReceipt(args: any) {
  const receipt: any = { ok: true, sessionId: args.p_session_id, operationKey: args.p_operation_key, revision: args.p_revision };
  const row = args.p_payload?.row;
  if (!['put', 'revise'].includes(args.p_kind) || !contract.isStrengthEvidence(row) || !TRACKED.includes(row.exercise)) return receipt;
  const load = contract.numericValue(row.weightLbs); const reps = contract.numericValue(row.reps, true);
  if (load.kind !== 'known' || reps.kind !== 'known' || !(load.value > 0) || reps.value > 2147483647) return receipt;
  const newE1rm = lift.epley1rm(load.value, reps.value);
  if (newE1rm !== null) receipt.pr = { liftName: row.exercise, weight: load.value, reps: reps.value, newE1rm, previousE1rm: null };
  return receipt;
}
function rpcCall(result: any, kind: string) {
  assert.equal(result.writes.length, 1); assert.equal(result.writes[0].method, 'rpc');
  assert.equal(result.writes[0].args[0], 'apply_workout_operation'); assert.equal(result.writes[0].args[1].p_kind, kind);
  return result.writes[0].args[1];
}
const forwardedRow = (result: any) => rpcCall(result, 'put').p_payload.row;
const IDENTITY_ERRORS = ['Session operation identity required.', 'Session operation identity and unique row IDs required.'];
// Every identity-supplied request must be judged on its own merits: a negative that only
// tripped the P4 identity guard would be a vacuous pass.
async function edge(name: string, body: any, ai?: any, authorized = true, providerEnvelope?: any) {
  const result = await edgeRaw(name, withSessionOperation(name, body), ai, authorized, providerEnvelope);
  assert.equal(IDENTITY_ERRORS.includes(result.body?.error), false, `${name} rejected on identity, not validation`);
  return result;
}
async function edgeRaw(name: string, body: any, ai?: any, authorized = true, providerEnvelope?: any) {
  const writes: any[] = []; let handler: any; let table = ''; let providerCalls = 0; let gateCalls = 0;
  const query: any = new Proxy({}, { get: (_, method) => {
    if (method === 'then') return (resolve: any) => resolve({ data: table === 'pr_tracked_lifts' ? TRACKED.map(lift_name => ({ lift_name })) : [], error: null });
    return (...args: any[]) => {
      if (['insert', 'upsert', 'delete', 'rpc'].includes(String(method))) writes.push({ method, args });
      if (method === 'single') return Promise.resolve({ data: { id: 'offline', dateISO: '2026-10-08' }, error: null });
      return query;
    };
  } });
  const client = { auth: { getUser: async () => ({ data: { user: authorized ? { id: 'offline-user' } : null }, error: null }) }, from: (name: string) => { table = name; return query; },
    rpc: async (...args: any[]) => { writes.push({ method: 'rpc', args }); return { data: sqlReceipt(args[1]), error: null }; } };
  const source = readFileSync(new URL(`../${name}/index.ts`, import.meta.url), 'utf8');
  const dependencies: any = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: any) => handler = fn },
    'https://esm.sh/@supabase/supabase-js@2.50.1': { createClient: () => client },
    '../_shared/liftMatching.ts': lift, '../_shared/workoutValidation.ts': contract,
    '../_shared/entitlements.ts': { gateAiRequest: async () => { gateCalls++; return { allowed: true }; } },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: {}, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
    Deno: { env: { get: () => 'offline-fixture' } }, Response, URL, console: { log: () => {}, warn: () => {}, error: () => {} },
    fetch: async () => { providerCalls++; return new Response(JSON.stringify(providerEnvelope === undefined ? { choices: [{ message: { content: JSON.stringify(ai) } }] } : providerEnvelope)); },
  });
  const response = await handler(new Request(`https://offline.invalid/${name}`, { method: 'POST', headers: { Authorization: 'Bearer offline-fixture', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json(), writes, providerCalls, gateCalls };
}
for (const [field, value] of [['weightLbs', 'NaN'], ['weightLbs', 'Infinity'], ['weightLbs', '-1'], ['weightLbs', '100kg'], ['reps', '8.5'], ['reps', '8oops'], ['reps', '-1'], ['exercise', ' '], ['set', '1oops']] as const) {
  test(`actual log-set HTTP rejects ${field}=${value} before DB effects`, async () => {
    const result = await edge('log-set', { ...valid, [field]: value });
    assert.equal(result.status, 400); assert.equal(result.writes.length, 0);
  });
  test(`actual history rejects ${field}=${value} before upsert/delete`, async () => {
    const result = await edge('history', { id: 'offline', part: 'Push', dateISO: '2026-10-08', rows: [{ ...valid, [field]: value }] });
    assert.equal(result.status, 400); assert.equal(result.writes.length, 0);
  });
}
test('actual AI chat rejects malformed model numbers instead of sanitizing them', async () => {
  const result = await edge('chat', { message: 'Bench and squat' }, { rows: [{ ...valid, reps: '8oops' }] });
  assert.equal(result.status, 502); assert.equal(result.body.rows, undefined);
});
test('explicit zero bodyweight retained; unknown HTTP load rejected', async () => {
  const zero = await edge('log-set', { ...valid, weightLbs: '0', reps: '12' });
  assert.equal(zero.status, 200); assert.equal(zero.body.pr, null);
  assert.equal(forwardedRow(zero).weightLbs, '0');
  const missing = await edge('log-set', { ...valid, weightLbs: null });
  assert.equal(missing.status, 400); assert.equal(missing.writes.length, 0);
});
test('history preserves unknown raw evidence without inventing workout_log zeros', async () => {
  const result = await edge('history', { id: 'offline', part: 'Push', dateISO: '2026-10-08', rows: [{ ...valid, weightLbs: '', reps: '', performance: 'planned' }] });
  assert.equal(result.status, 200);
  const finalize = rpcCall(result, 'finalize');
  assert.equal(finalize.p_payload.rows[0].weightLbs, '');
  assert.equal(result.writes.filter(w => w.method === 'insert').length, 0);
  assert.deepEqual(finalize.p_payload.logRows, []);
});
test('cardio HTTP rejects invalid quantity; explicit zero optional quantity retained', async () => {
  const invalid = await edge('log-set', { exercise: 'Run', set: 1, isCardio: true, durationMins: -1 });
  assert.equal(invalid.status, 400); assert.equal(invalid.writes.length, 0);
  const validCardio = await edge('log-set', { exercise: 'Run', set: 1, isCardio: true, durationMins: 12.5, calories: 0 });
  assert.equal(validCardio.status, 200); assert.equal(forwardedRow(validCardio).calories, 0);
  assert.notEqual(forwardedRow(validCardio).weightLbs, '0');
});
test('P4 identity-less log-set and history requests are still rejected before any RPC', async () => {
  const bare = await edgeRaw('log-set', valid);
  assert.equal(bare.status, 400); assert.deepEqual(bare.body, { error: IDENTITY_ERRORS[0] }); assert.equal(bare.writes.length, 0);
  const complete = withSessionOperation('log-set', valid);
  assert.equal((await edgeRaw('log-set', complete)).status, 200);
  for (const [key, value] of [['sessionId', undefined], ['rowId', ''], ['operationKey', undefined], ['dateISO', undefined], ['revision', 0], ['revision', 1.5], ['revision', '1']] as const) {
    const result = await edgeRaw('log-set', { ...complete, [key]: value });
    assert.equal(result.status, 400, `${key}=${String(value)}`); assert.deepEqual(result.body, { error: IDENTITY_ERRORS[0] }); assert.equal(result.writes.length, 0);
  }
  const history = await edgeRaw('history', { id: 'offline', part: 'Push', dateISO: '2026-10-08', rows: [{ ...valid, id: 'r1' }] });
  assert.equal(history.status, 400); assert.deepEqual(history.body, { error: IDENTITY_ERRORS[1] }); assert.equal(history.writes.length, 0);
});
