import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// The "couldn't analyze" client copy must not conflate a downed provider
// (OpenAI non-2xx/timeout) with the provider returning content that doesn't
// parse into usable items. This function must return distinguishable status
// codes for those two classes, without leaking provider text either way.
const PROVIDER_TEXT = 'Incorrect API key provided';
const SECRET = 'sk-test-SECRET';
const TEXT = 'chicken and rice';

function host(provider: () => Promise<Response>) {
  let handler: (req: Request) => Promise<Response>;
  const logs: unknown[][] = [];
  const record = (...args: unknown[]) => { logs.push(args); };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'verified-owner' } }, error: null }) },
    rpc: async (name: string) => {
      if (name === 'cleanup_expired_nutrition_analysis_sessions') return { data: null, error: null };
      if (name === 'consume_nutrition_analysis_rate_limit') return { data: true, error: null };
      throw new Error(`unexpected rpc ${name}`);
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, error: null }),
        }),
      }),
    }),
  };
  function load(url: URL): any {
    const exports = {};
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
      exports, Request, Response, URL, Uint8Array, atob, JSON, Date, fetch: provider,
      console: { error: record, warn: record, log: record },
      Deno: { env: { get: (key: string) => (key === 'OPENAI_API_KEY' ? SECRET : 'fixture') } },
      require(name: string) {
        if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
        if (name.includes('supabase-js')) return { createClient: () => client };
        throw new Error(`Unexpected dependency ${name}`);
      },
    });
    return exports;
  }
  load(new URL('./index.ts', import.meta.url));
  return {
    logs,
    request: () => handler!(new Request('https://fixture.invalid/', {
      method: 'POST',
      headers: { Authorization: 'Bearer fixture' },
      body: JSON.stringify({ action: 'analyze', mode: 'text', text: TEXT }),
    })),
  };
}

const logText = (logs: unknown[][]) => logs.flat().map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join('\n');
const completion = (content: string) => async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

test('a downed provider (non-2xx) returns 502, distinct from an unreadable model response', async () => {
  const api = host(async () => new Response(JSON.stringify({ error: { message: `${PROVIDER_TEXT}: ${SECRET}` } }), { status: 401 }));
  const res = await api.request();
  assert.equal(res.status, 502);
});

test('a provider transport failure (timeout/network) returns 502', async () => {
  const api = host(async () => { throw new Error(`connect failed ${PROVIDER_TEXT} ${SECRET}`); });
  const res = await api.request();
  assert.equal(res.status, 502);
});

test('model output that is not JSON is unreadable (422), not a provider failure (502)', async () => {
  const api = host(completion(`not json ${TEXT}`));
  const res = await api.request();
  assert.equal(res.status, 422);
});

test('model output missing required fields is unreadable (422), not a provider failure (502)', async () => {
  const api = host(completion(JSON.stringify({ items: [{ food_type: 'rice' }] })));
  const res = await api.request();
  assert.equal(res.status, 422);
});

for (const [label, provider, status] of [
  ['provider 401 body', async () => new Response(JSON.stringify({ error: { message: `${PROVIDER_TEXT}: ${SECRET}` } }), { status: 401 }), 502],
  ['provider transport error', async () => { throw new Error(`connect failed ${PROVIDER_TEXT} ${SECRET}`); }, 502],
  ['unparseable model output', completion(`not json ${TEXT} ${SECRET}`), 422],
] as any[]) test(`${label}: no provider text, secrets, or meal text reach the client or logs`, async () => {
  const api = host(provider);
  const res = await api.request();
  assert.equal(res.status, status);
  const body = await res.text();
  const logged = logText(api.logs);
  for (const s of [SECRET, PROVIDER_TEXT, TEXT]) {
    assert.equal(body.includes(s), false, `response leaked ${s}`);
    assert.equal(logged.includes(s), false, `console leaked ${s}`);
  }
});

// ---------- Confirm branch ----------
// The RPC (`confirm_nutrition_analysis`) re-checks existence/expiry/item-count
// under a row lock and collapses all of that into one PL/pgSQL exception, so
// the handler previously mapped every RPC rejection to the same 409. That
// conflated "this session is already gone" (an honest, actionable expired/
// not-found case — same status/body this endpoint already uses when the
// pre-check catches it) with a genuine validation problem and with a true
// unexplained conflict. This section pins the handler's mapping of the RPC's
// static (non-user-derived) exception text back onto those existing codes.
const ANALYSIS_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VALID_CONFIRM_ITEM = {
  food_type: 'rice', estimated_weight_g: 100, estimated_calories: 200,
  protein_g: 5, carbs_g: 40, fat_g: 2, confidence: 0.9, catalog_match: 'none', reason: 'estimate',
};

function hostConfirm(options: { rpcError?: { message: string } | null; sessionFound?: boolean } = {}) {
  let handler: (req: Request) => Promise<Response>;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'verified-owner' } }, error: null }) },
    rpc: async (name: string) => {
      if (name === 'cleanup_expired_nutrition_analysis_sessions') return { data: null, error: null };
      if (name === 'confirm_nutrition_analysis') {
        return 'rpcError' in options
          ? { data: null, error: options.rpcError }
          : { data: { analysis_id: ANALYSIS_ID, entries: [] }, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (
            options.sessionFound === false
              ? { data: null, error: null }
              : { data: { id: ANALYSIS_ID, user_id: 'verified-owner', expires_at: new Date(Date.now() + 60_000).toISOString() }, error: null }
          ),
        }),
      }),
    }),
  };
  function load(url: URL): any {
    const exports = {};
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, {
      exports, Request, Response, URL, Uint8Array, atob, JSON, Date, fetch: async () => { throw new Error('unexpected fetch'); },
      console: { error: () => {}, warn: () => {}, log: () => {} },
      Deno: { env: { get: () => 'fixture' } },
      require(name: string) {
        if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
        if (name.includes('supabase-js')) return { createClient: () => client };
        throw new Error(`Unexpected dependency ${name}`);
      },
    });
    return exports;
  }
  load(new URL('./index.ts', import.meta.url));
  return {
    request: () => handler!(new Request('https://fixture.invalid/', {
      method: 'POST',
      headers: { Authorization: 'Bearer fixture' },
      body: JSON.stringify({
        action: 'confirm', analysis_id: ANALYSIS_ID, date: '2026-09-24',
        meal_slot: 'lunch', items: [VALID_CONFIRM_ITEM],
      }),
    })),
  };
}

test('confirm succeeds when the RPC succeeds', async () => {
  const res = await hostConfirm().request();
  assert.equal(res.status, 200);
});

for (const [label, message, expectedStatus, expectedError] of [
  ['analysis not found', 'analysis not found', 404, 'Analysis not found'],
  ['analysis expired (race between pre-check and RPC)', 'analysis expired', 404, 'Analysis not found'],
  ['item count mismatch', 'item count mismatch', 400, 'Invalid confirmation'],
  ['invalid analysis confirmation', 'invalid analysis confirmation', 400, 'Invalid confirmation'],
  ['an unexplained RPC failure', 'some other db error', 409, 'Confirmation failed'],
] as const) test(`RPC rejection "${label}" maps to ${expectedStatus}, not a generic 409`, async () => {
  const res = await hostConfirm({ rpcError: { message } }).request();
  assert.equal(res.status, expectedStatus);
  const body = await res.json();
  assert.equal(body.error, expectedError);
});

test('the pre-check 404 (session already gone before the RPC runs) still returns "Analysis not found"', async () => {
  const res = await hostConfirm({ sessionFound: false }).request();
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'Analysis not found');
});
