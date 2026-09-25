import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './handler.ts';

// Real handler; only the Supabase clients, fetch, env, clock and logger are injected.
// Captured calls prove the order and scope contract, not deployed GoTrue/Storage/PostgREST.

const UID = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
const EMAIL = 'fixture.person@example.invalid';
const NOW_S = 1_790_000_000;
const RC_KEY = 'sk_fixture_revenuecat_secret';
const APPLE_CODE = 'c0de.fixture-apple-authorization-code';
const APPLE_REFRESH = 'r.fixture-apple-refresh-token';

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function jwt(amr: unknown, sub = UID): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub, email: EMAIL, amr, iat: NOW_S })}.fixture-signature`;
}

const FRESH = jwt([{ method: 'password', timestamp: NOW_S - 60 }]);

type Entry = { name: string; id: string | null };

type Options = {
  token?: string | null;
  invalidToken?: boolean;
  apple?: boolean;
  env?: Record<string, string | undefined>;
  tree?: Record<string, Entry[]>;
  rcStatus?: number;
  rcThrows?: boolean;
  appleTokenStatus?: number;
  appleRevokeStatus?: number;
  listError?: string;
  removeError?: boolean;
  rpcError?: boolean;
  deleteError?: boolean;
};

async function appleKeyPem(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const lines = pkcs8.match(/.{1,64}/g)!.join('\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`, publicKey: pair.publicKey };
}

function host(options: Options = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const listed: { prefix: string; offset: number; limit: number }[] = [];
  const removed: string[][] = [];
  const fetches: { url: string; init: RequestInit }[] = [];
  const rpcs: { name: string; args: unknown }[] = [];
  const deletedUsers: string[] = [];
  const tree = options.tree ?? {};
  const user = {
    id: UID,
    email: EMAIL,
    app_metadata: options.apple ? { provider: 'apple', providers: ['apple'] } : { provider: 'email', providers: ['email'] },
    identities: options.apple ? [{ provider: 'apple' }] : [{ provider: 'email' }],
  };
  const env: Record<string, string | undefined> = { REVENUECAT_SECRET_API_KEY: RC_KEY, ...options.env };
  const bucket = {
    async list(prefix: string, opts: { limit: number; offset: number }) {
      calls.push('storage.list');
      listed.push({ prefix, offset: opts.offset, limit: opts.limit });
      if (options.listError === prefix) return { data: null, error: { message: 'boom', statusCode: '500' } };
      const all = tree[prefix] ?? [];
      return { data: all.slice(opts.offset, opts.offset + opts.limit), error: null };
    },
    async remove(paths: string[]) {
      calls.push('storage.remove');
      removed.push(paths);
      if (options.removeError) return { data: null, error: { message: 'boom' } };
      return { data: paths.map((name) => ({ name })), error: null };
    },
  };
  const deps = {
    createUserClient(token: string) {
      return {
        auth: {
          async getUser(t: string) {
            calls.push('getUser');
            assert.equal(t, token);
            return options.invalidToken
              ? { data: { user: null }, error: { message: 'invalid JWT' } }
              : { data: { user }, error: null };
          },
        },
        storage: {
          from(name: string) {
            assert.equal(name, 'workout-media');
            return bucket;
          },
        },
      };
    },
    admin: {
      async rpc(name: string, args: unknown) {
        calls.push(`rpc:${name}`);
        rpcs.push({ name, args });
        return options.rpcError
          ? { data: null, error: { message: 'db down', code: 'XX000' } }
          : { data: { workouts: 0 }, error: null };
      },
      auth: {
        admin: {
          async deleteUser(id: string) {
            calls.push('auth.deleteUser');
            deletedUsers.push(id);
            return options.deleteError
              ? { data: null, error: { message: `user ${UID} not deleted`, code: 'unexpected_failure', status: 500 } }
              : { data: {}, error: null };
          },
        },
      },
    },
    async fetch(url: string, init: RequestInit) {
      fetches.push({ url, init });
      if (url.startsWith('https://api.revenuecat.com/')) {
        calls.push('rc.delete');
        if (options.rcThrows) throw new Error('network down');
        return new Response(JSON.stringify({ app_user_id: UID, deleted: true }), { status: options.rcStatus ?? 200 });
      }
      if (url === 'https://appleid.apple.com/auth/token') {
        calls.push('apple.token');
        const status = options.appleTokenStatus ?? 200;
        return new Response(status === 200
          ? JSON.stringify({ access_token: 'a.fixture', token_type: 'Bearer', expires_in: 3600, refresh_token: APPLE_REFRESH, id_token: 'x.y.z' })
          : JSON.stringify({ error: 'invalid_grant' }), { status });
      }
      if (url === 'https://appleid.apple.com/auth/revoke') {
        calls.push('apple.revoke');
        return new Response(null, { status: options.appleRevokeStatus ?? 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
    env: (name: string) => env[name],
    now: () => NOW_S * 1000,
    log: (line: string) => { logs.push(line); },
  };
  const handler = createHandler(deps as any);
  const token = options.token === undefined ? FRESH : options.token;
  const send = (body: unknown = { confirm: 'DELETE' }, method = 'POST') => handler(new Request('https://fixture.invalid/delete-account', {
    method,
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  }));
  return { send, handler, calls, logs, listed, removed, fetches, rpcs, deletedUsers };
}

async function errorCode(res: Response): Promise<string> {
  const body = await res.json();
  assert.equal(typeof body.error?.message, 'string');
  return body.error.code;
}

function assertNoPii(logs: string[], extra: string[] = []) {
  for (const line of logs) {
    for (const secret of [UID, EMAIL, FRESH, RC_KEY, APPLE_CODE, APPLE_REFRESH, ...extra]) {
      assert.equal(line.includes(secret), false, `log line leaks a secret: ${line}`);
    }
  }
}

test('OPTIONS preflight returns 200 with CORS and touches nothing', async () => {
  const api = host();
  const res = await api.handler(new Request('https://fixture.invalid', { method: 'OPTIONS' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(api.calls, []);
});

test('non-POST methods return 405 and touch nothing', async () => {
  for (const method of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const api = host();
    const res = await api.send(undefined, method);
    assert.equal(res.status, 405);
    assert.equal(await errorCode(res), 'METHOD_NOT_ALLOWED');
    assert.deepEqual(api.calls, []);
  }
});

test('missing or invalid bearer token returns 401 before any side effect', async () => {
  for (const options of [{ token: null }, { token: '' }, { invalidToken: true }] as Options[]) {
    const api = host(options);
    const res = await api.send();
    assert.equal(res.status, 401);
    assert.equal(await errorCode(res), 'UNAUTHORIZED');
    // Nothing past token verification ran: no RevenueCat, Apple, storage, DB or auth delete.
    assert.deepEqual(api.calls, options.invalidToken ? ['getUser'] : []);
    assert.equal(api.fetches.length, 0);
    assert.equal(api.listed.length, 0);
    assert.equal(api.removed.length, 0);
    assert.equal(api.rpcs.length, 0);
    assert.equal(api.deletedUsers.length, 0);
  }
});

test('token whose sub differs from the verified user is rejected', async () => {
  const api = host({ token: jwt([{ method: 'password', timestamp: NOW_S - 10 }], '00000000-0000-4000-8000-000000000000') });
  const res = await api.send();
  assert.equal(res.status, 401);
  assert.equal(api.fetches.length, 0);
  assert.equal(api.deletedUsers.length, 0);
});

test('confirm must be exactly "DELETE" (400 CONFIRMATION_REQUIRED, no side effects)', async () => {
  for (const body of [{}, { confirm: 'delete' }, { confirm: 'DELETE ' }, { confirm: true }, [], 'not json', { confirm: ['DELETE'] }]) {
    const api = host();
    const res = await api.send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(await errorCode(res), 'CONFIRMATION_REQUIRED');
    assert.equal(api.fetches.length, 0);
    assert.equal(api.deletedUsers.length, 0);
  }
});

test('the uid always comes from the verified token, never from the body', async () => {
  const api = host();
  const res = await api.send({ confirm: 'DELETE', user_id: '00000000-0000-4000-8000-000000000000', uid: 'x' });
  assert.equal(res.status, 200);
  assert.deepEqual(api.deletedUsers, [UID]);
  assert.deepEqual(api.rpcs, [{ name: 'delete_user_data', args: { p_user_id: UID } }]);
  assert.equal(api.fetches[0].url, `https://api.revenuecat.com/v1/subscribers/${UID}`);
});

test('stale sign-in (amr older than 5 minutes) returns 403 REAUTH_REQUIRED', async () => {
  for (const amr of [
    [{ method: 'password', timestamp: NOW_S - 301 }],
    [{ method: 'oauth', timestamp: NOW_S - 3600 }, { method: 'password', timestamp: NOW_S - 7200 }],
    undefined,
    [],
    'password',
    [{ method: 'password' }],
    [{ method: 'password', timestamp: 'recent' }],
  ]) {
    const api = host({ token: jwt(amr) });
    const res = await api.send();
    assert.equal(res.status, 403, JSON.stringify(amr));
    assert.equal(await errorCode(res), 'REAUTH_REQUIRED');
    assert.equal(api.fetches.length, 0);
    assert.equal(api.calls.includes('storage.list'), false);
    assert.equal(api.deletedUsers.length, 0);
  }
});

test('a token refreshed just now but signed in long ago is not a recent sign-in (403)', async () => {
  for (const amr of [
    [{ method: 'token_refresh', timestamp: NOW_S - 5 }],
    [{ method: 'token_refresh', timestamp: NOW_S - 5 }, { method: 'password', timestamp: NOW_S - 86_400 }],
  ]) {
    const api = host({ token: jwt(amr) });
    const res = await api.send();
    assert.equal(res.status, 403);
    assert.equal(await errorCode(res), 'REAUTH_REQUIRED');
    assert.equal(api.fetches.length, 0);
  }
});

test('an unparseable access token payload fails closed with 403', async () => {
  const api = host({ token: 'not-a-jwt' });
  const res = await api.send();
  assert.equal(res.status, 403);
  assert.equal(api.fetches.length, 0);
});

test('sign-ins within 5 minutes pass, including a far-future timestamp being refused', async () => {
  const ok = host({ token: jwt([{ method: 'oauth', timestamp: NOW_S - 300 }, { method: 'token_refresh', timestamp: NOW_S }]) });
  assert.equal((await ok.send()).status, 200);
  const future = host({ token: jwt([{ method: 'password', timestamp: NOW_S + 3600 }]) });
  assert.equal((await future.send()).status, 403);
});

test('missing RevenueCat secret returns 500 CONFIG_MISSING before any deletion', async () => {
  const api = host({ env: { REVENUECAT_SECRET_API_KEY: undefined } });
  const res = await api.send();
  assert.equal(res.status, 500);
  assert.equal(await errorCode(res), 'CONFIG_MISSING');
  assert.equal(api.fetches.length, 0);
  assert.equal(api.calls.includes('storage.list'), false);
  assert.equal(api.rpcs.length, 0);
  assert.equal(api.deletedUsers.length, 0);
});

test('RevenueCat DELETE uses the secret key and a URL-encoded uid', async () => {
  const api = host();
  await api.send();
  const rc = api.fetches[0];
  assert.equal(rc.url, `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(UID)}`);
  assert.equal(rc.init.method, 'DELETE');
  assert.equal((rc.init.headers as Record<string, string>).Authorization, `Bearer ${RC_KEY}`);
});

test('RevenueCat 500 (or network failure) returns 502 with no storage, DB or auth calls', async () => {
  for (const options of [{ rcStatus: 500 }, { rcStatus: 401 }, { rcStatus: 429 }, { rcThrows: true }] as Options[]) {
    const api = host({ ...options, tree: { [UID]: [{ name: 'a.jpg', id: '1' }] } });
    const res = await api.send();
    assert.equal(res.status, 502);
    assert.equal(await errorCode(res), 'REVENUECAT_DELETE_FAILED');
    assert.deepEqual(api.calls, ['getUser', 'rc.delete']);
    assert.equal(api.logs.length, 1);
    assertNoPii(api.logs);
  }
});

test('RevenueCat 404 counts as already deleted and the flow proceeds', async () => {
  const api = host({ rcStatus: 404 });
  const res = await api.send();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(api.deletedUsers, [UID]);
});

test('Apple user without Apple secrets logs one apple_revoke_failed line and proceeds', async () => {
  const api = host({ apple: true });
  const res = await api.send({ confirm: 'DELETE', apple_authorization_code: APPLE_CODE });
  assert.equal(res.status, 200);
  assert.deepEqual(api.logs, ['delete-account: apple_revoke_failed reason=missing_secret']);
  assert.equal(api.fetches.some((f) => f.url.includes('appleid.apple.com')), false);
  assert.deepEqual(api.deletedUsers, [UID]);
});

test('Apple user without an authorization code logs missing_code and proceeds', async () => {
  const { pem } = await appleKeyPem();
  const env = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: pem, APPLE_CLIENT_ID: 'com.coachkettle.coachkettle' };
  for (const body of [{ confirm: 'DELETE' }, { confirm: 'DELETE', apple_authorization_code: '' }, { confirm: 'DELETE', apple_authorization_code: 42 }]) {
    const api = host({ apple: true, env });
    const res = await api.send(body);
    assert.equal(res.status, 200);
    assert.deepEqual(api.logs, ['delete-account: apple_revoke_failed reason=missing_code']);
    assert.equal(api.fetches.some((f) => f.url.includes('appleid.apple.com')), false);
    assert.deepEqual(api.deletedUsers, [UID]);
  }
});

test('Apple happy path exchanges the code for a refresh token, then revokes it', async () => {
  const { pem, publicKey } = await appleKeyPem();
  // Secrets pasted into a dashboard often arrive with literal "\n" sequences.
  const env = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: pem.replace(/\n/g, '\\n'), APPLE_CLIENT_ID: 'com.coachkettle.coachkettle' };
  const api = host({ apple: true, env });
  const res = await api.send({ confirm: 'DELETE', apple_authorization_code: APPLE_CODE });
  assert.equal(res.status, 200);
  assert.deepEqual(api.calls, ['getUser', 'rc.delete', 'apple.token', 'apple.revoke', 'storage.list', 'rpc:delete_user_data', 'auth.deleteUser']);
  assert.deepEqual(api.logs, []);

  const tokenCall = api.fetches.find((f) => f.url === 'https://appleid.apple.com/auth/token')!;
  assert.equal(tokenCall.init.method, 'POST');
  assert.equal((tokenCall.init.headers as Record<string, string>)['Content-Type'], 'application/x-www-form-urlencoded');
  const tokenForm = new URLSearchParams(String(tokenCall.init.body));
  assert.equal(tokenForm.get('client_id'), 'com.coachkettle.coachkettle');
  assert.equal(tokenForm.get('code'), APPLE_CODE);
  assert.equal(tokenForm.get('grant_type'), 'authorization_code');
  assert.equal(tokenForm.has('redirect_uri'), false);

  const secret = tokenForm.get('client_secret')!;
  const [h, p, s] = secret.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'ES256', kid: 'KEY1234567' });
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.equal(claims.iss, 'TEAM123456');
  assert.equal(claims.sub, 'com.coachkettle.coachkettle');
  assert.equal(claims.aud, 'https://appleid.apple.com');
  assert.equal(claims.iat, NOW_S);
  assert.ok(claims.exp > NOW_S && claims.exp - NOW_S <= 15_777_000);
  const signature = Buffer.from(s, 'base64url');
  assert.equal(signature.length, 64, 'ES256 JWS signature must be raw r||s');
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, new TextEncoder().encode(`${h}.${p}`)));

  const revokeCall = api.fetches.find((f) => f.url === 'https://appleid.apple.com/auth/revoke')!;
  const revokeForm = new URLSearchParams(String(revokeCall.init.body));
  assert.equal(revokeForm.get('client_id'), 'com.coachkettle.coachkettle');
  assert.equal(revokeForm.get('client_secret'), secret);
  assert.equal(revokeForm.get('token'), APPLE_REFRESH);
  assert.equal(revokeForm.get('token_type_hint'), 'refresh_token');
});

test('Apple token or revoke error logs http_<status> and the deletion still completes', async () => {
  const { pem } = await appleKeyPem();
  const env = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: pem, APPLE_CLIENT_ID: 'com.coachkettle.coachkettle' };
  const tokenFail = host({ apple: true, env, appleTokenStatus: 400 });
  assert.equal((await tokenFail.send({ confirm: 'DELETE', apple_authorization_code: APPLE_CODE })).status, 200);
  assert.deepEqual(tokenFail.logs, ['delete-account: apple_revoke_failed reason=http_400']);
  assert.equal(tokenFail.calls.includes('apple.revoke'), false);
  assert.deepEqual(tokenFail.deletedUsers, [UID]);

  const revokeFail = host({ apple: true, env, appleRevokeStatus: 503 });
  assert.equal((await revokeFail.send({ confirm: 'DELETE', apple_authorization_code: APPLE_CODE })).status, 200);
  assert.deepEqual(revokeFail.logs, ['delete-account: apple_revoke_failed reason=http_503']);
  assert.deepEqual(revokeFail.deletedUsers, [UID]);
  assertNoPii([...tokenFail.logs, ...revokeFail.logs]);
});

test('non-Apple users never call Apple even when a code is supplied', async () => {
  const api = host();
  assert.equal((await api.send({ confirm: 'DELETE', apple_authorization_code: APPLE_CODE })).status, 200);
  assert.equal(api.fetches.some((f) => f.url.includes('appleid.apple.com')), false);
  assert.deepEqual(api.logs, []);
});

test('storage sweep recurses nested folders with pagination and removes every path in batches of <= 100', async () => {
  const workout = 'w-1';
  const rootFiles: Entry[] = Array.from({ length: 150 }, (_, i) => ({ name: `root-${String(i).padStart(3, '0')}.jpg`, id: `r${i}` }));
  const workoutFiles: Entry[] = Array.from({ length: 205 }, (_, i) => ({ name: `m-${String(i).padStart(3, '0')}.mp4`, id: `m${i}` }));
  const tree: Record<string, Entry[]> = {
    [UID]: [{ name: 'body', id: null }, { name: workout, id: null }, ...rootFiles],
    [`${UID}/body`]: [{ name: 'p1.jpg', id: 'p1' }, { name: 'old', id: null }],
    [`${UID}/body/old`]: [{ name: 'deep.jpg', id: 'd1' }],
    [`${UID}/${workout}`]: workoutFiles,
    // Another user's folder must never be listed or removed.
    ['00000000-0000-4000-8000-000000000000']: [{ name: 'x.jpg', id: 'x' }],
  };
  const api = host({ tree });
  const res = await api.send();
  assert.equal(res.status, 200);

  const expected = [
    ...rootFiles.map((f) => `${UID}/${f.name}`),
    `${UID}/body/p1.jpg`,
    `${UID}/body/old/deep.jpg`,
    ...workoutFiles.map((f) => `${UID}/${workout}/${f.name}`),
  ].sort();
  const all = api.removed.flat();
  assert.deepEqual([...all].sort(), expected);
  assert.equal(new Set(all).size, all.length, 'no path removed twice');
  for (const batch of api.removed) assert.ok(batch.length >= 1 && batch.length <= 100, `batch size ${batch.length}`);
  for (const path of all) assert.ok(path.startsWith(`${UID}/`) && !path.split('/').includes('..'));
  for (const l of api.listed) assert.ok(l.prefix === UID || l.prefix.startsWith(`${UID}/`));
  // Pagination walked past the first page of the root and the workout folder.
  assert.ok(api.listed.some((l) => l.prefix === UID && l.offset > 0));
  assert.ok(api.listed.some((l) => l.prefix === `${UID}/${workout}` && l.offset >= 200));
  // Listing finishes before any removal, so offset pagination never skips objects.
  const firstRemove = api.calls.indexOf('storage.remove');
  assert.equal(api.calls.lastIndexOf('storage.list') < firstRemove, true);
});

test('storage sweep is capped at 200 list calls and fails before any removal, DB purge or auth delete', async () => {
  // 250 sub-folders need 3 root pages + 250 folder lists = 253 list calls, past the cap.
  const tree: Record<string, Entry[]> = { [UID]: Array.from({ length: 250 }, (_, i) => ({ name: `f${i}`, id: null })) };
  for (let i = 0; i < 250; i++) tree[`${UID}/f${i}`] = [{ name: 'a.jpg', id: `a${i}` }];
  const api = host({ tree });
  const res = await api.send();
  assert.equal(res.status, 500);
  assert.equal(await errorCode(res), 'STORAGE_DELETE_FAILED');
  assert.equal(api.listed.length, 200);
  assert.equal(api.removed.length, 0);
  assert.equal(api.rpcs.length, 0);
  assert.equal(api.deletedUsers.length, 0);
  assert.deepEqual(api.logs, ['delete-account: step_failed step=storage reason=list_cap']);

  // Exactly at the cap (198 sub-folders: 2 root pages + 198 folder lists = 200) still completes.
  const ok: Record<string, Entry[]> = { [UID]: Array.from({ length: 198 }, (_, i) => ({ name: `f${i}`, id: null })) };
  for (let i = 0; i < 198; i++) ok[`${UID}/f${i}`] = [{ name: 'a.jpg', id: `a${i}` }];
  const fine = host({ tree: ok });
  assert.equal((await fine.send()).status, 200);
  assert.equal(fine.listed.length, 200);
  assert.equal(fine.removed.flat().length, 198);
});

test('an empty storage prefix issues no remove call and the flow continues', async () => {
  const api = host();
  assert.equal((await api.send()).status, 200);
  assert.equal(api.removed.length, 0);
  assert.deepEqual(api.deletedUsers, [UID]);
});

test('unsafe storage entry names abort the sweep before any removal', async () => {
  for (const name of ['..', '.', '', 'a/b']) {
    const api = host({ tree: { [UID]: [{ name: 'ok.jpg', id: '1' }, { name, id: null }] } });
    const res = await api.send();
    assert.equal(res.status, 500);
    assert.equal(await errorCode(res), 'STORAGE_DELETE_FAILED');
    assert.equal(api.removed.length, 0);
    assert.equal(api.rpcs.length, 0);
    assert.equal(api.deletedUsers.length, 0);
  }
});

test('storage list or remove error returns 500 with no DB purge and no auth delete', async () => {
  for (const options of [
    { listError: `${UID}/body`, tree: { [UID]: [{ name: 'body', id: null }] } },
    { removeError: true, tree: { [UID]: [{ name: 'a.jpg', id: '1' }] } },
  ] as Options[]) {
    const api = host(options);
    const res = await api.send();
    assert.equal(res.status, 500);
    assert.equal(await errorCode(res), 'STORAGE_DELETE_FAILED');
    assert.equal(api.rpcs.length, 0);
    assert.equal(api.deletedUsers.length, 0);
    assertNoPii(api.logs);
  }
});

test('DB purge error returns 500 DB_PURGE_FAILED and never deletes the auth user', async () => {
  const api = host({ rpcError: true });
  const res = await api.send();
  assert.equal(res.status, 500);
  assert.equal(await errorCode(res), 'DB_PURGE_FAILED');
  assert.equal(api.deletedUsers.length, 0);
  assertNoPii(api.logs);
});

test('auth delete error returns 500 AUTH_DELETE_FAILED and logs only the error code', async () => {
  const api = host({ deleteError: true });
  const res = await api.send();
  assert.equal(res.status, 500);
  assert.equal(await errorCode(res), 'AUTH_DELETE_FAILED');
  assert.deepEqual(api.logs, ['delete-account: step_failed step=auth_delete code=unexpected_failure']);
});

test('full success runs RC -> apple -> storage -> delete_user_data -> auth delete in order', async () => {
  const { pem } = await appleKeyPem();
  const env = { APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: pem, APPLE_CLIENT_ID: 'com.coachkettle.coachkettle' };
  const api = host({ apple: true, env, tree: { [UID]: [{ name: 'a.jpg', id: '1' }] } });
  const res = await api.send({ confirm: 'DELETE', apple_authorization_code: APPLE_CODE });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.deepEqual(api.calls, ['getUser', 'rc.delete', 'apple.token', 'apple.revoke', 'storage.list', 'storage.remove', 'rpc:delete_user_data', 'auth.deleteUser']);
  assert.deepEqual(api.removed, [[`${UID}/a.jpg`]]);
  assert.deepEqual(api.deletedUsers, [UID]);
});

test('no log line or error body contains the uid, email, token or provider secrets', async () => {
  const bodies: string[] = [];
  const logs: string[] = [];
  const scenarios: Options[] = [
    { rcStatus: 500 }, { rcThrows: true }, { apple: true }, { apple: true, appleTokenStatus: 400, env: { APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K', APPLE_PRIVATE_KEY: 'not a pem', APPLE_CLIENT_ID: 'c' } },
    { listError: UID }, { removeError: true, tree: { [UID]: [{ name: 'a.jpg', id: '1' }] } }, { rpcError: true }, { deleteError: true },
    { token: jwt([{ method: 'password', timestamp: 1 }]) }, { invalidToken: true },
  ];
  for (const options of scenarios) {
    const api = host(options);
    const res = await api.send({ confirm: 'DELETE', apple_authorization_code: APPLE_CODE });
    bodies.push(await res.text());
    logs.push(...api.logs);
  }
  assert.ok(logs.length > 0);
  assertNoPii([...logs, ...bodies]);
});
