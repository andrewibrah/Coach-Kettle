import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const rendererRoots = new Set();
afterEach(() => {
  act(() => {
    for (const renderer of rendererRoots) renderer.unmount();
    rendererRoots.clear();
  });
});
const tick = async () => {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
};
function startAction(action) {
  let pending;
  act(() => { pending = action(); });
  return pending;
}
async function finishAction(pending) {
  let result;
  await act(async () => { result = await pending; });
  return result;
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
// Execute the actual TS/TSX modules with controlled native dependencies and hooks.
function load(path, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, require: id => {
    assert.ok(id in mocks, `Unexpected dependency: ${id}`);
    return mocks[id];
  }, console });
  return exports;
}
function storageHarness() {
  const data = new Map([['onboarding_draft', '{"focus":"fat_loss"}']]);
  const calls = [];
  const storage = {
    async getItem(key) { calls.push(['get', key]); return data.get(key) ?? null; },
    async setItem(key, value) { calls.push(['set', key]); data.set(key, value); },
    async removeItem(key) { calls.push(['remove', key]); data.delete(key); },
    async getAllKeys() { return [...data.keys()]; },
    async multiRemove(keys) { for (const key of keys) data.delete(key); },
  };
  const api = load('../onboardingDraft.ts', { '@react-native-async-storage/async-storage': storage });
  return { api, storage, data, calls };
}
function hooksHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const react = {
    createContext: value => ({ value, Provider: 'provider' }),
    useContext: context => context.value,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(fn) { return fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      const prior = slots[index];
      if (!prior || deps.some((d, i) => !Object.is(d, prior.deps[i]))) {
        effects.push(() => { prior?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
      }
    },
    createElement: (_type, props) => props.value,
  };
  return { react, render(Component) {
    cursor = 0;
    const value = Component({ children: null });
    const pending = effects; effects = [];
    pending.forEach(fn => fn());
    return value;
  } };
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ackFor = request => json(200, { ok: true, result: { request_id: request.request_id, onboarding_completed: true, template_ids: [] } });
// Real lib/profile.ts; only the authenticated fetch boundary is mocked.
function profileLib(fetchImpl) {
  return load('../profile.ts', {
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
    './supabase': { supabaseUrl: 'https://fixture.invalid' },
    './auth': { fetchWithAuth: (url, init) => fetchImpl(url, init) },
    './entitlements': { FeatureGateError: class {}, parseFeatureGateError: () => null },
  });
}
function providerHarness(api, refreshProfile = async () => {}, invalidateProfileCache = () => {}) {
  let owner = 'A';
  let currentValue;
  let renderer;
  let uuids = 0;
  const requests = [];
  const network = { respond: async request => ackFor(request) };
  const real = profileLib(async (url, init) => {
    const request = JSON.parse(init.body);
    requests.push(request);
    return network.respond(request);
  });
  const profile = { ...real, completeOnboarding: async () => true };
  const { OnboardingProvider, useOnboarding } = load('../../contexts/OnboardingContext.tsx', {
    react: React,
    'expo-crypto': { randomUUID: () => `00000000-0000-4000-8000-${String(++uuids).padStart(12, '0')}` },
    '@/contexts/AuthProvider': { useAuth: () => ({ session: owner ? { user: { id: owner } } : null }) },
    '@/contexts/ProfileContext': { useProfile: () => ({ refreshProfile }) },
    '@/lib/onboardingDraft': api, '@/lib/profile': profile,
    '@/lib/api': { invalidateProfileCache },
  });
  function Consumer() {
    currentValue = useOnboarding();
    return null;
  }
  const tree = () => React.createElement(
    React.StrictMode,
    null,
    React.createElement(OnboardingProvider, null, React.createElement(Consumer)),
  );
  return {
    profile, requests, network,
    owner(value) { owner = value; },
    render() {
      act(() => {
        if (renderer) renderer.update(tree());
        else {
          renderer = create(tree());
          rendererRoots.add(renderer);
        }
      });
      return currentValue;
    },
    unmount() {
      act(() => renderer?.unmount());
    },
  };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('owners use separate keys, empty draft persists, legacy stays quarantined', async () => {
  const { api, data, calls } = storageHarness();
  assert.equal(await api.getOnboardingDraft('A'), null);
  await api.saveOnboardingDraft('A', { current_step: 2 });
  await api.saveOnboardingDraft('B', {});
  assert.deepEqual(plain(await api.getOnboardingDraft('A')), { current_step: 2 });
  assert.deepEqual(plain(await api.getOnboardingDraft('B')), {});
  await api.clearOnboardingDraft('A');
  assert.deepEqual(plain(await api.getOnboardingDraft('B')), {});
  assert.equal(data.get('onboarding_draft'), '{"focus":"fat_loss"}');
  assert.ok(calls.every(([, key]) => key !== 'onboarding_draft'));
});

test('concurrent updates serialize read/merge/write and clear waits for prior writes', async () => {
  const { api, storage } = storageHarness();
  const gate = deferred();
  const set = storage.setItem;
  let writes = 0;
  storage.setItem = async (...args) => { if (++writes === 1) await gate.promise; await set(...args); };
  const first = api.updateOnboardingDraft('A', { current_step: 3 });
  const second = api.updateOnboardingDraft('A', { focus: 'strength' });
  await tick();
  assert.equal(writes, 1);
  await api.saveOnboardingDraft('B', {}); // Different owners never block each other.
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(plain(await api.getOnboardingDraft('A')), { current_step: 3, focus: 'strength' });
  const nextGate = deferred();
  storage.setItem = async (...args) => { await nextGate.promise; await set(...args); };
  const save = api.saveOnboardingDraft('A', {});
  const clear = api.clearOnboardingDraft('A');
  await tick();
  nextGate.resolve();
  await Promise.all([save, clear]);
  assert.equal(await api.getOnboardingDraft('A'), null);
});

test('storage errors reject and do not poison the owner queue', async () => {
  const { api, storage } = storageHarness();
  const set = storage.setItem;
  storage.setItem = async () => { throw new Error('set failed'); };
  await assert.rejects(api.saveOnboardingDraft('A', {}), /set failed/);
  await assert.rejects(api.updateOnboardingDraft('A', {}), /set failed/);
  storage.setItem = set;
  await api.saveOnboardingDraft('A', {});
  storage.removeItem = async () => { throw new Error('remove failed'); };
  await assert.rejects(api.clearOnboardingDraft('A'), /remove failed/);
  storage.getItem = async () => { throw new Error('get failed'); };
  await assert.rejects(api.getOnboardingDraft('A'), /get failed/);
});

test('late A hydration cannot populate B, and sign-out resets memory', async () => {
  const { api } = storageHarness();
  const gate = deferred();
  const h = providerHarness({ ...api, getOnboardingDraft: owner => owner === 'A' ? gate.promise : Promise.resolve({ current_step: 2 }) });
  h.render(); h.owner('B'); h.render(); await tick();
  assert.deepEqual(plain(h.render().draft), { current_step: 2 });
  gate.resolve({ focus: 'strength' }); await tick();
  assert.deepEqual(plain(h.render().draft), { current_step: 2 });
  h.owner(null); h.render(); await tick();
  assert.deepEqual(plain(h.render().draft), {});
});

test('provider merges immediately, tracks overlapping saves, retains failed input and retries it', async () => {
  const { api, storage } = storageHarness();
  const h = providerHarness(api); h.render(); await tick();
  const gate = deferred(); const set = storage.setItem;
  storage.setItem = async () => { await gate.promise; throw new Error('disk full'); };
  const value = h.render();
  const first = startAction(() => value.updateDraft({ focus: 'strength' }));
  const rejected = assert.rejects(first, /disk full/);
  assert.deepEqual(plain(h.render().draft), { focus: 'strength' });
  assert.equal(h.render().draftSaving, true);
  gate.resolve(); await finishAction(rejected);
  assert.equal(h.render().draftSaving, false);
  storage.setItem = set;
  const second = startAction(() => h.render().updateDraft({ current_step: 4 }));
  const third = startAction(() => h.render().updateDraft({ height_value: 180 }));
  await finishAction(Promise.all([second, third]));
  assert.deepEqual(plain(await api.getOnboardingDraft('A')), { focus: 'strength', current_step: 4, height_value: 180 });
});

for (const action of ['skipOnboarding', 'batchSaveAndComplete']) {
  test(`${action} does not invalidate B cache when identity changes during profile refresh`, async () => {
    const { api } = storageHarness();
    await api.saveOnboardingDraft('A', { current_step: 1 });
    await api.saveOnboardingDraft('B', { current_step: 2 });
    const gate = deferred();
    let refreshes = 0;
    let invalidations = 0;
    const h = providerHarness(api, async () => { refreshes++; await gate.promise; }, () => { invalidations++; });
    h.render(); await tick();
    const pending = startAction(() => h.render()[action]());
    await tick();
    assert.equal(refreshes, 1);
    h.owner('B'); h.render(); await tick();
    gate.resolve();
    assert.equal((await finishAction(pending)).success, true);
    assert.equal(invalidations, 0);
    assert.deepEqual(plain(h.render().draft), { current_step: 2 });
    assert.deepEqual(plain(await api.getOnboardingDraft('B')), { current_step: 2 });
    const currentOwnerResult = startAction(() => h.render()[action]());
    assert.equal((await finishAction(currentOwnerResult)).success, true);
    assert.equal(invalidations, 1);
  });

  test(`${action} clears only captured owner and guards memory across identity changes`, async () => {
    const { api } = storageHarness();
    await api.saveOnboardingDraft('A', { current_step: 1 });
    await api.saveOnboardingDraft('B', { current_step: 2 });
    const h = providerHarness(api); h.render(); await tick();
    const gate = deferred();
    h.profile.completeOnboarding = async () => { await gate.promise; return true; };
    h.network.respond = async request => { await gate.promise; return ackFor(request); };
    const pending = startAction(() => h.render()[action]());
    await tick(); // Request is in flight for A before the identity changes.
    h.owner('B'); h.render(); await tick(); gate.resolve();
    assert.equal((await finishAction(pending)).success, true);
    assert.equal(await api.getOnboardingDraft('A'), null);
    assert.deepEqual(plain(h.render().draft), { current_step: 2 });
    const currentOwnerResult = startAction(() => h.render()[action]());
    assert.equal((await finishAction(currentOwnerResult)).success, true);
    assert.deepEqual(plain(h.render().draft), {});
    assert.equal(await api.getOnboardingDraft('B'), null);
  });
}

test('auth cleanup captures owner and continues after an earlier cache failure', async (t) => {
  const { api, storage, data } = storageHarness();
  await api.saveOnboardingDraft('A', {}); await api.saveOnboardingDraft('B', {});
  const laterKeys = ['nutrition_weekly_goals_v1', 'nutrition_targets_local_v1', 'sb-session'];
  laterKeys.forEach(key => data.set(key, 'cached'));
  const removeItem = storage.removeItem;
  storage.removeItem = async key => {
    if (key === 'cached_profile') throw new Error('profile clear failed');
    await removeItem(key);
  };
  const warnings = t.mock.method(console, 'warn', () => {});
  const hooks = hooksHarness(); const gate = deferred(); let authChange; let exerciseCleared = false;
  const { AuthProvider } = load('../../contexts/AuthProvider.tsx', {
    react: hooks.react, '@react-native-async-storage/async-storage': storage,
    '@/lib/supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: { user: { id: 'A' } } } }),
      onAuthStateChange: fn => { authChange = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    } } },
    '@/lib/iap': { logOutRevenueCat: async () => {} },
    '@/lib/workoutDraft': { clearWorkoutDraft: async () => {} },
    '@/lib/workoutStorage': { clearWorkouts: async () => gate.promise },
    '@/lib/exerciseLibrary': { clearExerciseCache: async () => { exerciseCleared = true; } },
    '@/lib/onboardingDraft': api,
  });
  hooks.render(AuthProvider); await tick();
  const pending = hooks.render(AuthProvider).clearAllCaches();
  authChange('SIGNED_IN', { user: { id: 'B' } }); hooks.render(AuthProvider);
  gate.resolve(); await pending;
  assert.equal(exerciseCleared, true);
  assert.equal(await api.getOnboardingDraft('A'), null);
  assert.deepEqual(plain(await api.getOnboardingDraft('B')), {});
  assert.ok(data.has('onboarding_draft'));
  for (const key of laterKeys) assert.equal(data.has(key), false, `${key} should be cleared`);
  assert.equal(warnings.mock.callCount(), 1);
  assert.match(warnings.mock.calls[0].arguments[0], /profile/i);
});

test('draftSaving stays true until all saves settle, and old-owner saves cannot change B', async () => {
  const { api } = storageHarness();
  const firstGate = deferred(); const secondGate = deferred(); let saves = 0;
  const h = providerHarness({ ...api, updateOnboardingDraft: async () => {
    await (++saves === 1 ? firstGate.promise : secondGate.promise);
  } });
  h.render(); await tick();
  const first = startAction(() => h.render().updateDraft({ current_step: 1 }));
  const second = startAction(() => h.render().updateDraft({ focus: 'strength' }));
  assert.equal(h.render().draftSaving, true);
  firstGate.resolve(); await finishAction(first);
  assert.equal(h.render().draftSaving, true);
  h.owner('B'); h.render(); await tick();
  assert.equal(h.render().draftSaving, false);
  secondGate.resolve(); await finishAction(second);
  assert.deepEqual(plain(h.render().draft), {});
  assert.equal(h.render().draftSaving, false);
});

test('hydration preserves input entered while the read is pending', async () => {
  const { api } = storageHarness(); const gate = deferred();
  const h = providerHarness({ ...api, getOnboardingDraft: () => gate.promise });
  h.render();
  await finishAction(startAction(() => h.render().updateDraft({ focus: 'strength' })));
  gate.resolve({ focus: 'fat_loss', current_step: 2 }); await tick();
  assert.deepEqual(plain(h.render().draft), { focus: 'strength', current_step: 2 });
});

test('real ProfileProvider never publishes an old-owner refresh after account switch', async () => {
  let owner = 'A';
  let currentValue;
  let renderer;
  const gate = deferred();
  const profileApi = {
    ensureProfile: async userId => ({ id: userId, onboarding_completed: false }),
    fetchProfile: async userId => userId === 'A'
      ? gate.promise
      : { id: userId, onboarding_completed: false },
    updateProfile: async () => null,
    completeOnboarding: async () => false,
    updateOnboardingStep: async () => false,
    refreshAIContext: async () => {},
  };
  const { ProfileProvider, useProfile } = load('../../contexts/ProfileContext.tsx', {
    react: React,
    '@/contexts/AuthProvider': { useAuth: () => ({
      session: owner ? { user: { id: owner } } : null,
      loading: false,
    }) },
    '@/lib/profile': profileApi,
    '@/lib/api': { invalidateProfileCache: () => {} },
  });
  function Consumer() {
    currentValue = useProfile();
    return null;
  }
  const tree = () => React.createElement(
    React.StrictMode,
    null,
    React.createElement(ProfileProvider, null, React.createElement(Consumer)),
  );
  const render = () => {
    act(() => {
      if (renderer) renderer.update(tree());
      else {
        renderer = create(tree());
        rendererRoots.add(renderer);
      }
    });
  };

  render(); await tick();
  assert.equal(currentValue.profile.id, 'A');
  const staleRefresh = startAction(() => currentValue.refreshProfile());
  owner = 'B'; render(); await tick();
  assert.equal(currentValue.profile.id, 'B');
  gate.resolve({ id: 'A', onboarding_completed: false });
  await finishAction(staleRefresh);
  assert.equal(currentValue.profile.id, 'B');
});

test('real ProfileProvider hides A while B loads and after B load fails', async (t) => {
  let owner = 'A';
  let currentValue;
  let renderer;
  const bLoad = deferred();
  const errors = t.mock.method(console, 'error', () => {});
  const { ProfileProvider, useProfile } = load('../../contexts/ProfileContext.tsx', {
    react: React,
    '@/contexts/AuthProvider': { useAuth: () => ({
      session: { user: { id: owner } },
      loading: false,
    }) },
    '@/lib/profile': {
      ensureProfile: async userId => userId === 'B'
        ? bLoad.promise
        : { id: userId, onboarding_completed: false },
      fetchProfile: async () => null,
      updateProfile: async () => null,
      completeOnboarding: async () => false,
      updateOnboardingStep: async () => false,
      refreshAIContext: async () => {},
    },
    '@/lib/api': { invalidateProfileCache: () => {} },
  });
  function Consumer() {
    currentValue = useProfile();
    return null;
  }
  const tree = () => React.createElement(
    React.StrictMode,
    null,
    React.createElement(ProfileProvider, null, React.createElement(Consumer)),
  );
  const render = () => {
    act(() => {
      if (renderer) renderer.update(tree());
      else {
        renderer = create(tree());
        rendererRoots.add(renderer);
      }
    });
  };

  render(); await tick();
  assert.equal(currentValue.profile.id, 'A');
  owner = 'B'; render();
  assert.equal(currentValue.profile, null);
  assert.equal(currentValue.profileLoading, true);
  bLoad.reject(new Error('B load failed')); await tick();
  assert.equal(currentValue.profile, null);
  assert.equal(currentValue.profileLoading, false);
  assert.equal(currentValue.needsOnboarding, false);
  assert.ok(errors.mock.callCount() >= 1);
});

test('auth cleanup continues after scoped draft clear rejects and preserves legacy draft', async (t) => {
  const { api, storage, data } = storageHarness();
  await api.saveOnboardingDraft('A', {});
  await api.saveOnboardingDraft('B', {});
  const laterKeys = ['nutrition_weekly_goals_v1', 'nutrition_targets_local_v1',
    'sb-session', 'supabase-cache', 'auth-cache', 'coach-kettle:nutrition:A'];
  laterKeys.forEach(key => data.set(key, 'cached'));
  const failure = new Error('draft clear failed');
  const warnings = t.mock.method(console, 'warn', () => {});
  const owners = [];
  const hooks = hooksHarness();
  const { AuthProvider } = load('../../contexts/AuthProvider.tsx', {
    react: hooks.react, '@react-native-async-storage/async-storage': storage,
    '@/lib/supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: { user: { id: 'A' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } } },
    '@/lib/iap': { logOutRevenueCat: async () => {} },
    '@/lib/workoutDraft': { clearWorkoutDraft: async () => {} },
    '@/lib/workoutStorage': { clearWorkouts: async () => {} },
    '@/lib/exerciseLibrary': { clearExerciseCache: async () => {} },
    '@/lib/onboardingDraft': { ...api, clearOnboardingDraft: async owner => {
      owners.push(owner); throw failure;
    } },
  });
  hooks.render(AuthProvider); await tick();
  await hooks.render(AuthProvider).clearAllCaches();
  assert.deepEqual(owners, ['A']);
  for (const key of laterKeys) assert.equal(data.has(key), false, `${key} should be cleared`);
  assert.equal(data.get('onboarding_draft'), '{"focus":"fat_loss"}');
  assert.deepEqual(plain(await api.getOnboardingDraft('B')), {});
  assert.equal(warnings.mock.callCount(), 1);
  assert.match(warnings.mock.calls[0].arguments[0], /onboarding draft/i);
  assert.equal(warnings.mock.calls[0].arguments.length, 1);
});

// ---- Atomic onboarding completion ----

const REQUEST_ID = '00000000-0000-4000-8000-000000000001';

test('completion payload matches the SQL wire contract exactly', () => {
  const lib = profileLib(async () => { throw new Error('unused'); });
  const draft = {
    height_value: 70, height_unit: 'in', dob: '2000-01-01', current_weight: 200, goal_weight: null,
    weight_unit: 'lb', focus: 'other', focus_other: '   ', current_step: 8, completion_request_id: REQUEST_ID,
    tracked_lifts: ['Squat', 'Bench'], pr_values: [{ lift_name: 'Squat', weight_lbs: 300, reps: 5 }],
    workout_templates: [{ name: 'Day A', lifts: [{ name: 'Squat', sets: 5, reps: 5 }, { name: 'Bench', sets: 3, reps: 8 }] }],
  };
  assert.deepEqual(plain(lib.buildOnboardingCompletionPayload(draft)), {
    profile: { height_value: 70, height_unit: 'in', dob: '2000-01-01', current_weight: 200, goal_weight: null, weight_unit: 'lb', focus: 'other', focus_other: null },
    tracked_lifts: ['Squat', 'Bench'],
    pr_values: [{ lift_name: 'Squat', weight_lbs: 300, reps: 5 }],
    workout_templates: [{ name: 'Day A', items: [
      { lift_name: 'Squat', target_sets: 5, target_reps: 5 },
      { lift_name: 'Bench', target_sets: 3, target_reps: 8 },
    ] }],
  });
  assert.deepEqual(plain(lib.buildOnboardingCompletionPayload({ current_step: 3 })),
    { profile: {}, tracked_lifts: [], pr_values: [], workout_templates: [] });
  // Parity: every key the builder can emit is one the migration's rules accept.
  const sql = readFileSync(new URL('../../supabase/migrations/20260909000100_atomic_onboarding.sql', import.meta.url), 'utf8');
  const rules = [...sql.matchAll(/'(\{"[^']+\})'::jsonb/g)].map(m => Object.keys(JSON.parse(m[1])));
  const [profileKeys, prKeys, templateKeys, itemKeys] = rules;
  const full = lib.buildOnboardingCompletionPayload(draft);
  assert.deepEqual(Object.keys(full).sort(), ['pr_values', 'profile', 'tracked_lifts', 'workout_templates']);
  for (const key of Object.keys(full.profile)) assert.ok(profileKeys.includes(key), key);
  for (const key of Object.keys(full.pr_values[0])) assert.ok(prKeys.includes(key), key);
  for (const key of Object.keys(full.workout_templates[0])) assert.ok(templateKeys.includes(key), key);
  for (const key of Object.keys(full.workout_templates[0].items[0])) assert.ok(itemKeys.includes(key), key);
});

test('completeOnboardingAtomic succeeds only on an explicit acknowledged result', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  const payload = { profile: {}, tracked_lifts: [], pr_values: [], workout_templates: [] };
  const cases = [
    [async r => ackFor(r), { ok: true }],
    [async () => json(200, { ok: true }), { ok: false, retryable: true }],
    [async r => json(200, { ok: true, warnings: ['pr failed'], result: { request_id: r.request_id, onboarding_completed: true } }), { ok: false, retryable: true }],
    [async () => json(200, { ok: true, result: { request_id: 'other', onboarding_completed: true } }), { ok: false, retryable: true }],
    [async () => json(500, { error: 'Internal server error' }), { ok: false, retryable: true }],
    [async () => json(502, 'not json'), { ok: false, retryable: true }],
    [async () => { throw new Error('offline'); }, { ok: false, retryable: true }],
    [async () => json(400, { error: 'Invalid onboarding data', code: 'ONBOARDING_INVALID_PAYLOAD' }), { ok: false, retryable: false, code: 'ONBOARDING_INVALID_PAYLOAD' }],
    [async () => json(409, { error: 'conflict', code: 'ONBOARDING_REQUEST_CONFLICT' }), { ok: false, retryable: false, code: 'ONBOARDING_REQUEST_CONFLICT' }],
    [async () => json(400, { error: 'Unknown action' }), { ok: false, retryable: false, generic: true }],
  ];
  for (const [respond, expected] of cases) {
    const sent = [];
    const lib = profileLib(async (url, init) => { sent.push({ url, body: JSON.parse(init.body), method: init.method }); return respond(JSON.parse(init.body)); });
    const result = await lib.completeOnboardingAtomic(REQUEST_ID, payload);
    assert.equal(result.ok, expected.ok, JSON.stringify(result));
    if (!expected.ok) {
      assert.equal(result.retryable, expected.retryable, JSON.stringify(result));
      assert.equal(typeof result.error, 'string');
      if (expected.code) assert.equal(result.code, expected.code);
      if (expected.generic) assert.doesNotMatch(result.error, /Unknown action/);
    } else {
      assert.equal(result.result.request_id, REQUEST_ID);
    }
    assert.deepEqual(sent, [{ url: 'https://fixture.invalid/functions/v1/profile', method: 'POST',
      body: { action: 'complete_onboarding_atomic', request_id: REQUEST_ID, payload } }]);
  }
});

test('request id is persisted before sending and reused on retry and across restart; 5xx/warnings keep the draft', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  const { api, data } = storageHarness();
  await api.saveOnboardingDraft('A', { focus: 'strength', tracked_lifts: ['Squat'] });
  const h = providerHarness(api); h.render(); await tick();
  const persistedAtSend = [];
  h.network.respond = async () => {
    persistedAtSend.push(JSON.parse(data.get('coach-kettle:onboarding-draft:A')).completion_request_id);
    return json(500, { error: 'Internal server error' });
  };
  assert.equal((await finishAction(startAction(() => h.render().batchSaveAndComplete()))).success, false);
  h.network.respond = async r => json(200, { ok: true, warnings: ['x'], result: { request_id: r.request_id, onboarding_completed: true } });
  assert.equal((await finishAction(startAction(() => h.render().batchSaveAndComplete()))).success, false);
  const id = h.requests[0].request_id;
  assert.equal(persistedAtSend[0], id);
  assert.equal(h.requests[1].request_id, id);
  assert.deepEqual(h.requests[0].payload, h.requests[1].payload);
  assert.equal(h.requests[0].payload.profile.focus, 'strength');
  assert.equal('completion_request_id' in h.requests[0].payload.profile, false);
  assert.deepEqual(plain(await api.getOnboardingDraft('A')), { focus: 'strength', tracked_lifts: ['Squat'], completion_request_id: id });
  assert.equal(h.render().draft.focus, 'strength');
  h.unmount();
  // App restart: a fresh provider over the same storage reuses the stored id.
  const restarted = providerHarness(api); restarted.render(); await tick();
  assert.equal((await finishAction(startAction(() => restarted.render().batchSaveAndComplete()))).success, true);
  assert.equal(restarted.requests[0].request_id, id);
  assert.equal(await api.getOnboardingDraft('A'), null);
  assert.deepEqual(plain(restarted.render().draft), {});
});

test('concurrent completion calls share one in-flight request', async () => {
  const { api } = storageHarness();
  const h = providerHarness(api); h.render(); await tick();
  const gate = deferred();
  h.network.respond = async r => { await gate.promise; return ackFor(r); };
  const value = h.render();
  const first = startAction(() => value.batchSaveAndComplete());
  const second = startAction(() => value.batchSaveAndComplete());
  await tick();
  gate.resolve();
  const results = await finishAction(Promise.all([first, second]));
  assert.deepEqual(results.map(r => r.success), [true, true]);
  assert.equal(h.requests.length, 1);
  // A later call after success does not send an ambiguous new request.
  assert.equal((await finishAction(startAction(() => h.render().batchSaveAndComplete()))).success, true);
  assert.equal(h.requests.length, 1);
});

test('409 conflict surfaces a non-retryable error and keeps the draft', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { api } = storageHarness();
  await api.saveOnboardingDraft('A', { focus: 'strength' });
  const h = providerHarness(api); h.render(); await tick();
  h.network.respond = async () => json(409, { error: 'conflict', code: 'ONBOARDING_REQUEST_CONFLICT' });
  h.profile.fetchProfile = async () => ({ onboarding_completed: false });
  const result = await finishAction(startAction(() => h.render().batchSaveAndComplete()));
  assert.equal(result.success, false);
  assert.match(result.error, /\S/);
  assert.equal((await api.getOnboardingDraft('A')).focus, 'strength');
  assert.equal((await api.getOnboardingDraft('A')).completion_request_id, h.requests[0].request_id);
});

for (const code of ['ONBOARDING_REQUEST_CONFLICT', 'ONBOARDING_ALREADY_COMPLETED']) {
  test(`lost ack then edited answers: ${code} with a server-completed profile finishes instead of trapping the user`, async (t) => {
    t.mock.method(console, 'error', () => {});
    const { api } = storageHarness();
    await api.saveOnboardingDraft('A', { focus: 'strength' });
    const h = providerHarness(api); h.render(); await tick();
    h.network.respond = async () => json(409, { error: 'conflict', code });
    const checked = [];
    h.profile.fetchProfile = async (userId) => { checked.push(userId); return { onboarding_completed: true }; };
    const result = await finishAction(startAction(() => h.render().batchSaveAndComplete()));
    assert.equal(result.success, true);
    assert.deepEqual(checked, ['A']);
    assert.equal(await api.getOnboardingDraft('A'), null);
    assert.deepEqual(plain(h.render().draft), {});
  });
}

test('failure to persist the request id sends nothing', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { api, storage } = storageHarness();
  const h = providerHarness(api); h.render(); await tick();
  storage.setItem = async () => { throw new Error('disk full'); };
  const result = await finishAction(startAction(() => h.render().batchSaveAndComplete()));
  assert.equal(result.success, false);
  assert.equal(h.requests.length, 0);
});
