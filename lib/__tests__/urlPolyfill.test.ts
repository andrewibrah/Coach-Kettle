import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// lib/supabase.ts installs react-native-url-polyfill/auto as the global URL /
// URLSearchParams. These tests run the installed polyfill (not Node's URL) on
// the URL operations the auth, deep-link and Supabase client paths rely on.

const pkgDir = fileURLToPath(new URL('../../node_modules/react-native-url-polyfill/', import.meta.url));
const pkgRequire = createRequire(path.join(pkgDir, 'package.json'));
const cache = new Map<string, any>();

function load(file: string): any {
  const cached = cache.get(file);
  if (cached) return cached;
  const exports: any = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'react-native') return { NativeModules: {} };
    if (name.startsWith('.')) {
      const resolved = path.resolve(path.dirname(file), name);
      return load(resolved.endsWith('.js') ? resolved : `${resolved}.js`);
    }
    return pkgRequire(name);
  } });
  return exports;
}

const { URL: PolyURL } = load(path.join(pkgDir, 'js/URL.js'));
const { URLSearchParams: PolyURLSearchParams } = load(path.join(pkgDir, 'js/URLSearchParams.js'));
const entries = (params: any) => {
  const out: [string, string][] = [];
  params.forEach((value: string, key: string) => out.push([key, value]));
  return out;
};

// ---------- Supabase client construction (supabase-js SupabaseClient) ----------

const supabaseBase = 'https://vjfteiuxsdqdozhljxhd.supabase.co/';

test('the persisted session storage key is derived from the project hostname', () => {
  const base = new PolyURL(supabaseBase);
  assert.equal(`sb-${base.hostname.split('.')[0]}-auth-token`, 'sb-vjfteiuxsdqdozhljxhd-auth-token');
});

test('service URLs resolve against the project base URL', () => {
  const base = new PolyURL(supabaseBase);
  assert.equal(new PolyURL('auth/v1', base).href, 'https://vjfteiuxsdqdozhljxhd.supabase.co/auth/v1');
  assert.equal(new PolyURL('rest/v1', base).href, 'https://vjfteiuxsdqdozhljxhd.supabase.co/rest/v1');
  assert.equal(new PolyURL('functions/v1', base).href, 'https://vjfteiuxsdqdozhljxhd.supabase.co/functions/v1');
  assert.equal(new PolyURL('storage/v1', base).href, 'https://vjfteiuxsdqdozhljxhd.supabase.co/storage/v1');
});

test('the realtime URL switches to wss through the protocol setter', () => {
  const realtime = new PolyURL('realtime/v1', new PolyURL(supabaseBase));
  realtime.protocol = realtime.protocol.replace('http', 'ws');
  assert.equal(realtime.href, 'wss://vjfteiuxsdqdozhljxhd.supabase.co/realtime/v1');
});

test('an Edge Function invoke URL keeps its path', () => {
  const url = new PolyURL('https://vjfteiuxsdqdozhljxhd.supabase.co/functions/v1/chat');
  assert.equal(url.href, 'https://vjfteiuxsdqdozhljxhd.supabase.co/functions/v1/chat');
  assert.equal(url.pathname, '/functions/v1/chat');
});

// ---------- Auth request query strings (auth-js) ----------

test('redirect_to is form-encoded into the auth request query', () => {
  const qs = new PolyURLSearchParams({ redirect_to: 'coachkettle://auth/callback' }).toString();
  assert.equal(qs, 'redirect_to=coachkettle%3A%2F%2Fauth%2Fcallback');
});

test('PKCE challenge params serialize in insertion order', () => {
  const qs = new PolyURLSearchParams({ code_challenge: 'abc-_DEF', code_challenge_method: 's256' }).toString();
  assert.equal(qs, 'code_challenge=abc-_DEF&code_challenge_method=s256');
});

// ---------- PostgREST filters (postgrest-js) ----------

test('PostgREST filter values keep their operators and are encoded', () => {
  const url = new PolyURL('https://vjfteiuxsdqdozhljxhd.supabase.co/rest/v1/pr_history');
  url.searchParams.set('select', '*');
  url.searchParams.append('user_id', 'eq.4f1c2a9e-0000-4000-8000-000000000001');
  url.searchParams.append('lift', 'in.("Bench Press",Squat)');
  url.searchParams.set('order', 'created_at.desc.nullslast');
  assert.equal(
    url.href,
    'https://vjfteiuxsdqdozhljxhd.supabase.co/rest/v1/pr_history?select=*&user_id=eq.4f1c2a9e-0000-4000-8000-000000000001&lift=in.%28%22Bench+Press%22%2CSquat%29&order=created_at.desc.nullslast',
  );
});

// ---------- Auth redirect deep links (expo-linking parse, auth-js helpers) ----------

test('a custom-scheme PKCE redirect exposes scheme, host, path and code', () => {
  const url = new PolyURL('coachkettle://auth/callback?code=abc123');
  assert.equal(url.protocol, 'coachkettle:');
  assert.equal(url.hostname, 'auth');
  assert.equal(url.pathname, '/callback');
  assert.equal(url.hash, '');
  assert.deepEqual(entries(url.searchParams), [['code', 'abc123']]);
});

test('implicit-flow tokens stay in the hash and parse as form params', () => {
  const url = new PolyURL('coachkettle://auth/callback#access_token=a.b.c&refresh_token=r%2Fx&expires_in=3600');
  assert.deepEqual(entries(url.searchParams), []);
  assert.equal(url.hash, '#access_token=a.b.c&refresh_token=r%2Fx&expires_in=3600');
  assert.deepEqual(entries(new PolyURLSearchParams(url.hash.substring(1))), [
    ['access_token', 'a.b.c'], ['refresh_token', 'r/x'], ['expires_in', '3600'],
  ]);
});

test('provider error params decode plus signs and percent escapes', () => {
  const url = new PolyURL('coachkettle://auth/callback?error=access_denied&error_description=Email+link+is+invalid%2C+retry');
  assert.deepEqual(entries(url.searchParams), [
    ['error', 'access_denied'], ['error_description', 'Email link is invalid, retry'],
  ]);
});

test('an Expo dev-client redirect keeps its host, port and --/ path', () => {
  const url = new PolyURL('exp://192.168.1.5:8081/--/auth/callback?code=xyz');
  assert.equal(url.protocol, 'exp:');
  assert.equal(url.hostname, '192.168.1.5');
  assert.equal(url.port, '8081');
  assert.equal(url.pathname, '/--/auth/callback');
  assert.deepEqual(entries(url.searchParams), [['code', 'xyz']]);
});

test('an invalid URL throws a TypeError', () => {
  assert.throws(() => new PolyURL('not a url'), (err: any) => err?.name === 'TypeError');
});
