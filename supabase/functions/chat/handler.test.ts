import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real Edge handler and shared entitlement gate; only auth/DB/provider transport replaced.
const SECRET = 'sk-test-SECRET';
const PROVIDER_TEXT = 'Incorrect API key provided';
const MESSAGE = 'my-private-message-text';
function host(provider: () => Promise<Response>) {
  let handler: (req: Request) => Promise<Response>;
  const logs: unknown[][] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'verified-owner' } }, error: null }) },
    rpc: async () => ({ data: [{ entitlement_status: 'sub_active' }], error: null }),
  };
  const record = (...args: unknown[]) => { logs.push(args); };
  function load(url: URL): any {
    const exports = {};
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, Request, Response, URL, fetch: provider,
      console: { error: record, warn: record, log: record }, Deno: { env: { get: () => 'fixture' } }, require(name: string) {
        if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
        if (name.includes('supabase-js')) return { createClient: () => client };
        if (name.startsWith('.')) return load(new URL(name, url));
        throw new Error(`Unexpected dependency ${name}`);
      } });
    return exports;
  }
  load(new URL('./index.ts', import.meta.url));
  return { logs, request: () => handler!(new Request('https://fixture.invalid/', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ message: MESSAGE, rows: [] }) })) };
}
const logText = (logs: unknown[][]) => logs.flat().map(a => a instanceof Error ? `${a.message} ${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a) ?? String(a)).join('\n');
const completion = (content: string) => async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

for (const [label, provider, status] of [
  ['provider 401 body', async () => new Response(JSON.stringify({ error: { message: `${PROVIDER_TEXT}: ${SECRET}` } }), { status: 401 }), 500],
  ['provider transport error', async () => { throw new Error(`connect failed ${PROVIDER_TEXT} ${SECRET}`); }, 500],
  ['unparseable model output', completion(`not json ${MESSAGE} ${SECRET}`), 200],
  ['model output with neither rows nor answer', completion(JSON.stringify({ echo: `${MESSAGE} ${SECRET}` })), 200],
] as any[]) test(`${label} never reaches the client or the logs`, async () => {
  const api = host(provider);
  const res = await api.request();
  assert.equal(res.status, status);
  const body = await res.text();
  const logged = logText(api.logs);
  for (const s of [SECRET, PROVIDER_TEXT, MESSAGE]) {
    assert.equal(body.includes(s), false, `response leaked ${s}`);
    assert.equal(logged.includes(s), false, `console leaked ${s}`);
  }
});
