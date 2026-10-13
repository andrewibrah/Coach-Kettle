import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const PROD_URL = 'https://vjfteiuxsdqdozhljxhd.supabase.co';

// Loads the real lib/supabase.ts with a controlled build-time env (Expo inlines EXPO_PUBLIC_*).
function loadSupabase(env: Record<string, string | undefined>) {
  const source = readFileSync(new URL('../supabase.ts', import.meta.url), 'utf8');
  const created: any[] = [];
  const deps: Record<string, any> = {
    '@supabase/supabase-js/dist/index.cjs': { createClient: (...args: any[]) => { created.push(args); return { auth: {} }; } },
    'react-native': { AppState: { addEventListener: () => {} } },
    'react-native-url-polyfill/auto': {},
    './supabaseStorage': { supabaseAuthStorage: {} },
  };
  const exports: any = {};
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, process: { env }, require: (name: string) => {
    assert.ok(name in deps, `missing offline dependency ${name}`);
    return deps[name];
  } });
  return { ...exports, created };
}

test('without a local override the client targets production', () => {
  const m = loadSupabase({});
  assert.equal(m.supabaseUrl, PROD_URL);
  assert.equal(m.created[0][0], PROD_URL);
  assert.equal(m.created[0][1], m.supabaseAnonKey);
});

test('EXPO_PUBLIC_SUPABASE_URL/ANON_KEY point the client at a local stack', () => {
  const m = loadSupabase({ EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56121', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'local-anon' });
  assert.equal(m.supabaseUrl, 'http://127.0.0.1:56121');
  assert.equal(m.supabaseAnonKey, 'local-anon');
  assert.deepEqual(m.created[0].slice(0, 2), ['http://127.0.0.1:56121', 'local-anon']);
});

test('a URL override without its anon key is ignored (never mixes a prod key with another host)', () => {
  const m = loadSupabase({ EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56121' });
  assert.equal(m.supabaseUrl, PROD_URL);
});
