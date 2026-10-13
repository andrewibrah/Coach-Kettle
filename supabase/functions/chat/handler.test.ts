import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real Edge handler and shared entitlement gate; only auth/DB/provider transport replaced.
const SECRET = 'sk-test-SECRET';
const PROVIDER_TEXT = 'Incorrect API key provided';
const MESSAGE = 'my-private-message-text';
function host(provider: (url?: any, init?: any) => Promise<Response>, opts: { policy?: Record<string, unknown> } = {}) {
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
        if (opts.policy && name.endsWith('/coachingPolicy.ts')) return { ...load(new URL(name, url)), COACHING_POLICY: opts.policy };
        if (name.startsWith('.')) return load(new URL(name, url));
        throw new Error(`Unexpected dependency ${name}`);
      } });
    return exports;
  }
  load(new URL('./index.ts', import.meta.url));
  return { logs, request: (body: unknown = { message: MESSAGE, rows: [] }) => handler!(new Request('https://fixture.invalid/', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify(body) })) };
}
const logText = (logs: unknown[][]) => logs.flat().map(a => a instanceof Error ? `${a.message} ${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a) ?? String(a)).join('\n');
const completion = (content: string) => async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

for (const [label, provider, status] of [
  ['provider 401 body', async () => new Response(JSON.stringify({ error: { message: `${PROVIDER_TEXT}: ${SECRET}` } }), { status: 401 }), 500],
  ['provider transport error', async () => { throw new Error(`connect failed ${PROVIDER_TEXT} ${SECRET}`); }, 500],
  ['unparseable model output', completion(`not json ${MESSAGE} ${SECRET}`), 502],
  ['model output with neither rows nor answer', completion(JSON.stringify({ echo: `${MESSAGE} ${SECRET}` })), 502],
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

// Provider double recording the exact messages the real handler sends.
function capture(content: string, opts: Parameters<typeof host>[1] = {}) {
  const sent: any[] = [];
  const api = host(async (_url: any, init: any) => { sent.push(JSON.parse(init.body).messages); return new Response(JSON.stringify({ choices: [{ message: { content } }] })); }, opts);
  return { sent, ask: async (body: unknown) => { const res = await api.request(body); return { status: res.status, body: await res.json() }; } };
}
const FLAG_ON = { version: 'unapproved', contextualDisclosures: true, adaptiveNextSet: false, structuredQuestions: false };
const scope = { exerciseCanonical: null, revision: null };
const disclosure = { sessionId: 's1', source: 'composer_message', rowId: null, exercise: null, ...scope, text: 'My shoulder hurts' };
const context = { sessionId: 's1', omittedCount: 0, disclosures: [{ sessionId: 's1', source: 'row_note', rowId: 'r1', exercise: 'Bench', ...scope, text: 'elbow pain' }] };
const parsed = JSON.stringify({ rows: [{ exercise: 'Squat', set: 1, weightLbs: '100', reps: '5', notes: '' }] });

test('flag off: context ignored and provider messages byte-identical to the legacy shape', async () => {
  const c = capture(parsed);
  const res = await c.ask({ message: 'squat 100 5', rows: [], context });
  assert.equal(res.status, 200);
  assert.equal(c.sent[0].length, 2);
  assert.equal(c.sent[0][1].content, JSON.stringify({ message: 'squat 100 5', existing_rows: [] }));
  assert.equal(JSON.stringify(c.sent).includes('elbow pain'), false);
});

test('flag on: disclosures are a labeled system block outside existing_rows; parse mode returns only model rows', async () => {
  const c = capture(parsed, { policy: FLAG_ON });
  const res = await c.ask({ message: 'squat 100 5', rows: [], context });
  assert.equal(res.status, 200);
  const [system, block, user] = c.sent[0];
  assert.equal(system.role, 'system');
  assert.equal(block.role, 'system');
  assert.match(block.content, /CURRENT-SESSION DISCLOSURES/);
  assert.match(block.content, /not sets to log/);
  assert.ok(block.content.includes('"elbow pain"'));
  assert.match(block.content, /row r1, exercise "Bench", canonical unknown, revision unknown/);
  assert.equal(user.content, JSON.stringify({ message: 'squat 100 5', existing_rows: [] }));
  assert.deepEqual(res.body.rows.map((r: any) => r.exercise), ['Squat']);
});

test('flag on: empty disclosures add no block; malformed context is rejected before the provider', async () => {
  const c = capture(parsed, { policy: FLAG_ON });
  await c.ask({ message: 'squat 100 5', rows: [], context: { sessionId: 's1', omittedCount: 0, disclosures: [] } });
  assert.equal(c.sent[0].length, 2);
  for (const bad of [{ sessionId: '', omittedCount: 0, disclosures: [] }, { sessionId: 's1', omittedCount: 0, disclosures: [{ ...disclosure, source: 'assistant' }] }, [] as any,
    { sessionId: 's1', disclosures: [disclosure] }, { sessionId: 's1', omittedCount: -1, disclosures: [disclosure] },
    { sessionId: 's1', omittedCount: 0, disclosures: [{ ...disclosure, revision: 'x' }] },
    { sessionId: 's1', omittedCount: 0, disclosures: [disclosure], exchange: { question: 'q', answer: 42 } }]) {
    assert.equal((await c.ask({ message: 'squat 100 5', rows: [], context: bad })).status, 400);
  }
  assert.equal(c.sent.length, 1);
});

test('flag on: preceding clarification exchange and omittedCount are labeled context, never chat turns', async () => {
  const c = capture(JSON.stringify({ answer: 'Hold the weight.' }), { policy: FLAG_ON });
  const res = await c.ask({ message: 'Only on the way down', rows: [], context: { sessionId: 's1', omittedCount: 3, disclosures: [disclosure],
    exchange: { question: 'My shoulder hurts', answer: 'Where exactly? Does it hurt when pressing?' } } });
  assert.equal(res.status, 200);
  assert.equal(c.sent[0].length, 3);
  const block = c.sent[0][1].content;
  assert.match(block, /PRECEDING EXCHANGE/);
  assert.ok(block.includes('"Where exactly? Does it hurt when pressing?"'));
  assert.match(block, /3 earlier disclosures omitted/);
  assert.equal(c.sent[0][2].content, JSON.stringify({ message: 'Only on the way down', existing_rows: [] }));
});
