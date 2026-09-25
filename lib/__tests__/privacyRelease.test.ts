import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

import * as legal from '../../constants/legal.ts';
import * as accountDeletion from '../accountDeletion.ts';
import * as serverVersions from '../../supabase/functions/terms-acceptance/versions.ts';

const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// Minimal hook runtime: state and refs survive re-renders.
function harness() {
  const slots: any[] = [];
  let index = 0;
  const react: any = {
    Fragment: 'Fragment',
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props ?? {}, children }),
    useState: (init: any) => {
      const k = index++;
      if (!(k in slots)) slots[k] = typeof init === 'function' ? init() : init;
      return [slots[k], (v: any) => { slots[k] = typeof v === 'function' ? v(slots[k]) : v; }];
    },
    useRef: (init: any) => {
      const k = index++;
      if (!(k in slots)) slots[k] = { current: init };
      return slots[k];
    },
    useEffect: () => {},
  };
  react.default = react;
  return {
    react,
    render<T>(fn: () => T): T {
      index = 0;
      return fn();
    },
  };
}

function load(file: string, react: any, dependencies: Record<string, any>) {
  const exports: any = {};
  const code = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, React: react, Promise, setTimeout, console, Error, require: (name: string) => {
    if (name === 'react') return react;
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

function nodes(tree: any): any[] {
  const out: any[] = [];
  const walk = (node: any) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    out.push(node);
    walk(node.children);
  };
  walk(tree);
  return out;
}

const textOf = (tree: any) => JSON.stringify(tree);
// Objects built inside a vm context have foreign prototypes; compare their JSON shape.
const plain = (value: any) => JSON.parse(JSON.stringify(value));
const flatStyle = (style: any): any => {
  if (typeof style === 'function') return flatStyle(style({ pressed: false }));
  if (Array.isArray(style)) return style.reduce((acc, s) => ({ ...acc, ...flatStyle(s) }), {});
  return style || {};
};

// ---------- privacy version: client and server agree ----------

test('the client records the same privacy version the server requires (1.1.0), and terms stay 1.0.0', () => {
  assert.equal(legal.PRIVACY_VERSION, '1.1.0');
  assert.equal(serverVersions.CURRENT_PRIVACY_VERSION, legal.PRIVACY_VERSION);
  assert.equal(serverVersions.CURRENT_TERMS_VERSION, legal.TERMS_VERSION);
  assert.equal(legal.TERMS_VERSION, '1.0.0');
});

test('terms-acceptance takes its versions from versions.ts instead of its own literals', () => {
  const index = read('supabase/functions/terms-acceptance/index.ts');
  assert.match(index, /from "\.\/versions\.ts"/);
  assert.doesNotMatch(index, /const CURRENT_(TERMS|PRIVACY)_VERSION\s*=/);
  assert.match(index, /searchParams\.get\("privacy_version"\)/);
});

const row = (terms_version: string, privacy_version: string, accepted_at = '2026-09-01T00:00:00Z') =>
  ({ terms_version, privacy_version, accepted_at });

test('a 1.0.2 client is re-prompted exactly once: legacy row -> needs acceptance, after accepting 1.1.0 -> accepted', () => {
  const { evaluateAcceptance } = serverVersions;
  assert.equal(evaluateAcceptance([row('1.0.0', '1.0.0')], legal.PRIVACY_VERSION).accepted, false);
  // What the fixed client POSTs after tapping Accept: terms 1.0.0 + privacy 1.1.0.
  const afterAccept = [row(legal.TERMS_VERSION, legal.PRIVACY_VERSION, '2026-09-24T00:00:00Z'), row('1.0.0', '1.0.0')];
  const result = evaluateAcceptance(afterAccept, legal.PRIVACY_VERSION);
  assert.equal(result.accepted, true);
  assert.equal(result.requiredPrivacyVersion, '1.1.0');
});

test('live 1.0.1 builds (no declaration, privacy recorded as 1.0.0) are never trapped', () => {
  const { evaluateAcceptance } = serverVersions;
  assert.equal(evaluateAcceptance([row('1.0.0', '1.0.0')], null).accepted, true);
  assert.equal(evaluateAcceptance([row('1.0.0', '1.0.0')], undefined).requiredPrivacyVersion, '1.0.0');
  assert.equal(evaluateAcceptance([row('1.0.0', '1.0.0')], '').accepted, true);
  // Two devices: the phone (1.0.2) accepted 1.1.0 last; the 1.0.1 iPad must still pass.
  assert.equal(evaluateAcceptance([row('1.0.0', '1.1.0', '2026-09-25T00:00:00Z'), row('1.0.0', '1.0.0')], null).accepted, true);
  // An older 1.0.0 row written after the 1.1.0 row must not re-prompt the 1.0.2 client.
  assert.equal(evaluateAcceptance([row('1.0.0', '1.0.0', '2026-09-26T00:00:00Z'), row('1.0.0', '1.1.0')], '1.1.0').accepted, true);
});

test('no rows needs acceptance; wrong terms never pass; malformed declarations fail closed; newer ones clamp', () => {
  const { evaluateAcceptance, requiredPrivacyVersion } = serverVersions;
  assert.equal(evaluateAcceptance([], null).accepted, false);
  assert.equal(evaluateAcceptance([], '1.1.0').accepted, false);
  assert.equal(evaluateAcceptance([row('0.9.0', '1.1.0')], '1.1.0').accepted, false);
  for (const junk of ['latest', '1.1', '1.1.0; drop', ' 1.1.0', 'v1.1.0']) {
    assert.equal(requiredPrivacyVersion(junk), '1.1.0', junk);
  }
  assert.equal(requiredPrivacyVersion('9.0.0'), '1.1.0');
  assert.equal(requiredPrivacyVersion('0.1.0'), '1.0.0');
  assert.equal(evaluateAcceptance([row('1.0.0', '1.2.0')], '1.2.0').accepted, true);
  assert.equal(evaluateAcceptance([row('1.0.0', 'garbage')], null).accepted, false);
});

// ---------- lib/authLock.ts sends the privacy version ----------

function loadAuthLock() {
  const calls: { record: any[][]; check: any[][] } = { record: [], check: [] };
  const api = {
    recordTermsAcceptance: async (...args: any[]) => { calls.record.push(args); return { ok: true }; },
    checkTermsAcceptance: async (...args: any[]) => {
      calls.check.push(args);
      return { accepted: true, needs_acceptance: false, current_terms_version: '1.0.0', current_privacy_version: '1.1.0' };
    },
  };
  const memory = new Map<string, string>();
  const exports = load('lib/authLock.ts', {}, {
    '@react-native-async-storage/async-storage': { default: {
      getItem: async (k: string) => memory.get(k) ?? null,
      setItem: async (k: string, v: string) => { memory.set(k, v); },
      removeItem: async (k: string) => { memory.delete(k); },
      multiRemove: async () => {},
    } },
    './api': { api },
    '@/constants/legal': legal,
  });
  return { exports, calls };
}

test('syncTermsAcceptanceToServer records terms 1.0.0 and privacy 1.1.0 (not the terms version twice)', async () => {
  const { exports, calls } = loadAuthLock();
  assert.equal(await exports.syncTermsAcceptanceToServer(), true);
  assert.deepEqual(calls.record, [[legal.TERMS_VERSION, legal.PRIVACY_VERSION]]);
});

test('checkServerTermsAcceptance declares the privacy version this build can present', async () => {
  const { exports, calls } = loadAuthLock();
  const result = await exports.checkServerTermsAcceptance();
  assert.equal(result.needsAcceptance, false);
  assert.deepEqual(calls.check, [[legal.PRIVACY_VERSION]]);
});

test('api.checkTermsAcceptance sends the declaration as a privacy_version query param', async () => {
  const requests: string[] = [];
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(read('lib/api.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Error, JSON, Response, encodeURIComponent, require: (name: string) => {
      if (name === './supabase') return { supabaseUrl: 'https://fixture.supabase.co' };
      if (name === './auth') return { fetchWithAuth: async (url: string) => { requests.push(url); return new Response('{}', { status: 200 }); } };
      return {};
    },
  });
  await exports.api.checkTermsAcceptance('1.1.0');
  await exports.api.checkTermsAcceptance();
  assert.deepEqual(requests, [
    'https://fixture.supabase.co/functions/v1/terms-acceptance?privacy_version=1.1.0',
    'https://fixture.supabase.co/functions/v1/terms-acceptance',
  ]);
});

// ---------- pure deletion helpers ----------

test('resolveReauthMethod picks the re-auth path from the user provider', () => {
  const { resolveReauthMethod } = accountDeletion;
  assert.equal(resolveReauthMethod({ email: 'a@b.c', app_metadata: { provider: 'email' } }), 'password');
  assert.equal(resolveReauthMethod({ email: 'a@b.c', app_metadata: { provider: 'apple' } }), 'apple');
  assert.equal(resolveReauthMethod({ email: 'a@b.c', app_metadata: { provider: 'google' } }), 'google');
  assert.equal(resolveReauthMethod({ email: 'a@b.c', app_metadata: {}, identities: [{ provider: 'apple' }] }), 'apple');
  assert.equal(resolveReauthMethod({ email: 'a@b.c', app_metadata: { provider: 'github', providers: ['github', 'google'] } }), 'google');
  // Password re-auth needs the account email; without it there is nothing to sign in with.
  assert.equal(resolveReauthMethod({ email: null, app_metadata: { provider: 'email' } }), null);
  assert.equal(resolveReauthMethod({ email: 'a@b.c', app_metadata: { provider: 'github' } }), null);
  assert.equal(resolveReauthMethod(null), null);
});

test('isDeleteConfirmationValid only accepts DELETE', () => {
  const { isDeleteConfirmationValid } = accountDeletion;
  assert.equal(isDeleteConfirmationValid('DELETE'), true);
  assert.equal(isDeleteConfirmationValid(' DELETE '), true);
  for (const bad of ['', 'delete', 'Delete', 'DELET', 'DELETE!', 'DELETE ME']) {
    assert.equal(isDeleteConfirmationValid(bad), false, bad);
  }
});

function deletionDeps(overrides: Record<string, any> = {}) {
  const calls: string[] = [];
  const deps: any = {
    expectedUserId: 'user-1',
    reauthenticate: async () => { calls.push('reauth'); return { status: 'ok', userId: 'user-1', appleAuthorizationCode: 'apple-code' }; },
    restoreSession: async () => { calls.push('restore'); },
    deleteAccount: async (opts: any) => { calls.push(`delete:${JSON.stringify(opts)}`); return { ok: true }; },
    cancelLocalNotifications: async () => { calls.push('cancelAllLocal'); },
    signOut: async () => { calls.push('signOut'); },
    signOutLocal: async () => { calls.push('signOutLocal'); },
    ...overrides,
  };
  return { deps, calls };
}

test('success: re-auth, delete with the Apple code, then cancel notifications and sign out (caches cleared)', async () => {
  const { deps, calls } = deletionDeps();
  assert.deepEqual(await accountDeletion.runAccountDeletion(deps), { ok: true });
  assert.deepEqual(calls, ['reauth', 'delete:{"appleAuthorizationCode":"apple-code"}', 'cancelAllLocal', 'signOut', 'signOutLocal']);
  // signOut is AuthProvider.signOut, which runs clearAllCaches() before touching Supabase.
  assert.match(read('contexts/AuthProvider.tsx'), /const signOut = async \(\) => \{\s*try \{\s*\/\/[^\n]*\n\s*await clearAllCaches\(\);/);
});

test('success: local cleanup keeps going when a step throws or signOut fails for the deleted user', async () => {
  const { deps, calls } = deletionDeps({
    cancelLocalNotifications: async () => { calls.push('cancelAllLocal'); throw new Error('x'); },
    signOut: async () => { calls.push('signOut'); throw new Error('user not found'); },
  });
  assert.deepEqual(await accountDeletion.runAccountDeletion(deps), { ok: true });
  assert.deepEqual(calls.slice(-3), ['cancelAllLocal', 'signOut', 'signOutLocal']);
});

test('cancelled or failed re-auth never calls deleteAccount and never signs out', async () => {
  for (const [result, message] of [
    [{ status: 'cancelled' }, accountDeletion.DELETE_ACCOUNT_MESSAGES.cancelled],
    [{ status: 'failed' }, accountDeletion.DELETE_ACCOUNT_MESSAGES.reauthFailed],
    [{ status: 'ok', userId: null }, accountDeletion.DELETE_ACCOUNT_MESSAGES.reauthFailed],
  ] as const) {
    const { deps, calls } = deletionDeps({ reauthenticate: async () => { calls.push('reauth'); return result; } });
    assert.deepEqual(await accountDeletion.runAccountDeletion(deps), { ok: false, message });
    assert.deepEqual(calls, ['reauth']);
  }
  const { deps, calls } = deletionDeps({ reauthenticate: async () => { calls.push('reauth'); throw new Error('boom'); } });
  assert.deepEqual(await accountDeletion.runAccountDeletion(deps), { ok: false, message: accountDeletion.DELETE_ACCOUNT_MESSAGES.reauthFailed });
  assert.deepEqual(calls, ['reauth']);
});

test('re-auth into a different account restores the original session and deletes nothing', async () => {
  const { deps, calls } = deletionDeps({ reauthenticate: async () => { calls.push('reauth'); return { status: 'ok', userId: 'someone-else' }; } });
  assert.deepEqual(await accountDeletion.runAccountDeletion(deps), { ok: false, message: accountDeletion.DELETE_ACCOUNT_MESSAGES.wrongAccount });
  assert.deepEqual(calls, ['reauth', 'restore']);
});

test('REAUTH_REQUIRED asks to sign in again; any other error gets the generic message and no cleanup', async () => {
  const reauthError = Object.assign(new Error('x'), { code: 'REAUTH_REQUIRED' });
  let { deps, calls } = deletionDeps({ deleteAccount: async () => { calls.push('delete'); throw reauthError; } });
  assert.deepEqual(await accountDeletion.runAccountDeletion(deps), { ok: false, message: accountDeletion.DELETE_ACCOUNT_MESSAGES.reauthRequired });
  assert.deepEqual(calls, ['reauth', 'delete']);
  for (const error of [Object.assign(new Error('x'), { code: 'AUTH_DELETE_FAILED' }), new Error('network')]) {
    ({ deps, calls } = deletionDeps({ deleteAccount: async () => { calls.push('delete'); throw error; } }));
    assert.deepEqual(await accountDeletion.runAccountDeletion(deps), { ok: false, message: accountDeletion.DELETE_ACCOUNT_MESSAGES.generic });
    assert.deepEqual(calls, ['reauth', 'delete']);
  }
  assert.equal(accountDeletion.DELETE_ACCOUNT_MESSAGES.generic, "Couldn't delete your account. Nothing was removed from your device; try again.");
});

test('a missing Apple code is not sent (non-Apple re-auth)', async () => {
  const { deps, calls } = deletionDeps({ reauthenticate: async () => { calls.push('reauth'); return { status: 'ok', userId: 'user-1' }; } });
  await accountDeletion.runAccountDeletion(deps);
  assert.equal(calls[1], 'delete:{}');
});

// ---------- lib/reauth.ts provider flows ----------

function loadReauth(overrides: { apple?: () => Promise<any>; password?: (args: any) => Promise<any>; idToken?: (args: any) => Promise<any>; browser?: () => Promise<any> } = {}) {
  const calls: any[] = [];
  const supabase = {
    auth: {
      signInWithPassword: async (args: any) => { calls.push(['signInWithPassword', args]); return overrides.password ? overrides.password(args) : { data: { user: { id: 'user-1' } }, error: null }; },
      signInWithIdToken: async (args: any) => { calls.push(['signInWithIdToken', args]); return overrides.idToken ? overrides.idToken(args) : { data: { user: { id: 'user-1' } }, error: null }; },
      signInWithOAuth: async (args: any) => { calls.push(['signInWithOAuth', args]); return { data: { url: 'https://auth/authorize' }, error: null }; },
      exchangeCodeForSession: async (code: string) => { calls.push(['exchangeCodeForSession', code]); return { data: { user: { id: 'user-1' }, session: {} }, error: null }; },
      setSession: async (args: any) => { calls.push(['setSession', args]); return { data: { user: { id: 'user-1' } }, error: null }; },
      signOut: async (args: any) => { calls.push(['signOut', args]); return { error: null }; },
    },
  };
  // The real shared redirect helpers, on the same supabase stub.
  const authRedirect = load('lib/authRedirect.ts', {}, {
    // expo-linking puts only the query in queryParams; the hash is left to the fallback.
    'expo-linking': { parse: (url: string) => ({ queryParams: Object.fromEntries(new URL(url.split('#')[0]).searchParams) }) },
    'expo-web-browser': { openAuthSessionAsync: async () => (overrides.browser ? overrides.browser() : { type: 'success', url: 'coachkettle://auth/callback?code=abc' }) },
    '@/lib/supabase': { supabase },
  });
  const exports = load('lib/reauth.ts', {}, {
    'expo-apple-authentication': {
      signInAsync: async (args: any) => { calls.push(['appleSignIn', args]); return overrides.apple ? overrides.apple() : { identityToken: 'id-token', authorizationCode: 'apple-code' }; },
    },
    'expo-auth-session': { makeRedirectUri: () => 'coachkettle://auth/callback' },
    '@/lib/authRedirect': authRedirect,
    '@/lib/supabase': { supabase },
  });
  return { exports, calls };
}

test('password re-auth signs in with the account email and never returns the password', async () => {
  const { exports, calls } = loadReauth();
  const result = await exports.reauthenticate('password', { email: 'a@b.c', password: 'pw' });
  assert.deepEqual(plain(result), { status: 'ok', userId: 'user-1' });
  assert.deepEqual(plain(calls), [['signInWithPassword', { email: 'a@b.c', password: 'pw' }]]);
  const failed = loadReauth({ password: async () => ({ data: { user: null }, error: { message: 'Invalid login' } }) });
  assert.deepEqual(plain(await failed.exports.reauthenticate('password', { email: 'a@b.c', password: 'bad' })), { status: 'failed' });
});

test('Apple re-auth signs in with the identity token and captures credential.authorizationCode', async () => {
  const { exports, calls } = loadReauth();
  assert.deepEqual(plain(await exports.reauthenticate('apple', {})), { status: 'ok', userId: 'user-1', appleAuthorizationCode: 'apple-code' });
  assert.deepEqual(plain(calls[1]), ['signInWithIdToken', { provider: 'apple', token: 'id-token' }]);
  const cancelled = loadReauth({ apple: async () => { throw Object.assign(new Error('cancel'), { code: 'ERR_REQUEST_CANCELED' }); } });
  assert.deepEqual(plain(await cancelled.exports.reauthenticate('apple', {})), { status: 'cancelled' });
  assert.equal(cancelled.calls.some(([name]: any[]) => name === 'signInWithIdToken'), false);
  const noToken = loadReauth({ apple: async () => ({ identityToken: null, authorizationCode: 'x' }) });
  assert.deepEqual(plain(await noToken.exports.reauthenticate('apple', {})), { status: 'failed' });
});

test('Google re-auth reuses the OAuth flow; a dismissed browser is a cancel, not the old session', async () => {
  const { exports, calls } = loadReauth();
  assert.deepEqual(plain(await exports.reauthenticate('google', {})), { status: 'ok', userId: 'user-1' });
  assert.deepEqual(calls.map(([name]: any[]) => name), ['signInWithOAuth', 'exchangeCodeForSession']);
  assert.equal(calls[0][1].provider, 'google');
  for (const type of ['dismiss', 'cancel']) {
    const dismissed = loadReauth({ browser: async () => ({ type }) });
    assert.deepEqual(plain(await dismissed.exports.reauthenticate('google', {})), { status: 'cancelled' });
  }
  const errored = loadReauth({ browser: async () => ({ type: 'success', url: 'coachkettle://auth/callback#error=access_denied' }) });
  assert.deepEqual(plain(await errored.exports.reauthenticate('google', {})), { status: 'failed' });
});

test('restoreSession puts the previous session back and falls back to a local sign-out', async () => {
  const { exports, calls } = loadReauth();
  await exports.restoreSession({ access_token: 'a', refresh_token: 'r' });
  assert.deepEqual(plain(calls), [['setSession', { access_token: 'a', refresh_token: 'r' }]]);
  const none = loadReauth();
  await none.exports.restoreSession(null);
  assert.deepEqual(plain(none.calls), [['signOut', { scope: 'local' }]]);
  await none.exports.signOutLocal();
  assert.deepEqual(plain(none.calls.at(-1)), ['signOut', { scope: 'local' }]);
});

// ---------- Settings row and route ----------

test('Settings has a 44pt destructive Delete account button that opens the new screen', () => {
  const h = harness();
  const pushes: string[] = [];
  const Settings = load('app/settings/index.tsx', h.react, {
    '@/contexts/AuthProvider': { useAuth: () => ({ signOut: async () => {}, session: { user: { email: 'a@b.c' } }, clearAllCaches: async () => {} }) },
    '@/contexts/ThemeProvider': { useTheme: () => ({ themeMode: 'system', setThemeMode() {}, isDark: false }) },
    '@/components/ui/icon-symbol': { IconSymbol: 'Icon' },
    '@/components/ui/screen-header': { ScreenHeader: 'ScreenHeader' },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/components/tutorial/TutorialModal': { TutorialModal: 'TutorialModal' },
    '@/components/ui/Toast': { Toast: 'Toast' },
    '@/contexts/ProfileContext': { useProfile: () => ({ profile: null }) },
    '@/contexts/EntitlementContext': { useEntitlement: () => ({ isPro: false, entitlement: { status: 'expired' } }) },
    '@/hooks/useThemeColor': { useThemeColor: (_: any, name: string) => `token:${name}` },
    '@/hooks/useToast': { useToast: () => ({ toast: null, showToast() {}, hideToast() {} }) },
    'expo-router': { useRouter: () => ({ push: (href: string) => pushes.push(href) }) },
    'react-native': { Alert: { alert() {} }, Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (s: any) => s, hairlineWidth: 1 }, Switch: 'Switch', Text: 'Text', View: 'View' },
  }).default;
  const tree = h.render(Settings);
  const row = nodes(tree).find((n) => n.props.accessibilityLabel === 'Delete account');
  assert.ok(row, 'Delete account row exists');
  assert.equal(row.props.accessibilityRole, 'button');
  assert.ok(flatStyle(row.props.style).minHeight >= 44, JSON.stringify(flatStyle(row.props.style)));
  assert.match(textOf(row), /token:danger/);
  row.props.onPress();
  assert.deepEqual(pushes, ['/settings/delete-account']);
  assert.match(read('app/settings/_layout.tsx'), /<Stack\.Screen name="delete-account" \/>/);
});

// ---------- Delete Account screen ----------

function renderDeleteScreen(opts: { provider?: string; reauthResult?: any; deleteError?: any } = {}) {
  const h = harness();
  const calls: any[] = [];
  const provider = opts.provider ?? 'email';
  const session = {
    access_token: 'old-access', refresh_token: 'old-refresh',
    user: { id: 'user-1', email: 'a@b.c', app_metadata: { provider }, identities: [{ provider }] },
  };
  const Screen = load('app/settings/delete-account.tsx', h.react, {
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (s: any) => s }, TextInput: 'TextInput', View: 'View',
    },
    'expo-router': { useRouter: () => ({ replace: (href: string) => calls.push(['replace', href]) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/components/ui/screen-header': { ScreenHeader: 'ScreenHeader' },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/contexts/AuthProvider': { useAuth: () => ({ session, signOut: async () => { calls.push(['signOut']); } }) },
    '@/hooks/useThemeColor': { useThemeColor: (_: any, name: string) => `token:${name}` },
    '@/lib/iap': { useIAP: () => ({ presentCustomerCenter: async () => { calls.push(['customerCenter']); } }) },
    '@/lib/api': { api: { deleteAccount: async (o: any) => { calls.push(['deleteAccount', o]); if (opts.deleteError) throw opts.deleteError; return { ok: true }; } } },
    '@/lib/notifications': { cancelAllLocal: async () => { calls.push(['cancelAllLocal']); } },
    '@/lib/accountDeletion': accountDeletion,
    '@/lib/reauth': {
      reauthenticate: async (method: string, creds: any) => {
        calls.push(['reauth', method, creds]);
        await new Promise((r) => setTimeout(r, 5));
        return opts.reauthResult ?? { status: 'ok', userId: 'user-1', ...(method === 'apple' ? { appleAuthorizationCode: 'apple-code' } : {}) };
      },
      restoreSession: async (prev: any) => { calls.push(['restore', prev]); },
      signOutLocal: async () => { calls.push(['signOutLocal']); },
    },
  }).default;
  const render = () => h.render(Screen);
  const find = (tree: any, label: string) => nodes(tree).find((n) => n.props.accessibilityLabel === label);
  return { render, find, calls };
}

test('delete screen explains what is deleted and that the App Store subscription is not cancelled', async () => {
  const { render, find, calls } = renderDeleteScreen();
  const tree = render();
  const text = textOf(tree);
  for (const word of ['profile', 'workouts', 'nutrition', 'coach', 'photos', 'personal records', 'programs', 'cannot be undone']) {
    assert.match(text, new RegExp(word, 'i'), word);
  }
  assert.match(text, /does not cancel/i);
  const manage = find(tree, 'Manage subscription');
  assert.equal(manage.props.accessibilityRole, 'button');
  await manage.props.onPress();
  assert.deepEqual(calls, [['customerCenter']]);
});

test('password user: button disabled until DELETE and a password are entered; success cleans up and routes to sign-in', async () => {
  const { render, find, calls } = renderDeleteScreen();
  let tree = render();
  const password = find(tree, 'Password');
  assert.equal(password.props.secureTextEntry, true);
  const button = () => find(render(), 'Delete account permanently');
  assert.equal(button().props.disabled, true);
  find(tree, 'Type DELETE to confirm').props.onChangeText('delete');
  assert.equal(button().props.disabled, true);
  find(render(), 'Type DELETE to confirm').props.onChangeText('DELETE');
  assert.equal(button().props.disabled, true, 'still needs the password');
  find(render(), 'Password').props.onChangeText('pw');
  tree = render();
  const enabled = find(tree, 'Delete account permanently');
  assert.equal(enabled.props.disabled, false);
  assert.equal(enabled.props.accessibilityState.disabled, false);
  // Double tap: only one submission goes out.
  const first = enabled.props.onPress();
  const second = enabled.props.onPress();
  assert.equal(find(render(), 'Delete account permanently').props.accessibilityState.busy, true);
  await Promise.all([first, second]);
  assert.deepEqual(plain(calls), [
    ['reauth', 'password', { email: 'a@b.c', password: 'pw' }],
    ['deleteAccount', {}],
    ['cancelAllLocal'],
    ['signOut'],
    ['signOutLocal'],
    ['replace', '/auth/sign-in'],
  ]);
});

test('Apple user: no password field, the Apple authorization code goes to deleteAccount', async () => {
  const { render, find, calls } = renderDeleteScreen({ provider: 'apple' });
  const tree = render();
  assert.equal(find(tree, 'Password'), undefined);
  find(tree, 'Type DELETE to confirm').props.onChangeText('DELETE');
  await find(render(), 'Delete account permanently').props.onPress();
  assert.deepEqual(plain(calls.slice(0, 2)), [['reauth', 'apple', { email: 'a@b.c', password: '' }], ['deleteAccount', { appleAuthorizationCode: 'apple-code' }]]);
});

test('cancelled re-auth and server errors show an inline message and leave the session alone', async () => {
  for (const [opts, message] of [
    [{ provider: 'google', reauthResult: { status: 'cancelled' } }, accountDeletion.DELETE_ACCOUNT_MESSAGES.cancelled],
    [{ provider: 'google', deleteError: Object.assign(new Error('x'), { code: 'REAUTH_REQUIRED' }) }, accountDeletion.DELETE_ACCOUNT_MESSAGES.reauthRequired],
    [{ provider: 'google', deleteError: new Error('500') }, accountDeletion.DELETE_ACCOUNT_MESSAGES.generic],
  ] as const) {
    const { render, find, calls } = renderDeleteScreen(opts);
    find(render(), 'Type DELETE to confirm').props.onChangeText('DELETE');
    await find(render(), 'Delete account permanently').props.onPress();
    const tree = render();
    assert.ok(textOf(tree).includes(JSON.stringify(message).slice(1, -1)), message);
    assert.equal(calls.some(([name]: any[]) => name === 'signOut' || name === 'replace' || name === 'cancelAllLocal'), false);
    assert.equal(find(tree, 'Delete account permanently').props.accessibilityState.busy, false);
  }
});

test('new deletion files use theme tokens only (no hardcoded colours) and store nothing locally', () => {
  for (const file of ['app/settings/delete-account.tsx', 'lib/accountDeletion.ts', 'lib/reauth.ts']) {
    assert.ok(existsSync(new URL(`../../${file}`, import.meta.url)), file);
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, file);
    assert.doesNotMatch(source, /AsyncStorage|SecureStore/, file);
  }
  const screen = read('app/settings/delete-account.tsx');
  for (const token of ['dangerFill', 'dangerForeground', 'dangerSurface', 'danger']) {
    assert.match(screen, new RegExp(`useThemeColor\\(\\{\\}, '${token}'\\)`), token);
  }
});

// ---------- acceptance gate shows the AI disclosure ----------

function renderTerms(readOnly: boolean) {
  const h = harness();
  const Screen = load('components/TermsOfServiceScreen.tsx', h.react, {
    'expo-router': { Stack: { Screen: 'StackScreen' }, useRouter: () => ({ replace() {} }) },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
      StyleSheet: { create: (s: any) => s }, Alert: { alert() {} },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/contexts/AuthLockProvider': { useAuthLock: () => ({ acceptTerms: async () => true }) },
    '@/contexts/AuthProvider': { useAuth: () => ({ signOut: async () => {} }) },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/constants/legal': legal,
    '@/hooks/useThemeColor': { useThemeColor: () => 'token' },
    '@/lib/legalMode': { legalDocTitle: () => 'Title' },
  }).TermsOfServiceScreen;
  return h.render(() => Screen({ readOnly }));
}

test('the acceptance gate shows the AI disclosure naming OpenAI; the reader shows the same text inside the privacy policy', () => {
  const gate = textOf(renderTerms(false));
  assert.ok(gate.includes(JSON.stringify(legal.CONSENT_AI_DISCLOSURE).slice(1, -1)));
  assert.ok(gate.includes(JSON.stringify(legal.CONSENT_ACCEPT_TEXT).slice(1, -1)));
  assert.match(legal.CONSENT_AI_DISCLOSURE, /OpenAI/);
  const reader = textOf(renderTerms(true));
  assert.ok(!reader.includes(JSON.stringify(legal.CONSENT_ACCEPT_TEXT).slice(1, -1)));
  assert.ok(legal.PRIVACY_POLICY.includes(legal.CONSENT_AI_DISCLOSURE));
  assert.equal('CONSENT_CHECKBOX_TEXT' in legal, false);
  assert.equal('CONSENT_EXPLANATION' in legal, false);
});

test('the disclosure names what is actually sent (inventory §3) and what is not', () => {
  const d = legal.CONSENT_AI_DISCLOSURE;
  for (const claim of ['workout text', 'coach questions', 'meal photos', 'age', 'sex', 'height', 'weight', 'allergies', 'personal records', 'food logs']) {
    assert.match(d, new RegExp(claim, 'i'), claim);
  }
  assert.match(d, /do not send your name, email, or account ID/);
});

// ---------- policy text ----------

const PROCESSORS = ['Supabase', 'OpenAI', 'RevenueCat', 'Apple', 'Google', 'Expo', 'Open Food Facts'];

test('in-app privacy policy: version 1.1.0, today, the Delete Account path, all processors, no false OpenAI claim', () => {
  const p = legal.PRIVACY_POLICY;
  assert.match(p, /Version 1\.1\.0/);
  assert.match(p, /September 24, 2026/);
  assert.match(p, /Settings → Delete account/);
  assert.match(p, /does not cancel/i);
  assert.match(p, /RevenueCat/);
  for (const name of PROCESSORS) assert.match(p, new RegExp(name), name);
  assert.doesNotMatch(p, /by contacting us/i);
  assert.doesNotMatch(p, /never (transmit|send|receive)[^.]*(health|media|photo)/i);
  assert.doesNotMatch(legal.TERMS_OF_SERVICE, /by contacting us|4 hours of inactivity/i);
});

test('hosted privacy policy: version 1.1.0, today, the Delete Account path, all processors, false claims removed', () => {
  const html = read('docs/privacy.html');
  assert.match(html, /Version 1\.1\.0/);
  assert.match(html, /September 24, 2026/);
  assert.match(html, /Settings &rarr; Delete account/);
  for (const name of PROCESSORS) assert.match(html, new RegExp(name), name);
  assert.doesNotMatch(html, /health metrics, media files/);
  assert.doesNotMatch(html, /Settings &rarr; Account &rarr; Delete Account/);
  assert.doesNotMatch(html, /Face ID|Touch ID/);
  assert.doesNotMatch(html, /collected via Apple Sign In during account creation/);
});

test('support page no longer repeats the false OpenAI and deletion-path claims', () => {
  const html = read('docs/support.html');
  assert.doesNotMatch(html, /media files are never sent to OpenAI/);
  assert.doesNotMatch(html, /Only the exercise text and questions you type are transmitted/);
  assert.doesNotMatch(html, /Settings &rarr; Account &rarr; Delete Account/);
  assert.match(html, /Settings &rarr; Delete account/);
});

test('support page lists every processor; the label guide no longer says email is Apple-only; IP processing is disclosed', () => {
  const support = read('docs/support.html');
  assert.doesNotMatch(support, /Supabase for storage, OpenAI for AI features/);
  for (const name of PROCESSORS) assert.match(support, new RegExp(name), name);
  const guide = read('docs/app-privacy-guide.md');
  assert.doesNotMatch(guide, /Email is obtained only via Apple Sign In/);
  assert.match(guide, /email and password, Sign in with Apple[^.]*Google Sign-In/);
  for (const text of [legal.PRIVACY_POLICY, read('docs/privacy.html')]) {
    assert.match(text, /IP address: our hosting and auth provider[^.]*processes it to operate and secure the service/);
  }
});
