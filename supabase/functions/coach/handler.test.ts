import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real Edge handler and shared entitlement gate; only auth/DB/provider transport replaced.
const SECRET = 'sk-test-SECRET';
const PROVIDER_TEXT = 'Incorrect API key provided';
const QUESTION = 'my-private-question-text';
function host(provider: () => Promise<Response>) {
  let handler: (req: Request) => Promise<Response>;
  const logs: unknown[][] = [];
  const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
    single: async () => ({ data: null, error: null }), then: (yes: any, no: any) => Promise.resolve({ data: [], error: null }).then(yes, no) };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'verified-owner' } }, error: null }) },
    rpc: async () => ({ data: [{ entitlement_status: 'sub_active' }], error: null }),
    from: () => q,
  };
  const record = (...args: unknown[]) => { logs.push(args); };
  function load(url: URL): any {
    const exports = {};
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, Request, Response, URL, ReadableStream, TextDecoder, TextEncoder, fetch: provider,
      console: { error: record, warn: record, log: record }, Deno: { env: { get: () => 'fixture' } }, require(name: string) {
        if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
        if (name.includes('supabase-js')) return { createClient: () => client };
        if (name.startsWith('.')) return load(new URL(name, url));
        throw new Error(`Unexpected dependency ${name}`);
      } });
    return exports;
  }
  load(new URL('./index.ts', import.meta.url));
  return { logs, request: () => handler!(new Request('https://fixture.invalid/', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ question: QUESTION, rows: [] }) })) };
}
function assertNoLeak(text: string, where: string) {
  for (const s of [SECRET, PROVIDER_TEXT, QUESTION]) assert.equal(text.includes(s), false, `${where} leaked ${s}`);
}
const logText = (logs: unknown[][]) => logs.flat().map(a => a instanceof Error ? `${a.message} ${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a) ?? String(a)).join('\n');

test('provider 401 body never reaches the client or the logs', async () => {
  const api = host(async () => new Response(JSON.stringify({ error: { message: `${PROVIDER_TEXT}: ${SECRET}`, code: 'invalid_api_key' } }), { status: 401 }));
  const res = await api.request();
  assert.equal(res.status, 500);
  const body = await res.text();
  assert.deepEqual(JSON.parse(body), { error: 'Coach is temporarily unavailable', code: 'COACH_UNAVAILABLE' });
  assertNoLeak(body, 'response');
  assertNoLeak(logText(api.logs), 'console');
  assert.ok(api.logs.some(args => args.join(' ').includes('status=') && args.includes(401)), 'status is still logged');
});

test('provider transport error text never reaches the client or the logs', async () => {
  const api = host(async () => { throw new Error(`connect failed ${PROVIDER_TEXT} ${SECRET}`); });
  const res = await api.request();
  assert.equal(res.status, 500);
  const body = await res.text();
  assert.deepEqual(JSON.parse(body), { error: 'Coach is temporarily unavailable', code: 'COACH_UNAVAILABLE' });
  assertNoLeak(body, 'response');
  assertNoLeak(logText(api.logs), 'console');
});

test('provider stream error and malformed SSE lines are not logged verbatim', async () => {
  const enc = new TextEncoder();
  const api = host(async () => new Response(new ReadableStream({ start(c) {
    c.enqueue(enc.encode(`data: {not json ${SECRET}\n`));
    c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n'));
    c.error(new Error(`stream reset ${PROVIDER_TEXT} ${SECRET}`));
  } }), { status: 200 }));
  const res = await api.request();
  assert.equal(res.status, 200);
  await res.text().catch(() => undefined);
  await new Promise(r => setTimeout(r, 10));
  assertNoLeak(logText(api.logs), 'console');
});
