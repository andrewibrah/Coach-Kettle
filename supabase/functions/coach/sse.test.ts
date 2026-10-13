import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Offline fixtures: execute the real Edge handler and entitlement gate;
// auth/database/provider transport are doubles, not live model advice.
function host(provider: () => Promise<Response>, options: { auth?: boolean; allowed?: boolean } = {}) {
  let handler: (req: Request) => Promise<Response>;
  const logs: unknown[][] = [];
  let providerCalls = 0;
  const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
    single: async () => ({ data: null, error: null }), then: (yes: any, no: any) => Promise.resolve({ data: [], error: null }).then(yes, no) };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.auth === false ? null : { id: 'fixture-owner' } }, error: null }) },
    rpc: async () => ({ data: [{ entitlement_status: options.allowed === false ? 'free' : 'sub_active' }], error: null }),
    from: () => q,
  };
  const record = (...args: unknown[]) => { logs.push(args); };
  function load(url: URL): any {
    const exports = {};
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, Request, Response, URL, ReadableStream, TextDecoder, TextEncoder,
      fetch: () => { providerCalls++; return provider(); },
      console: { error: record, warn: record, log: record }, Deno: { env: { get: () => 'fixture' } }, require(name: string) {
        if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
        if (name.includes('supabase-js')) return { createClient: () => client };
        if (name.startsWith('.')) return load(new URL(name, url));
        throw new Error(`Unexpected dependency ${name}`);
      } });
    return exports;
  }
  load(new URL('./index.ts', import.meta.url));
  return { logs, get providerCalls() { return providerCalls; }, request: () => handler!(new Request('https://fixture.invalid/', {
    method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ question: 'Should I add weight?', rows: [] }),
  })) };
}
test('actual handler accepts CRLF, multiline data, comments, and final unterminated DONE', async () => {
  const fixture = ': keepalive\r\nevent: message\r\ndata:{"choices":\r\ndata: [{"delta":{"content":"Do not "}}]}\r\n\r\n'
    + event('increase load.').replaceAll('\n', '\r\n') + 'data: [DONE]';
  // Byte-at-a-time exercises CR/LF split boundaries and incomplete lines.
  const api = host(async () => transport(Array.from(enc.encode(fixture), byte => Uint8Array.of(byte))));
  assert.equal(await (await api.request()).text(), 'Do not increase load.');
});

test('known incomplete or failed provider streams reject instead of completing partial advice', async () => {
  const privateText = 'private-provider-secret';
  const cases = [
    event('Do not '), // Clean EOF is not completion without provider [DONE].
    event('Do not ') + 'data: {"choices":', // Truncated final line.
    '', // Empty EOF is not a successful answer.
    event('Do not ') + 'data: {"error":{"message":"' + privateText + '"}}\n\n',
    event('Do not ') + 'data: {bad ' + privateText + '}\n\ndata: [DONE]\n\n',
    event('Do not ') + 'data: {"choices":[{"delta":{"content":42}}]}\n\ndata: [DONE]\n\n',
  ];
  for (const fixture of cases) {
    const api = host(async () => transport([enc.encode(fixture)]));
    const res = await api.request();
    assert.equal(res.status, 200, 'headers already sent: failure must surface on the body');
    await assert.rejects(res.text(), /Coach response interrupted/);
    assert.equal(JSON.stringify(api.logs).includes(privateText), false);
  }
});

test('invalid UTF-8 is a visible stream failure, not replacement advice', async () => {
  const prefix = enc.encode('data: {"choices":[{"delta":{"content":"');
  const suffix = enc.encode('"}}]}\n\ndata: [DONE]\n\n');
  const api = host(async () => transport([prefix, Uint8Array.of(0xc3), suffix]));
  await assert.rejects((await api.request()).text(), /Coach response interrupted/);
});

test('multiple provider events emit exact text once and DONE stops/cancels an open provider', async () => {
  let cancelled = false;
  const fixture = 'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n'
    + event('Do not ') + event('increase load.')
    + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
    + 'data: {"choices":[],"usage":{"total_tokens":12}}\n\n'
    + 'data: [DONE]\n\n' + event('must not appear');
  const api = host(async () => new Response(new ReadableStream({
    start(c) { c.enqueue(enc.encode(fixture)); }, // No EOF: DONE must terminate the response.
    cancel() { cancelled = true; },
  })));
  assert.equal(await (await api.request()).text(), 'Do not increase load.');
  assert.equal(cancelled, true);
});

test('provider disconnect after delivered text rejects safely and releases the provider', async () => {
  let upstream!: ReadableStreamDefaultController<Uint8Array>;
  const api = host(async () => new Response(new ReadableStream({ start(c) { upstream = c; } })));
  const res = await api.request();
  const reader = res.body!.getReader();
  upstream.enqueue(enc.encode(event('Do not increase load.')));
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'Do not increase load.');
  upstream.error(new Error('private-provider-secret'));
  await assert.rejects(reader.read(), /Coach response interrupted/);
  assert.equal(JSON.stringify(api.logs).includes('private-provider-secret'), false);
});

test('client cancellation cancels pending provider reads', async () => {
  let cancelled = false;
  const api = host(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  const res = await api.request();
  await res.body!.cancel();
  assert.equal(cancelled, true);
});

test('auth and entitlement denial never contact provider; missing provider body fails safely', async () => {
  for (const [options, status] of [[{ auth: false }, 401], [{ allowed: false }, 429]] as const) {
    const api = host(async () => transport([]), options);
    assert.equal((await api.request()).status, status);
    assert.equal(api.providerCalls, 0);
  }
  const api = host(async () => new Response(null));
  const res = await api.request();
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Coach is temporarily unavailable', code: 'COACH_UNAVAILABLE' });
});

test('actual handler rejects malformed choice and delta structures with sanitized body errors', async () => {
  const badChoices = [null, [], 'private-provider-secret', {}, { delta: null }, { delta: [] },
    { delta: 'private-provider-secret' }, { delta: { content: {} } }, { delta: { role: 42 } },
    { delta: {}, finish_reason: 42 }, { delta: {}, finish_reason: {} }];
  for (const choice of badChoices) {
    const fixture = `data: ${JSON.stringify({ choices: [choice] })}\n\ndata: [DONE]\n\n`;
    const api = host(async () => transport([enc.encode(fixture)]));
    await assert.rejects((await api.request()).text(), /Coach response interrupted/, JSON.stringify(choice));
    assert.equal(JSON.stringify(api.logs).includes('private-provider-secret'), false);
  }
  const api = host(async () => transport([enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Do not ' } }, null] })}\n\ndata: [DONE]\n\n`)]));
  await assert.rejects((await api.request()).text(), /Coach response interrupted/);
});

test('actual handler treats provider length truncation as interruption even with DONE', async () => {
  const fixture = event('Do not ') + 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n';
  const api = host(async () => transport([enc.encode(fixture)]));
  await assert.rejects((await api.request()).text(), /Coach response interrupted/);
});

const enc = new TextEncoder();
const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
function transport(chunks: Uint8Array[]) {
  return new Response(new ReadableStream<Uint8Array>({ start(c) { for (const chunk of chunks) c.enqueue(chunk); c.close(); } }));
}

test('actual handler preserves the critical negation and UTF-8 at every byte boundary', async () => {
  const expected = 'Do not increase load. Café 🏋️';
  const bytes = enc.encode(event(expected) + 'data: [DONE]\n\n');
  // One behavior with exhaustive transport split positions, not inflated test counts.
  for (let split = 1; split < bytes.length; split++) {
    const api = host(async () => transport([bytes.slice(0, split), bytes.slice(split)]));
    const res = await api.request();
    assert.equal(res.status, 200);
    assert.equal(await res.text(), expected, `byte boundary ${split}`);
  }
});
