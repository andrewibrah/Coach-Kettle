import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as lift from '../_shared/liftMatching.ts';
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
async function nextSet(request: { method?: string; query?: string; body?: any }, opts: { tracked?: string[]; trackedError?: any; rpc?: { data: any; error: any }; authorized?: boolean } = {}) {
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
  return { status: response.status, body: await response.json(), clients, rpcCalls, tableReads };
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
