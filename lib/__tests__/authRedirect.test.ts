import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('../../', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), 'utf8');
// Objects built inside a vm context have foreign prototypes; compare their JSON shape.
const plain = (value: any) => JSON.parse(JSON.stringify(value));

// expo-linking's parse() exposes only the query string; the hash is left to the fallback.
const linkingParse = (url: string) => {
  const params = new URL(url.split('#')[0]).searchParams;
  return { queryParams: [...params.keys()].length ? Object.fromEntries(params) : null };
};

function loadAuthRedirect(opts: { oauth?: any; browser?: any; exchange?: any; setSession?: any } = {}) {
  const calls: any[] = [];
  const supabase = {
    auth: {
      signInWithOAuth: async (args: any) => { calls.push(['signInWithOAuth', args]); return opts.oauth ?? { data: { url: 'https://auth/authorize' }, error: null }; },
      exchangeCodeForSession: async (code: string) => { calls.push(['exchangeCodeForSession', code]); return opts.exchange ?? { data: { user: { id: 'u1' }, session: {} }, error: null }; },
      setSession: async (args: any) => { calls.push(['setSession', args]); return opts.setSession ?? { data: { user: { id: 'u1' }, session: {} }, error: null }; },
    },
  };
  const exports: any = {};
  const code = ts.transpileModule(read('lib/authRedirect.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Error, decodeURIComponent, require: (name: string) => {
    if (name === 'expo-linking') return { parse: linkingParse };
    if (name === 'expo-web-browser') return { openAuthSessionAsync: async (...args: any[]) => { calls.push(['openAuthSessionAsync', ...args]); return opts.browser ?? { type: 'success', url: 'coachkettle://auth/callback?code=abc' }; } };
    if (name === '@/lib/supabase') return { supabase };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  return { exports, calls };
}

// ---------- parseAuthRedirectParams ----------

test('query params (PKCE code) are returned as-is', () => {
  const { exports } = loadAuthRedirect();
  assert.deepEqual(plain(exports.parseAuthRedirectParams('coachkettle://auth/callback?code=abc123')), { code: 'abc123' });
});

test('with no query, implicit-flow tokens are read from the hash and URL-decoded', () => {
  const { exports } = loadAuthRedirect();
  const url = 'coachkettle://auth/callback#access_token=a.b.c&refresh_token=r%2Fx&token_type=bearer&expires_in=3600';
  assert.deepEqual(plain(exports.parseAuthRedirectParams(url)), {
    access_token: 'a.b.c', refresh_token: 'r/x', token_type: 'bearer', expires_in: '3600',
  });
});

test('a non-empty query wins; the hash is ignored', () => {
  const { exports } = loadAuthRedirect();
  assert.deepEqual(plain(exports.parseAuthRedirectParams('coachkettle://auth/callback?code=q#access_token=h')), { code: 'q' });
});

test('provider error params come through from the query or the hash', () => {
  const { exports } = loadAuthRedirect();
  assert.deepEqual(plain(exports.parseAuthRedirectParams('coachkettle://auth/callback?error=access_denied&error_description=User%20denied')),
    { error: 'access_denied', error_description: 'User denied' });
  assert.deepEqual(plain(exports.parseAuthRedirectParams('coachkettle://auth/callback#error=server_error&error_description=Oops%21')),
    { error: 'server_error', error_description: 'Oops!' });
});

test('missing tokens: no query and no hash, an empty hash, or valueless pairs give no params', () => {
  const { exports } = loadAuthRedirect();
  for (const url of ['coachkettle://auth/callback', 'coachkettle://auth/callback#', 'coachkettle://auth/callback#access_token=&refresh_token']) {
    assert.deepEqual(plain(exports.parseAuthRedirectParams(url)), {}, url);
  }
  assert.deepEqual(plain(exports.parseAuthRedirectParams('coachkettle://auth/callback#access_token=only')), { access_token: 'only' });
});

// ---------- establishSessionFromParams ----------

test('a code is exchanged (PKCE) and the user id returned', async () => {
  const { exports, calls } = loadAuthRedirect();
  assert.deepEqual(plain(await exports.establishSessionFromParams({ code: 'abc', access_token: 'ignored' })), { userId: 'u1' });
  assert.deepEqual(plain(calls), [['exchangeCodeForSession', 'abc']]);
});

test('tokens set the session; a missing refresh token becomes an empty string (as sign-in did)', async () => {
  const { exports, calls } = loadAuthRedirect();
  await exports.establishSessionFromParams({ access_token: 'a', refresh_token: 'r' });
  await exports.establishSessionFromParams({ access_token: 'a' });
  assert.deepEqual(plain(calls), [['setSession', { access_token: 'a', refresh_token: 'r' }], ['setSession', { access_token: 'a', refresh_token: '' }]]);
});

test('Supabase errors and provider error params are thrown; nothing usable returns null', async () => {
  const exchangeError = { message: 'bad code' };
  let loaded = loadAuthRedirect({ exchange: { data: null, error: exchangeError } });
  await assert.rejects(loaded.exports.establishSessionFromParams({ code: 'x' }), (e: any) => e === exchangeError);
  loaded = loadAuthRedirect({ setSession: { data: null, error: { message: 'bad token' } } });
  await assert.rejects(loaded.exports.establishSessionFromParams({ access_token: 'x' }), (e: any) => e.message === 'bad token');
  loaded = loadAuthRedirect();
  await assert.rejects(loaded.exports.establishSessionFromParams({ error: 'access_denied', error_description: 'User denied' }), { message: 'User denied' });
  await assert.rejects(loaded.exports.establishSessionFromParams({ error: 'access_denied' }), { message: 'access_denied' });
  assert.equal(await loaded.exports.establishSessionFromParams({}), null);
  assert.equal(await loaded.exports.establishSessionFromParams({ refresh_token: 'r', token_type: 'bearer' }), null);
  assert.deepEqual(loaded.calls, []);
});

// ---------- openOAuthSession ----------

test('OAuth session: same request as sign-in made, redirect parsed on success', async () => {
  const { exports, calls } = loadAuthRedirect({ browser: { type: 'success', url: 'coachkettle://auth/callback#access_token=t' } });
  assert.deepEqual(plain(await exports.openOAuthSession('google', 'coachkettle://auth/callback')), { type: 'success', params: { access_token: 't' } });
  assert.deepEqual(plain(calls), [
    ['signInWithOAuth', { provider: 'google', options: { redirectTo: 'coachkettle://auth/callback', skipBrowserRedirect: true } }],
    ['openAuthSessionAsync', 'https://auth/authorize', 'coachkettle://auth/callback', { showInRecents: true }],
  ]);
});

test('OAuth session: dismiss is reported, cancel / url-less success / no authorize URL are "other", a Supabase error throws', async () => {
  assert.deepEqual(plain(await loadAuthRedirect({ browser: { type: 'dismiss' } }).exports.openOAuthSession('google', 'r')), { type: 'dismiss' });
  assert.deepEqual(plain(await loadAuthRedirect({ browser: { type: 'cancel' } }).exports.openOAuthSession('google', 'r')), { type: 'other' });
  assert.deepEqual(plain(await loadAuthRedirect({ browser: { type: 'success' } }).exports.openOAuthSession('google', 'r')), { type: 'other' });
  const noUrl = loadAuthRedirect({ oauth: { data: { url: null }, error: null } });
  assert.deepEqual(plain(await noUrl.exports.openOAuthSession('google', 'r')), { type: 'other' });
  assert.equal(noUrl.calls.some(([name]: any[]) => name === 'openAuthSessionAsync'), false);
  const oauthError = { message: 'provider disabled' };
  await assert.rejects(loadAuthRedirect({ oauth: { data: null, error: oauthError } }).exports.openOAuthSession('google', 'r'), (e: any) => e === oauthError);
});

// ---------- one parser ----------

function sourceFiles(dir: string): string[] {
  return readdirSync(new URL(dir, root)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(new URL(rel, root)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
}

test('the hash fallback exists only in lib/authRedirect.ts, and sign-in, callback and reauth use it', () => {
  const copies = [...sourceFiles('app'), ...sourceFiles('lib'), ...sourceFiles('components'), ...sourceFiles('contexts')]
    .filter((file) => read(file).includes(".split('#')"));
  assert.deepEqual(copies, ['lib/authRedirect.ts']);
  for (const file of ['app/auth/sign-in.tsx', 'app/auth/callback.tsx', 'lib/reauth.ts']) {
    assert.match(read(file), /from '@\/lib\/authRedirect'/, file);
  }
  const signIn = read('app/auth/sign-in.tsx');
  assert.match(signIn, /openOAuthSession\(provider, redirectTo\)/);
  assert.equal((signIn.match(/establishSessionFromParams\(/g) ?? []).length, 2);
  assert.doesNotMatch(signIn, /exchangeCodeForSession|signInWithOAuth\(\{/);
});
