import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real webhook handler; only the runtime bootstrap and the database boundary are isolated.
const AUTH = 'fixture-webhook-auth';
const UID = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';

function host(eventInsertError: { code: string; message: string } | null) {
  let handler: (request: Request) => Promise<Response>;
  const ops: string[] = [];
  const client = {
    from(table: string) {
      return {
        insert() {
          ops.push(`${table}.insert`);
          return Promise.resolve({ error: table === 'subscription_events' ? eventInsertError : null });
        },
        delete() {
          ops.push(`${table}.delete`);
          return { eq: () => Promise.resolve({ error: null }) };
        },
        upsert() {
          ops.push(`${table}.upsert`);
          return { select: () => ({ single: async () => ({ data: { id: 'sub-1' }, error: null }) }) };
        },
      };
    },
  };
  const env: Record<string, string> = { REVENUECAT_WEBHOOK_AUTH: AUTH, SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture' };
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: {}, Request, Response, URL, console: { log() {}, warn() {}, error() {} },
    Deno: { env: { get: (name: string) => env[name] } }, require(name: string) {
      if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name.includes('supabase-js')) return { createClient: () => client };
      if (name.includes('_shared/entitlements')) {
        return {
          activateProEntitlement: async () => { ops.push('activate'); return { error: null }; },
          expireProEntitlement: async () => { ops.push('expire'); return { error: null, skipped: false }; },
        };
      }
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const post = (event: Record<string, unknown>) => handler!(new Request('https://fixture.invalid', {
    method: 'POST', headers: { Authorization: AUTH }, body: JSON.stringify({ event }),
  }));
  return { post, ops };
}

const renewal = { id: 'evt-1', type: 'RENEWAL', app_user_id: UID, expiration_at_ms: 1_900_000_000_000, original_transaction_id: 'otx-1' };

test('event for a deleted user (FK 23503) is acknowledged with 200 so RevenueCat stops retrying', async () => {
  const api = host({ code: '23503', message: 'insert or update on table "subscription_events" violates foreign key constraint' });
  const res = await api.post(renewal);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, ignored: 'user_deleted' });
  // Nothing is provisioned for a user that no longer exists.
  assert.deepEqual(api.ops, ['subscription_events.insert']);
});

test('other event-log insert failures still return 500 so RevenueCat retries', async () => {
  const api = host({ code: '08006', message: 'connection failure' });
  const res = await api.post(renewal);
  assert.equal(res.status, 500);
});

test('duplicate delivery (23505) is still short-circuited as a duplicate', async () => {
  const api = host({ code: '23505', message: 'duplicate key' });
  const res = await api.post(renewal);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, duplicate: true });
});

test('a normal renewal still provisions the entitlement', async () => {
  const api = host(null);
  const res = await api.post(renewal);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, provisioned: 'sub_active' });
  assert.ok(api.ops.includes('activate'));
});
