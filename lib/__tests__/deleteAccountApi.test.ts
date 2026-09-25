import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real lib/api.ts; only its imports are stubbed. fetchWithAuth is the transport boundary.
function load(respond: () => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit }[] = [];
  const exports: any = {};
  const source = readFileSync(new URL('../api.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Error, JSON, Response, require: (name: string) => {
      if (name === './supabase') return { supabaseUrl: 'https://fixture.supabase.co' };
      if (name === './auth') return { fetchWithAuth: async (url: string, init: RequestInit) => { requests.push({ url, init }); return respond(); } };
      return {};
    },
  });
  return { exports, requests };
}

const errorResponse = (status: number, code: string) =>
  new Response(JSON.stringify({ error: { code, message: 'generic' } }), { status });

test('deleteAccount POSTs the typed confirmation to the delete-account function', async () => {
  const { exports, requests } = load(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  assert.deepEqual(await exports.api.deleteAccount(), { ok: true });
  assert.equal(requests[0].url, 'https://fixture.supabase.co/functions/v1/delete-account');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { confirm: 'DELETE' });
});

test('deleteAccount forwards the Apple authorization code only when given', async () => {
  const { exports, requests } = load(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  await exports.api.deleteAccount({ appleAuthorizationCode: 'apple-code' });
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { confirm: 'DELETE', apple_authorization_code: 'apple-code' });
});

test('REAUTH_REQUIRED surfaces as a distinct DeleteAccountError', async () => {
  const { exports } = load(() => errorResponse(403, 'REAUTH_REQUIRED'));
  await assert.rejects(exports.api.deleteAccount(), (error: any) => {
    assert.ok(error instanceof exports.DeleteAccountError);
    assert.equal(error.code, 'REAUTH_REQUIRED');
    assert.equal(error.status, 403);
    assert.equal(error.name, 'DeleteAccountError');
    return true;
  });
});

test('server step codes are preserved; unknown or non-JSON bodies get a null code', async () => {
  for (const [status, code] of [[502, 'REVENUECAT_DELETE_FAILED'], [500, 'AUTH_DELETE_FAILED'], [400, 'CONFIRMATION_REQUIRED']] as const) {
    const { exports } = load(() => errorResponse(status, code));
    await assert.rejects(exports.api.deleteAccount(), (error: any) => error.code === code && error.status === status);
  }
  for (const respond of [() => errorResponse(500, 'SOMETHING_NEW'), () => new Response('<html>gateway</html>', { status: 504 })]) {
    const { exports } = load(respond);
    await assert.rejects(exports.api.deleteAccount(), (error: any) => error instanceof exports.DeleteAccountError && error.code === null);
  }
});
