import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Executes the real profile handler; only Deno bootstrap, auth and the RPC transport are mocked.
// This proves the Edge contract, not deployed PostgREST/SQL behaviour.
const user = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const payload = () => ({ profile: { focus: 'strength' }, tracked_lifts: ['Squat'], pr_values: [], workout_templates: [] });
const sql = readFileSync(new URL('../../migrations/20260909000100_atomic_onboarding.sql', import.meta.url), 'utf8');
const raised = (pattern: RegExp) => {
  const match = sql.match(pattern);
  assert.ok(match, `migration no longer raises ${pattern}`);
  return match[1];
};
const CONFLICT = raised(/RAISE EXCEPTION '(request ID payload conflict)' USING ERRCODE = '22023'/);
const ALREADY = raised(/RAISE EXCEPTION '(onboarding already completed; ambiguous new request)' USING ERRCODE = '22023'/);
const UNAUTH = raised(/RAISE EXCEPTION '(authentication required)' USING ERRCODE = '42501'/);

function host(options: { unauthorized?: boolean; rpc?: (args: any) => any } = {}) {
  let handler: (req: Request) => Promise<Response>;
  const clients: any[] = [];
  const logs: any[] = [];
  const createClient = (url: string, key: string, opts: any) => {
    const client: any = {
      url, key, opts, rpcCalls: [] as any[],
      auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: user } }, error: options.unauthorized ? { message: 'bad jwt' } : null }) },
      rpc: async (name: string, args: any) => {
        client.rpcCalls.push({ name, args: JSON.parse(JSON.stringify(args)) });
        return options.rpc ? options.rpc(args) : { data: { request_id: args.p_request_id, onboarding_completed: true, template_ids: [] }, error: null };
      },
      from() { throw new Error('direct table access is not expected'); },
    };
    clients.push(client);
    return client;
  };
  const code = ts.transpileModule(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const quiet = { log: () => {}, warn: (...a: any[]) => logs.push(a), error: (...a: any[]) => logs.push(a) };
  vm.runInNewContext(code, { exports: {}, Request, Response, URL, console: quiet, Deno: { env: { get: (name: string) => `env:${name}` } }, require(name: string) {
    if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
    if (name.includes('supabase-js')) return { createClient };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  const post = (body: any, auth: string | null = 'Bearer user-jwt') => handler!(new Request('https://fixture.invalid/', {
    method: 'POST', headers: auth === null ? {} : { Authorization: auth }, body: JSON.stringify(body),
  }));
  const atomic = (body: any = {}) => post({ action: 'complete_onboarding_atomic', request_id: requestId, payload: payload(), ...body });
  return { clients, logs, post, atomic, options: (req: Request) => handler!(req) };
}

const userClients = (clients: any[]) => clients.filter(c => c.key === 'env:SUPABASE_ANON_KEY');
const adminClients = (clients: any[]) => clients.filter(c => c.key === 'env:SUPABASE_SERVICE_ROLE_KEY');

test('OPTIONS preflight returns CORS headers', async () => {
  const api = host();
  const response = await api.options(new Request('https://fixture.invalid/', { method: 'OPTIONS' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(response.headers.get('Access-Control-Allow-Headers')!, /authorization/);
});

test('missing or rejected auth returns 401 without calling the RPC', async () => {
  const missing = host();
  assert.equal((await missing.post({ action: 'complete_onboarding_atomic', request_id: requestId, payload: payload() }, null)).status, 401);
  const rejected = host({ unauthorized: true });
  assert.equal((await rejected.atomic()).status, 401);
  for (const api of [missing, rejected]) assert.ok(api.clients.every(c => c.rpcCalls.length === 0));
});

test('bad request id or payload returns 400 without calling the RPC', async () => {
  for (const body of [
    { request_id: 'not-a-uuid' }, { request_id: null }, { request_id: `${requestId}x` }, { request_id: 42 },
    { payload: null }, { payload: [] }, { payload: 'x' }, { payload: undefined },
  ]) {
    const api = host();
    const response = await api.atomic(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).code, 'ONBOARDING_INVALID_REQUEST');
    assert.ok(api.clients.every(c => c.rpcCalls.length === 0));
  }
});

test('success calls the RPC once on a user-scoped anon client with exact args', async () => {
  const api = host();
  const response = await api.atomic();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, result: { request_id: requestId, onboarding_completed: true, template_ids: [] } });
  const [userClient, ...rest] = userClients(api.clients);
  assert.equal(rest.length, 0);
  assert.equal(userClient.url, 'env:SUPABASE_URL');
  assert.equal(userClient.opts.global.headers.Authorization, 'Bearer user-jwt');
  assert.deepEqual(userClient.rpcCalls, [{ name: 'complete_onboarding_atomic', args: { p_request_id: requestId, p_payload: payload() } }]);
  assert.ok(adminClients(api.clients).every(c => c.rpcCalls.length === 0));
});

test('RPC errors map to stable responses without leaking SQL or input', async () => {
  const cases: [any, number, string | undefined][] = [
    [{ code: '22023', message: CONFLICT }, 409, 'ONBOARDING_REQUEST_CONFLICT'],
    [{ code: '22023', message: ALREADY }, 409, 'ONBOARDING_ALREADY_COMPLETED'],
    [{ code: '22023', message: 'unknown field: secret_private_key' }, 400, 'ONBOARDING_INVALID_PAYLOAD'],
    [{ code: '42501', message: UNAUTH }, 401, undefined],
    [{ code: 'PGRST202', message: 'Could not find the function public.complete_onboarding_atomic' }, 500, undefined],
    [{ code: 'XX000', message: 'private relation "profiles" detail' }, 500, undefined],
  ];
  for (const [error, status, code] of cases) {
    const api = host({ rpc: () => ({ data: null, error }) });
    const response = await api.atomic();
    assert.equal(response.status, status, error.message);
    const body = await response.json();
    if (code) assert.equal(body.code, code);
    assert.equal(body.ok, undefined);
    const text = JSON.stringify(body);
    assert.ok(!text.includes(error.message), text);
    assert.ok(!text.includes('secret_private_key'));
  }
  const thrown = host({ rpc: () => { throw new Error('private transport'); } });
  const response = await thrown.atomic();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error' });
  const empty = host({ rpc: () => ({ data: null, error: null }) });
  assert.equal((await empty.atomic()).status, 500);
});
