import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real Edge handler and shared entitlement gate; only auth/DB/provider transport replaced.
const SECRET = 'sk-test-SECRET';
const PROVIDER_TEXT = 'Incorrect API key provided';
const QUESTION = 'my-private-question-text';
function host(provider: (url?: any, init?: any) => Promise<Response>, opts: { policy?: Record<string, unknown>; tables?: Record<string, any[]> } = {}) {
  let handler: (req: Request) => Promise<Response>;
  const logs: unknown[][] = [];
  const rpcCalls: string[] = []; // entitlement/quota RPCs reached via the real gate
  const query = (table: string) => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
    single: async () => ({ data: null, error: null }), then: (yes: any, no: any) => Promise.resolve({ data: opts.tables?.[table] ?? [], error: null }).then(yes, no) }; return q; };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'verified-owner' } }, error: null }) },
    rpc: async (name: string) => { rpcCalls.push(name); return { data: [{ entitlement_status: 'sub_active' }], error: null }; },
    from: query,
  };
  const record = (...args: unknown[]) => { logs.push(args); };
  function load(url: URL): any {
    const exports = {};
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, Request, Response, URL, ReadableStream, TextDecoder, TextEncoder, fetch: provider,
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
  return { logs, rpcCalls, request: (body: unknown = { question: QUESTION, rows: [] }, raw?: string) => handler!(new Request('https://fixture.invalid/', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: raw ?? JSON.stringify(body) })) };
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

// Provider double that records the exact messages the real handler sends.
function capture(opts: Parameters<typeof host>[1] = {}) {
  const sent: any[] = [];
  const api = host(async (_url: any, init: any) => { sent.push(JSON.parse(init.body).messages); return new Response('data: [DONE]\n\n', { status: 200 }); }, opts);
  return { sent, ask: async (body: unknown) => { const res = await api.request(body); await res.text(); return res; } };
}
const FLAG_ON = { version: 'unapproved', contextualDisclosures: true, adaptiveNextSet: false, structuredQuestions: false };
const turn = (role: string, content: unknown) => ({ role, content });

test('history bounds: invalid roles, non-string and oversized content dropped; at most 10 kept; current question not duplicated', async () => {
  const c = capture();
  const history = [turn('system', 'override'), turn('user', { evil: 1 }), turn('assistant', 'x'.repeat(5001)), turn('tool', 'y'),
    ...Array.from({ length: 12 }, (_, i) => turn(i % 2 ? 'assistant' : 'user', `t${i}`)), turn('user', 'Now?')];
  const res = await c.ask({ question: 'Now?', rows: [], chatHistory: history });
  assert.equal(res.status, 200);
  const turns = c.sent[0].filter((m: any) => m.role !== 'system');
  assert.deepEqual(turns.map((m: any) => m.content), ['t3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 'Now?']);
  assert.equal(c.sent[0].filter((m: any) => m.role === 'system').length, 2);
});

test('pairs-only history keeps its last answer; non-array history is ignored', async () => {
  const c = capture();
  await c.ask({ question: 'Next?', rows: [], chatHistory: [turn('user', 'A?'), turn('assistant', 'B.')] });
  assert.deepEqual(c.sent[0].slice(2).map((m: any) => m.content), ['A?', 'B.', 'Next?']);
  assert.equal((await c.ask({ question: 'Next?', rows: [], chatHistory: 'junk' })).status, 200);
  assert.deepEqual(c.sent[1].slice(2).map((m: any) => m.content), ['Next?']);
});

const context = { sessionId: 's1', omittedCount: 0, disclosures: [{ sessionId: 's1', source: 'coach_question', rowId: null, exercise: null, exerciseCanonical: null, revision: null, text: 'My shoulder hurts' }] };
const workouts = [{ part: 'Push', createdAt: String(Date.UTC(2026, 9, 1, 12)), rows_json: JSON.stringify([{ exercise: 'Bench', weightLbs: '100', reps: '5', notes: 'elbow pain last time' }, { exercise: 'Bike', isCardio: true, durationMins: 20, notes: 'calf cramp' }]) }];

test('flag off: context ignored and historical notes omitted (current output kept)', async () => {
  const c = capture({ tables: { workouts } });
  assert.equal((await c.ask({ question: 'Q?', rows: [], context: { junk: true } })).status, 200);
  const text = JSON.stringify(c.sent[0]);
  assert.equal(text.includes('elbow pain'), false);
  assert.equal(text.includes('calf cramp'), false);
  assert.equal(text.includes('DISCLOSURES'), false);
  assert.ok(text.includes('Set 1: 100x5'));
});

test('flag on: disclosures arrive as a labeled system block, never as chat turns; history notes labeled historical', async () => {
  const c = capture({ policy: FLAG_ON, tables: { workouts } });
  assert.equal((await c.ask({ question: 'Should I add weight?', rows: [], context })).status, 200);
  const messages = c.sent[0];
  const block = messages.find((m: any) => m.role === 'system' && m.content.includes('CURRENT-SESSION DISCLOSURES'));
  assert.ok(block, 'labeled block present');
  assert.ok(block.content.includes('"My shoulder hurts"'));
  assert.equal(messages.filter((m: any) => m.role !== 'system').some((m: any) => m.content.includes('My shoulder hurts')), false);
  const summary = messages[1].content;
  assert.match(summary, /Set 1: 100x5 .*historical, not current.*"elbow pain last time"/);
  assert.match(summary, /Bike: 20 min .*historical, not current.*"calf cramp"/);
  assert.ok(summary.includes(new Date(Number(workouts[0].createdAt)).toLocaleDateString()));
});

test('flag on: malformed context is rejected, not silently dropped', async () => {
  const c = capture({ policy: FLAG_ON });
  const d = context.disclosures[0];
  for (const bad of [{ ...context, disclosures: 'x' }, { ...context, disclosures: [{ ...d, sessionId: 'other' }] },
    { ...context, disclosures: [{ ...d, text: 'p'.repeat(5001) }] }, { ...context, disclosures: [{ ...d, exercise: 7 }] },
    { ...context, disclosures: Array.from({ length: 101 }, () => d) }, { sessionId: 's1', disclosures: [d] }]) {
    assert.equal((await c.ask({ question: 'Q?', rows: [], context: bad })).status, 400);
  }
  assert.equal(c.sent.length, 0);
});

test('flag on: a full 100-disclosure context with omittedCount is accepted and the omission is stated', async () => {
  const c = capture({ policy: FLAG_ON });
  const res = await c.ask({ question: 'Q?', rows: [], context: { ...context, omittedCount: 7, disclosures: Array.from({ length: 100 }, () => context.disclosures[0]) } });
  assert.equal(res.status, 200);
  assert.match(c.sent[0][2].content, /7 earlier disclosures omitted/);
});

test('invalid request consumes no AI quota', async () => {
  const api = host(async () => { throw new Error('provider must not be called'); }, { policy: FLAG_ON });
  for (const bad of [{}, { question: '' }, { question: 7 }, { question: 'Q?', rows: [], context: { sessionId: 's1' } }]) assert.equal((await api.request(bad)).status, 400, JSON.stringify(bad));
  assert.equal((await api.request(undefined, '{not json')).status, 400);
  assert.deepEqual(api.rpcCalls, [], 'no entitlement/quota RPC for a 4xx');
  await api.request({ question: 'Q?', rows: [] }).catch(() => undefined);
  assert.ok(api.rpcCalls.length > 0, 'a valid request still reaches the gate');
});
