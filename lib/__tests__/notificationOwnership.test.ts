import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
function deferred() { let resolve: any; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
function harness() {
  const states: any[] = [], refs: any[] = [], effects: any[] = [], callbacks: any[] = [];
  let si = 0, ri = 0, ei = 0, ci = 0; let queued: any[] = [];
  const react: any = {
    useState: (init: any) => { const i = si++; if (!(i in states)) states[i] = typeof init === 'function' ? init() : init; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
    useRef: (v: any) => refs[ri++] ??= { current: v },
    useCallback: (fn: any, deps: any[]) => { const i = ci++; if (!callbacks[i] || deps.some((v, k) => v !== callbacks[i].deps[k])) callbacks[i] = { deps, fn }; return callbacks[i].fn; },
    useMemo: (fn: any) => fn(), createContext: () => ({ Provider: 'Provider' }), useContext: () => null,
    useEffect: (fn: any, deps: any[]) => { const i = ei++; if (!effects[i] || deps.some((v, k) => v !== effects[i].deps[k])) queued.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const h: any = { user: 'a', sessionHook: null, refreshHook: null, fetchHook: null, permissionHook: null, calls: [], schedules: [] };
  const session = () => ({ user: { id: h.user }, access_token: `token-${h.user}` });
  const sessionResult = () => ({ data: { session: session() }, error: null });
  h.sessionResult = sessionResult;
  const storage = new Map(['a', 'b'].map(user_id => [user_id, { user_id, auto_start_rest_timer: true, auto_rest_duration_sec: 60, permission_granted: false, nutrition_midday_enabled: true, nutrition_midday_hour: 12 }]));
  h.storage = storage;
  function load(path: string, dependencies: any, globals: any = {}) {
    const exports: any = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
      { exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, console, ...globals });
    return exports;
  }
  const fetch = async (_url: string, opts: any) => {
    const user = opts.headers.Authorization.slice('Bearer token-'.length);
    const body = opts.body ? JSON.parse(opts.body) : { action: 'prefs' };
    const call = { user, ...body }; h.calls.push(call);
    if (h.fetchHook) { const response = await h.fetchHook(call); if (response) return response; }
    const prefs = storage.get(user)!;
    if (body.action === 'update_prefs') Object.assign(prefs, body);
    if (body.action === 'register_token') prefs.permission_granted = true;
    return new Response(JSON.stringify({ prefs: { ...prefs } }), { status: 200 });
  };
  const auth = load('lib/auth.ts', { './supabase': { supabaseAnonKey: 'offline', supabase: { auth: {
    getSession: async () => h.sessionHook ? h.sessionHook() : sessionResult(),
    refreshSession: async () => h.refreshHook ? h.refreshHook() : sessionResult(),
  } } } }, { fetch });
  const native = {
    setNotificationHandler: () => {}, IosAuthorizationStatus: { PROVISIONAL: 3, AUTHORIZED: 2 },
    getPermissionsAsync: async () => ({ granted: false }), requestPermissionsAsync: async () => h.permissionHook ? h.permissionHook() : ({ granted: true }),
    getExpoPushTokenAsync: async () => ({ data: 'offline-push-token' }),
    getAllScheduledNotificationsAsync: async () => [], cancelScheduledNotificationAsync: async () => {},
    SchedulableTriggerInputTypes: { DAILY: 'daily' }, scheduleNotificationAsync: async (v: any) => { h.schedules.push(v); return 'scheduled'; },
  };
  const api = load('lib/notifications.ts', { 'react-native': { Platform: { OS: 'ios' } }, 'expo-constants': { default: { expoConfig: {} } }, './supabase': { supabaseUrl: 'https://offline.invalid' }, './auth': auth, 'expo-notifications': native });
  const jsx = (type: any, props: any) => ({ type, props });
  const provider = load('contexts/NotificationsProvider.tsx', {
    react: { __esModule: true, default: react, ...react }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/contexts/AuthProvider': { useAuth: () => ({ session: { user: { id: h.user } } }) },
    '@/contexts/ProfileContext': { useProfile: () => ({ profile: null }) }, '@/lib/trainingSchedule': { resolveTrainingDays: () => [] }, '@/lib/notifications': api,
  });
  h.render = () => { si = ri = ei = ci = 0; queued = []; const tree = provider.NotificationsProvider({ children: null }); queued.forEach(fn => fn()); return tree.props.value; };
  h.unmount = () => effects.forEach(e => e.cleanup?.());
  return h;
}

for (const fail of [false, true]) test(`permission refresh survives held save (failure=${fail})`, async () => {
  const h = harness(); h.render(); await flush(); const value = h.render();
  const gate = deferred();
  const savedSnapshot = { ...h.storage.get('a'), auto_rest_duration_sec: 180 };
  h.fetchHook = async (c: any) => {
    if (c.action !== 'update_prefs') return null;
    if (!fail) h.storage.set('a', { ...savedSnapshot });
    return gate.promise;
  };
  const save = value.updatePrefs({ auto_rest_duration_sec: 180 });
  const settled = save.then(() => 'saved', () => 'failed'); await flush();
  await value.requestPermission();
  assert.equal(h.storage.get('a').permission_granted, true);
  gate.resolve(new Response(JSON.stringify({ prefs: savedSnapshot }), { status: fail ? 500 : 200 }));
  assert.equal(await settled, fail ? 'failed' : 'saved'); await flush();
  const refreshed = h.render(); await flush();
  assert.equal(refreshed.permissionGranted, true);
  assert.equal(refreshed.prefs.auto_rest_duration_sec, fail ? 60 : 180, 'refresh preserves durable preference outcome');
  assert.equal(refreshed.saving, false);
  assert.ok(h.schedules.length > 0, 'permission-confirmed prefs can reconcile schedules');
  h.fetchHook = null; await refreshed.updatePrefs({ auto_rest_duration_sec: 125 });
  assert.equal(h.render().prefs.auto_rest_duration_sec, 125, 'busy latch cleaned after success/failure');
});

for (const operation of ['save', 'reload', 'permission']) {
  for (const schedule of ['getSession', 'missing-session-refresh', 'proactive-refresh', '401-refresh', 'retry-getSession']) {
    test(`${operation} transport fences B at ${schedule}`, async () => {
      const h = harness(); h.render(); await flush(); const value = h.render(); h.calls.length = 0;
      const gate = deferred(); let entered = false;
      const hold = () => { entered = true; return gate.promise; };
      if (schedule === 'getSession') h.sessionHook = hold;
      if (schedule === 'missing-session-refresh') { h.sessionHook = () => ({ data: { session: null }, error: null }); h.refreshHook = hold; }
      if (schedule === 'proactive-refresh') { h.sessionHook = () => { const result = h.sessionResult(); result.data.session.expires_at = 1; return result; }; h.refreshHook = hold; }
      if (schedule.startsWith('401') || schedule === 'retry-getSession') {
        h.fetchHook = async () => new Response('', { status: 401 });
        if (schedule === '401-refresh') h.refreshHook = hold;
        else h.refreshHook = () => { h.sessionHook = hold; return h.sessionResult(); };
      }
      const pending = operation === 'save' ? value.updatePrefs({ auto_rest_duration_sec: 180 }) : operation === 'reload' ? value.reloadPrefs() : value.requestPermission();
      const settled = pending.then(() => 'resolved', () => 'rejected'); await flush();
      assert.equal(entered, true, 'actual transport reached deferred auth boundary');
      h.user = 'b'; h.sessionHook = h.refreshHook = h.fetchHook = null; h.render(); gate.resolve(h.sessionResult());
      await settled; await flush(); const current = h.render();
      assert.equal(h.calls.filter((c: any) => c.user === 'b' && c.action !== 'prefs').length, 0, 'zero B writes, not just response rejection');
      assert.equal(h.calls.filter((c: any) => c.user === 'b' && c.action === 'prefs').length, 1, 'only B own bootstrap GET, no old-owner reload');
      assert.equal(current.prefs.user_id, 'b'); assert.equal(current.prefs.auto_rest_duration_sec, 60);
      assert.equal(current.permissionGranted, false); assert.equal(current.pushToken, null);
    });
  }
}

for (const boundary of ['switch', 'unmount']) test(`deferred permission refresh is discarded at ${boundary}`, async () => {
  const h = harness(); h.render(); await flush(); const value = h.render(); const gate = deferred();
  h.fetchHook = (c: any) => c.action === 'update_prefs' ? gate.promise : null;
  const save = value.updatePrefs({ auto_rest_duration_sec: 180 }); const settled = save.catch(() => {}); await flush();
  await value.requestPermission();
  if (boundary === 'switch') { h.user = 'b'; h.render(); await flush(); } else h.unmount();
  const before = h.calls.length;
  gate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('a'), auto_rest_duration_sec: 180 } })));
  await settled; await flush();
  assert.equal(h.calls.length, before, 'no stale deferred GET');
  if (boundary === 'unmount') assert.equal(value.getConfirmedPrefs(), null);
  else { const b = h.render(); assert.equal(value.getConfirmedPrefs().user_id, 'b'); assert.equal(b.permissionGranted, false); assert.equal(b.saving, false); }
});

test('permission prompt crossing accounts never registers under B', async () => {
  const h = harness(); h.render(); await flush(); const value = h.render(); const gate = deferred();
  h.permissionHook = () => gate.promise; const pending = value.requestPermission(); await flush();
  h.user = 'b'; h.render(); gate.resolve({ granted: true }); await pending; await flush();
  assert.equal(h.calls.filter((c: any) => c.user === 'b' && c.action === 'register_token').length, 0);
  assert.equal(h.render().permissionGranted, false);
});

for (const outcome of ['failure', 'switch']) test(`deferred refresh ${outcome} keeps owner state safe and retryable`, async () => {
  const h = harness(); h.render(); await flush(); const value = h.render();
  const saveGate = deferred(), refreshGate = deferred(); let refreshStarted = false;
  h.fetchHook = (c: any) => {
    if (c.action === 'update_prefs') return saveGate.promise;
    if (c.action === 'prefs' && c.user === 'a') { refreshStarted = true; return refreshGate.promise; }
    return null;
  };
  const save = value.updatePrefs({ auto_rest_duration_sec: 180 }); const settled = save.catch(() => {}); await flush();
  await value.requestPermission();
  saveGate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('a'), permission_granted: false, auto_rest_duration_sec: 180 } })));
  await flush(); assert.equal(refreshStarted, true);
  if (outcome === 'switch') { h.user = 'b'; h.render(); await flush(); }
  refreshGate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('a') } }), { status: outcome === 'failure' ? 500 : 200 }));
  await settled; await flush(); const current = h.render();
  assert.equal(current.saving, false); assert.equal(current.loading, false);
  if (outcome === 'switch') { assert.equal(current.prefs.user_id, 'b'); assert.equal(current.permissionGranted, false); }
  else {
    assert.ok(current.error); h.fetchHook = null; await current.reloadPrefs();
    assert.equal(h.render().permissionGranted, true); assert.equal(h.render().error, null);
  }
});

test('same-owner 401 retry retains update and refreshes permission', async () => {
  const h = harness(); h.render(); await flush(); const value = h.render(); let first = true;
  h.fetchHook = () => { if (first) { first = false; return new Response('', { status: 401 }); } return null; };
  await value.updatePrefs({ auto_rest_duration_sec: 180 });
  await h.render().requestPermission(); await flush();
  assert.equal(h.render().prefs.auto_rest_duration_sec, 180); assert.equal(h.render().permissionGranted, true);
  assert.equal(h.calls.filter((c: any) => c.action === 'update_prefs').length, 2);
});

for (const failRefresh of [false, true]) test(`retained ready callback cannot save during deferred refresh (failure=${failRefresh})`, async () => {
  const h = harness(); h.render(); await flush(); const ready = h.render();
  const saveGate = deferred(), refreshGate = deferred();
  h.fetchHook = (c: any) => c.action === 'update_prefs' ? saveGate.promise : c.action === 'prefs' ? refreshGate.promise : null;
  const saveA = ready.updatePrefs({ auto_rest_duration_sec: 180 });
  await flush(); await ready.requestPermission();
  saveGate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('a'), auto_rest_duration_sec: 180 } })));
  await flush(); assert.equal(h.render().loading, true, 'deferred GET is held');
  // The callback still captures loading=false from before save A, not the current render.
  h.fetchHook = (c: any) => c.action === 'prefs' ? refreshGate.promise : null;
  const saveB = ready.updatePrefs({ auto_rest_duration_sec: 125 }).then(() => 'saved', () => 'blocked');
  await flush();
  refreshGate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('a') } }), { status: failRefresh ? 500 : 200 }));
  await saveA; const resultB = await saveB; await flush(); const current = h.render();
  assert.equal(current.loading, false, 'settled GET must not leave controls permanently disabled');
  assert.equal(current.saving, false);
  assert.equal(resultB, 'blocked', 'current refresh state gates retained callbacks');
  assert.equal(h.calls.filter((c: any) => c.action === 'update_prefs').length, 1, 'no overlapping save IO');
  h.fetchHook = null;
  if (failRefresh) { assert.ok(current.error); await ready.reloadPrefs(); }
  assert.equal(h.render().permissionGranted, true, 'deferred permission intent survives');
  await ready.updatePrefs({ auto_rest_duration_sec: 125 });
  assert.equal(h.render().prefs.auto_rest_duration_sec, 125, 'retained callback usable after refresh/retry');
});

for (const failFirst of [false, true]) test(`permission during refresh drains one coalesced follow-up (failure=${failFirst})`, async () => {
  const h = harness(); h.render(); await flush(); const ready = h.render();
  const first = deferred(), second = deferred(); let gets = 0;
  const oldSnapshot = { ...h.storage.get('a') };
  h.fetchHook = (c: any) => c.action === 'prefs' ? (++gets === 1 ? first.promise : second.promise) : null;
  const reload = ready.reloadPrefs(); await flush();
  await ready.requestPermission(); await ready.reloadPrefs(); await ready.reloadPrefs();
  assert.equal(gets, 1, 'no parallel refresh IO');
  first.resolve(new Response(JSON.stringify({ prefs: oldSnapshot }), { status: failFirst ? 500 : 200 }));
  await flush(); assert.equal(gets, 2, 'permission intent queued during GET is not lost');
  await assert.rejects(ready.updatePrefs({ auto_rest_duration_sec: 125 }));
  assert.equal(h.render().loading, true, 'lane stays refreshing across follow-up');
  second.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('a') } })));
  await reload; await flush();
  assert.equal(gets, 2, 'multiple requests coalesce');
  assert.equal(h.render().permissionGranted, true); assert.equal(h.render().loading, false);
  assert.equal(h.render().error, null);
  h.fetchHook = null; await ready.updatePrefs({ auto_rest_duration_sec: 125 });
  assert.equal(h.render().prefs.auto_rest_duration_sec, 125);
});

for (const boundary of ['switch', 'unmount', 'return-to-a']) test(`stale callbacks and refresh cleanup are fenced at ${boundary}`, async () => {
  const h = harness(); h.render(); await flush(); const old = h.render();
  const aGate = deferred(), currentGate = deferred(), obsoleteBGate = deferred(); let oldGet = true;
  h.fetchHook = (c: any) => {
    if (c.action !== 'prefs') return null;
    if (oldGet) { oldGet = false; return aGate.promise; }
    if (boundary === 'return-to-a' && c.user === 'b') return obsoleteBGate.promise;
    return currentGate.promise;
  };
  const reload = old.reloadPrefs(); await flush(); await old.reloadPrefs();
  if (boundary === 'unmount') h.unmount();
  else {
    h.user = 'b'; h.render(); await flush();
    if (boundary === 'return-to-a') { h.user = 'a'; h.render(); await flush(); }
  }
  const before = h.calls.length;
  await assert.rejects(old.updatePrefs({ auto_rest_duration_sec: 125 }));
  await old.reloadPrefs(); await old.requestPermission();
  assert.equal(h.calls.length, before, 'stale callbacks cannot initiate IO, including A→B→A');
  aGate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('a'), auto_rest_duration_sec: 180 } })));
  await reload; await flush();
  assert.equal(h.calls.length, before, 'stale cleanup must not drain queued GET');
  if (boundary === 'unmount') assert.equal(old.getConfirmedPrefs(), null);
  else {
    assert.equal(h.render().loading, true, 'old cleanup cannot unlock current bootstrap');
    assert.equal(h.render().prefs, null, 'no old delivery');
    currentGate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get(h.user) } })));
    await flush(); const current = h.render();
    assert.equal(current.loading, false); assert.equal(current.prefs.auto_rest_duration_sec, 60);
    if (boundary === 'return-to-a') {
      obsoleteBGate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('b') } })));
      await flush(); assert.equal(h.render().prefs.user_id, 'a', 'obsolete B delivery stays fenced');
    }
    h.fetchHook = null; await current.updatePrefs({ auto_rest_duration_sec: 125 });
    assert.equal(h.render().prefs.auto_rest_duration_sec, 125);
  }
});

test('bootstrap callback uses current readiness and duplicate saves reject before IO', async () => {
  const h = harness(); const initial = h.render();
  await assert.rejects(initial.updatePrefs({ auto_rest_duration_sec: 125 }));
  await flush();
  const gate = deferred(); h.fetchHook = (c: any) => c.action === 'update_prefs' ? gate.promise : null;
  // No ready-state render: callback captured loading=true, current owner is ready.
  const save = initial.updatePrefs({ auto_rest_duration_sec: 180 }); await flush();
  await assert.rejects(initial.updatePrefs({ auto_rest_duration_sec: 125 }));
  assert.equal(h.calls.filter((c: any) => c.action === 'update_prefs').length, 1);
  gate.resolve(new Response(JSON.stringify({ prefs: { ...h.storage.get('a'), auto_rest_duration_sec: 180 } })));
  await save; assert.equal(h.render().saving, false); assert.equal(h.render().prefs.auto_rest_duration_sec, 180);
});

test('provider save cannot write account B after awaiting authentication', async () => {
  const h = harness(); h.render(); await flush(); const value = h.render();
  const gate = deferred(); h.sessionHook = () => gate.promise;
  const save = value.updatePrefs({ auto_rest_duration_sec: 180 }); const rejected = assert.rejects(save);
  h.user = 'b'; h.render(); h.sessionHook = null; gate.resolve(h.sessionResult());
  await rejected; await flush();
  assert.equal(h.calls.filter((c: any) => c.user === 'b' && c.action === 'update_prefs').length, 0);
  assert.equal(h.storage.get('b').auto_rest_duration_sec, 60);
});
