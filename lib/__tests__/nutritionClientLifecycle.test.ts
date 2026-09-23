import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
// @ts-ignore renderer ships without declarations
import Renderer, { act } from 'react-test-renderer';
import * as targetLib from '../nutritionTargets.ts';
import * as storageLib from '../nutritionTargetStorage.ts';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function load(path: string, deps: Record<string, any>) {
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, Error, TypeError, Promise, console, require: (name: string) => { if (name === 'react') return React; if (name in deps) return deps[name]; throw new Error(name); },
  });
  return exports;
}
const macro = { calories: 2100, protein_g: 150, carbs_g: 220, fat_g: 70 };
const saved = { id: 's', user_id: 'a', source: 'manual', base_target: macro, updated_at: '', created_at: '' };
const deferred = () => { let resolve!: (x: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
async function contextHarness() {
  let user = 'a'; let current: any;
  const data = new Map<string, string>();
  const storage = { getItem: async (k: string) => data.get(k) ?? null, setItem: async (k: string, v: string) => { data.set(k, v); }, removeItem: async (k: string) => { data.delete(k); } };
  const api: any = {
    fetchFoodLogDay: async () => ({ entries: [], totals: null }), fetchNutritionTargets: async () => ({ targets: null }),
    fetchNutritionTargetSet: async () => ({ target_set: saved }), fetchMealPlan: async () => ({ plan: null, meals: [] }), fetchRecentFoods: async () => ({ foods: [] }),
    saveNutritionTargetSet: async () => ({ targets: saved }), isRetryableNutritionError: (e: any) => e instanceof TypeError,
  };
  const mod = load('../../contexts/NutritionContext.tsx', {
    'react-native': { AppState: {} }, '@react-native-async-storage/async-storage': storage,
    '@/contexts/AuthProvider': { useAuth: () => ({ session: { user: { id: user } } }) }, '@/contexts/ProfileContext': { useProfile: () => ({ profile: null }) },
    '@/lib/nutrition': api, '@/lib/trainingSchedule': { isTrainingDay: () => true }, '@/lib/workoutRules': { todayISO: () => '2026-09-14' },
    '@/lib/nutritionTargets': targetLib, '@/lib/nutritionTargetStorage': storageLib, '@/lib/nutritionDay': { watchNutritionDay: () => () => {} },
  });
  function Child() { current = mod.useNutrition(); return null; }
  const tree = () => React.createElement(mod.NutritionProvider, null, React.createElement(Child));
  let root: any; await act(async () => { root = Renderer.create(tree()); });
  return { api, data, storage, get value() { return current; }, switchUser: async () => { user = 'b'; await act(async () => root.update(tree())); }, close: async () => { await act(async () => root.unmount()); } };
}
test('context import confirms, merges, retains local goals on failure and ignores account-switch completion', async () => {
  const h = await contextHarness();
  try {
    await act(async () => h.value.saveWeeklyGoals({ 1: macro }));
    await assert.rejects(h.value.importWeeklyGoals(false), /Confirm/);
    let request: any;
    h.api.fetchNutritionTargetSet = async () => ({ target_set: { ...saved, day_overrides: [{ day_of_week: 2, target: macro, source: 'manual' }] } });
    h.api.saveNutritionTargetSet = async (r: any) => { request = r; throw new Error('HTTP 400'); };
    await act(async () => { await assert.rejects(h.value.importWeeklyGoals(true), /400/); });
    assert.deepEqual(Array.from(request.targets.day_overrides, (x: any) => x.day_of_week), [1, 2]);
    assert.equal(h.value.weeklyGoals[1].calories, 2100);
    assert.equal(h.data.has(storageLib.targetStorageKey('a', 'pending-save')), false);
    h.api.saveNutritionTargetSet = async () => { throw new TypeError('Network request failed'); };
    await act(async () => { await assert.rejects(h.value.saveTargets(request)); });
    assert.equal(h.value.syncStatus, 'pending');
    const d = deferred(); h.api.fetchNutritionTargetSet = () => d.promise;
    let importing!: Promise<void>;
    await act(async () => { importing = h.value.importWeeklyGoals(true); });
    await h.switchUser();
    await act(async () => { d.resolve({ target_set: null }); await assert.rejects(importing, /Account changed/); });
    assert.equal(h.value.weeklyGoals[1], undefined);
    assert.ok(h.data.get('coach-kettle:nutrition-weekly-goals:a'));
  } finally { await h.close(); }
});
test('context keeps prior plan on failed readback and rejects noncommitted expected plan', async () => {
  const h = await contextHarness();
  try {
    h.api.fetchMealPlan = async () => ({ plan: { id: 'old', status: 'active' }, meals: [{ id: 'm' }] });
    await act(async () => h.value.refreshMealPlan('old'));
    h.api.fetchMealPlan = async () => ({ plan: { id: 'new', status: 'generating' }, meals: [] });
    await act(async () => { await assert.rejects(h.value.refreshMealPlan('new')); });
    assert.equal(h.value.mealPlan.plan.id, 'old'); assert.equal(h.value.mealPlanStatus, 'error');
  } finally { await h.close(); }
});
test('latest plan readback wins when earlier refresh completes late', async () => {
  const h = await contextHarness();
  try {
    const d = deferred(); h.api.fetchMealPlan = () => d.promise;
    let earlier: Promise<void>;
    await act(async () => { earlier = h.value.refreshMealPlan(); });
    h.api.fetchMealPlan = async () => ({ plan: { id: 'new', status: 'active' }, meals: [{ id: 'm' }] });
    await act(async () => h.value.refreshMealPlan('new'));
    await act(async () => { d.resolve({ plan: null, meals: [] }); await earlier; });
    assert.equal(h.value.mealPlan.plan?.id, 'new');
  } finally { await h.close(); }
});
test('accepted target save survives an older refresh in state and owner cache without discarding food or plan', async () => {
  const h = await contextHarness();
  try {
    const food = deferred();
    h.api.fetchFoodLogDay = () => food.promise;
    h.api.fetchMealPlan = async () => ({ plan: { id: 'refreshed-plan' }, meals: [] });
    let refreshing!: Promise<void>;
    await act(async () => { refreshing = h.value.refresh(); });
    const accepted = { ...saved, id: 'new-save', base_target: { ...macro, calories: 2300 } };
    h.api.saveNutritionTargetSet = async () => ({ targets: accepted });
    await act(async () => h.value.saveTargets({ targets: accepted }));
    await act(async () => { food.resolve({ entries: [{ id: 'fresh-food' }], totals: null }); await refreshing; });
    assert.equal(h.value.savedTargets.id, 'new-save');
    assert.equal(h.value.todayTarget.target.calories, 2300);
    assert.equal(JSON.parse(h.data.get(storageLib.targetStorageKey('a', 'cache'))!).id, 'new-save');
    assert.equal(h.data.has(storageLib.targetStorageKey('b', 'cache')), false);
    assert.equal(h.value.entries[0].id, 'fresh-food');
    assert.equal(h.value.mealPlan.plan.id, 'refreshed-plan');
    assert.equal(h.value.loading, false);
    h.api.fetchNutritionTargetSet = async () => ({ target_set: { ...accepted, id: 'later-server' } });
    await act(async () => h.value.refresh());
    assert.equal(h.value.savedTargets.id, 'later-server');
    assert.equal(JSON.parse(h.data.get(storageLib.targetStorageKey('a', 'cache'))!).id, 'later-server');
  } finally { await h.close(); }
});
for (const path of ['weekly import', 'legacy import', 'offline cache', 'pending read', 'pending response'] as const) {
  test(`accepted targets survive stale ${path} work in state and cache`, async () => {
    const h = await contextHarness();
    try {
      const stalled = deferred();
      const cacheKey = storageLib.targetStorageKey('a', 'cache');
      const pendingKey = storageLib.targetStorageKey('a', 'pending-save');
      const accepted = { ...saved, id: 'accepted', base_target: { ...macro, calories: 2300 } };
      let release: any = { entries: [], totals: null };
      if (path === 'legacy import') {
        h.data.set(storageLib.LEGACY_LOCAL_TARGETS_KEY, JSON.stringify({ training_calories: 2300 }));
        h.api.fetchNutritionTargetSet = async () => ({ target_set: null });
        await act(async () => h.value.refresh());
        assert.ok(h.value.legacyImport);
      }
      if (path === 'offline cache' || path === 'pending read') {
        const key = path === 'offline cache' ? cacheKey : pendingKey;
        if (path === 'offline cache') h.api.fetchNutritionTargetSet = async () => { throw new TypeError('offline'); };
        h.storage.getItem = async (k: string) => k === key ? stalled.promise : h.data.get(k) ?? null;
        release = JSON.stringify(path === 'offline cache' ? saved : { targets: { base: macro } });
      } else if (path === 'pending response') {
        h.data.set(pendingKey, JSON.stringify({ targets: { base: macro } }));
        h.api.saveNutritionTargetSet = () => stalled.promise;
        release = { targets: saved };
      } else {
        h.api.fetchFoodLogDay = () => stalled.promise;
      }
      let refreshing!: Promise<void>;
      await act(async () => { refreshing = h.value.refresh(); });
      let saves = 0;
      h.api.saveNutritionTargetSet = async () => { saves++; return { targets: accepted }; };
      let saving!: Promise<void>;
      await act(async () => {
        if (path === 'weekly import') saving = h.value.importWeeklyGoals(true);
        else if (path === 'legacy import') saving = h.value.importLegacyTargets();
        else saving = h.value.saveTargets({ targets: { base: accepted.base_target } });
        if (path !== 'pending response') await saving;
      });
      await act(async () => { stalled.resolve(release); await refreshing; await saving; });
      assert.equal(saves, 1, 'stale pending read must not start another mutation');
      assert.equal(h.value.savedTargets.id, 'accepted');
      assert.equal(h.value.todayTarget.target.calories, 2300);
      assert.equal(JSON.parse(h.data.get(cacheKey)!).id, 'accepted');
      assert.equal(h.value.syncStatus, 'synced');
    } finally { await h.close(); }
  });
}
for (const boundary of ['cache write', 'pending removal'] as const) {
  test(`accepted save cleanup preserves new owner's draft after applied ${boundary} waits to resolve`, async () => {
    const h = await contextHarness();
    try {
      const stalled = deferred();
      const aCache = storageLib.targetStorageKey('a', 'cache');
      const aPending = storageLib.targetStorageKey('a', 'pending-save');
      const aDraft = storageLib.targetStorageKey('a', 'draft');
      const bDraft = storageLib.targetStorageKey('b', 'draft');
      const bPending = storageLib.targetStorageKey('b', 'pending-save');
      const draft = { source: 'manual', base_target: { ...macro, calories: 2700 } };
      await act(async () => h.value.saveDraft({ source: 'manual', base_target: macro }));
      h.data.set(aPending, JSON.stringify({ targets: { base: macro } }));
      const removed: string[] = [];
      let applied = false;
      h.storage.setItem = async (key: string, value: string) => {
        h.data.set(key, value);
        if (boundary === 'cache write' && key === aCache) { applied = true; await stalled.promise; }
      };
      h.storage.removeItem = async (key: string) => {
        removed.push(key);
        h.data.delete(key);
        if (boundary === 'pending removal' && key === aPending) { applied = true; await stalled.promise; }
      };
      let saving!: Promise<void>;
      let completion: unknown;
      await act(async () => { saving = h.value.saveTargets({ targets: { base: macro } }).catch((e: unknown) => { completion = e; }); });
      assert.equal(applied, true, 'storage side effect must precede owner switch, while its promise is held');
      assert.equal(JSON.parse(h.data.get(aCache)!).user_id, 'a');
      h.api.fetchNutritionTargetSet = async () => ({ target_set: { ...saved, id: 'b-saved', user_id: 'b' } });
      await h.switchUser();
      await act(async () => h.value.saveDraft(draft));
      h.data.set(bPending, 'b-pending');
      const bCache = h.data.get(storageLib.targetStorageKey('b', 'cache'));
      removed.length = 0;
      await act(async () => { stalled.resolve(undefined); await saving; });
      assert.deepEqual(h.value.draftTargets, draft, 'A cleanup must not clear B in-memory draft');
      assert.deepEqual(JSON.parse(h.data.get(bDraft)!), draft, 'B disk draft must also remain');
      assert.equal(h.data.get(bPending), 'b-pending');
      assert.equal(h.data.get(storageLib.targetStorageKey('b', 'cache')), bCache);
      assert.equal(h.value.savedTargets.id, 'b-saved');
      assert.equal(h.value.syncStatus, 'synced');
      assert.equal(h.data.has(aDraft), false);
      assert.equal(h.data.has(aPending), false);
      assert.ok(removed.includes(aDraft));
      assert.ok(removed.every(key => key === aDraft || key === aPending), 'late cleanup may only remove captured A keys');
      assert.match(String(completion), /Account changed/);
    } finally { await h.close(); }
  });
}
test('old owner draft callbacks cannot publish into the new owner', async () => {
  const h = await contextHarness();
  try {
    const old = h.value;
    await h.switchUser();
    const draft = { source: 'manual', base_target: { ...macro, calories: 2800 } };
    await act(async () => h.value.saveDraft(draft));
    await act(async () => old.clearDraft());
    assert.deepEqual(h.value.draftTargets, draft);
    await act(async () => old.saveDraft({ source: 'manual', base_target: macro }));
    assert.deepEqual(h.value.draftTargets, draft);
    assert.deepEqual(JSON.parse(h.data.get(storageLib.targetStorageKey('b', 'draft'))!), draft);
  } finally { await h.close(); }
});
for (const action of ['import', 'dismiss'] as const) {
  test(`late legacy ${action} storage completion cannot clear the new owner's import`, async () => {
    const h = await contextHarness();
    try {
      h.api.fetchNutritionTargetSet = async () => ({ target_set: null });
      const legacyKey = storageLib.LEGACY_LOCAL_TARGETS_KEY;
      h.data.set(legacyKey, JSON.stringify({ training_calories: 2300 }));
      await act(async () => h.value.refresh());
      assert.ok(h.value.legacyImport);
      const stalled = deferred();
      let applied = false;
      h.storage.removeItem = async (key: string) => {
        h.data.delete(key);
        if (key === legacyKey) { applied = true; await stalled.promise; }
      };
      h.storage.setItem = async (key: string, value: string) => {
        h.data.set(key, value);
        if (key.endsWith('import-dismissed:v1')) { applied = true; await stalled.promise; }
      };
      let completing!: Promise<void>;
      await act(async () => { completing = action === 'import' ? h.value.importLegacyTargets() : h.value.dismissLegacyImport(); });
      assert.equal(applied, true);
      h.data.set(legacyKey, JSON.stringify({ training_calories: 2800 }));
      await h.switchUser();
      const bImport = h.value.legacyImport;
      assert.ok(bImport);
      await act(async () => { stalled.resolve(undefined); await completing; });
      assert.deepEqual(h.value.legacyImport, bImport);
      assert.equal(JSON.parse(h.data.get(legacyKey)!).training_calories, 2800);
    } finally { await h.close(); }
  });
}
test('delayed legacy detection cannot reintroduce import after accepted save', async () => {
  const h = await contextHarness();
  try {
    const stalled = deferred();
    h.api.fetchNutritionTargetSet = async () => ({ target_set: null });
    h.storage.getItem = async (k: string) => k === storageLib.LEGACY_LOCAL_TARGETS_KEY ? stalled.promise : h.data.get(k) ?? null;
    let refreshing!: Promise<void>;
    await act(async () => { refreshing = h.value.refresh(); });
    await act(async () => h.value.saveTargets({ targets: { base: macro } }));
    await act(async () => { stalled.resolve(JSON.stringify({ training_calories: 2100 })); await refreshing; });
    assert.equal(h.value.legacyImport, null);
  } finally { await h.close(); }
});
// The server changes only when a request is released, not when it is sent.
function controlledTargetServer(h: Awaited<ReturnType<typeof contextHarness>>) {
  let server: any = saved;
  const calls: { request: any; commit: () => void; fail: () => void }[] = [];
  h.api.fetchNutritionTargetSet = async () => ({ target_set: server });
  h.api.saveNutritionTargetSet = (request: any) => new Promise((resolve, reject) => {
    calls.push({ request, commit: () => {
      server = { ...saved, base_target: request.targets.base, day_overrides: request.targets.day_overrides };
      resolve({ targets: server });
    }, fail: () => reject(new TypeError('Network request failed')) });
  });
  return { calls, get server() { return server; } };
}
const targetRequest = (calories: number) => ({ targets: { base: { ...macro, calories } } });
async function assertNewestTarget(h: Awaited<ReturnType<typeof contextHarness>>, server: { server: any }, calories: number) {
  assert.equal(server.server.base_target.calories, calories);
  assert.equal(h.value.todayTarget.target.calories, calories);
  assert.equal(JSON.parse(h.data.get(storageLib.targetStorageKey('a', 'cache'))!).base_target.calories, calories);
  assert.equal(h.value.syncStatus, 'synced');
  await act(async () => h.value.refresh());
  assert.equal(h.value.todayTarget.target.calories, calories, 'fresh server read must not revert the accepted save');
}
test('pending server commit settles before a newer explicit save is sent', async () => {
  const h = await contextHarness();
  try {
    const server = controlledTargetServer(h);
    h.data.set(storageLib.targetStorageKey('a', 'pending-save'), JSON.stringify(targetRequest(2100)));
    let refreshing!: Promise<void>; let saving!: Promise<void>; let finished = false;
    await act(async () => { refreshing = h.value.refresh(); });
    assert.equal(server.calls.length, 1);
    await act(async () => { saving = h.value.saveTargets(targetRequest(2500)).then(() => { finished = true; }); });
    assert.equal(server.calls.length, 1, 'new request must wait for old server commit');
    assert.equal(finished, false);
    assert.equal(h.value.syncStatus, 'pending');
    await act(async () => { server.calls[0].commit(); await refreshing; });
    assert.equal(server.calls.length, 2);
    assert.equal(h.value.syncStatus, 'pending');
    await act(async () => { server.calls[1].commit(); await saving; });
    await assertNewestTarget(h, server, 2500);
  } finally { await h.close(); }
});
for (const first of ['explicit', 'weekly import', 'legacy import', 'rejected explicit', 'rejected pending'] as const) {
  test(`target lane preserves intent order after ${first}`, async () => {
    const h = await contextHarness();
    try {
      if (first === 'legacy import') {
        h.api.fetchNutritionTargetSet = async () => ({ target_set: null });
        h.data.set(storageLib.LEGACY_LOCAL_TARGETS_KEY, JSON.stringify({ training_calories: 2100 }));
        await act(async () => h.value.refresh());
      }
      const server = controlledTargetServer(h);
      let older!: Promise<void>; let newer!: Promise<void>; let oldError: unknown;
      await act(async () => {
        const work = first === 'weekly import' ? h.value.importWeeklyGoals(true)
          : first === 'legacy import' ? h.value.importLegacyTargets()
          : first === 'rejected pending' ? (h.data.set(storageLib.targetStorageKey('a', 'pending-save'), JSON.stringify(targetRequest(2100))), h.value.refresh())
          : h.value.saveTargets(targetRequest(2100));
        older = work.catch((e: unknown) => { oldError = e; });
      });
      assert.equal(server.calls.length, 1);
      await act(async () => { newer = h.value.saveTargets(targetRequest(2500)); });
      assert.equal(server.calls.length, 1);
      assert.equal(h.value.syncStatus, 'pending');
      // Reads during an in-flight write may not publish a stale cache or flush.
      await act(async () => h.value.refresh());
      assert.equal(server.calls.length, 1);
      await act(async () => {
        if (first.startsWith('rejected')) server.calls[0].fail();
        else server.calls[0].commit();
        await older;
      });
      if (first === 'rejected explicit') assert.ok(oldError instanceof TypeError, 'caller receives real rejection');
      else assert.equal(oldError, undefined);
      assert.equal(server.calls.length, 2, 'failed predecessor must release its lane');
      assert.equal(h.value.syncStatus, 'pending');
      await act(async () => { server.calls[1].commit(); await newer; });
      assert.equal(h.data.has(storageLib.targetStorageKey('a', 'pending-save')), false);
      await assertNewestTarget(h, server, 2500);
    } finally { await h.close(); }
  });
}
test('failed import preparation cannot leave an obsolete offline snapshot to commit later', async () => {
  const h = await contextHarness();
  try {
    const pendingKey = storageLib.targetStorageKey('a', 'pending-save');
    h.data.set(pendingKey, JSON.stringify(targetRequest(1900)));
    h.api.fetchNutritionTargetSet = async () => { throw new TypeError('merge read failed'); };
    await act(async () => { await assert.rejects(h.value.importWeeklyGoals(true), /merge read failed/); });
    assert.equal(h.data.has(pendingKey), false);
    assert.equal(h.value.syncStatus, 'failed', 'no prepared request exists to retry');
    const server = controlledTargetServer(h);
    let saving!: Promise<void>;
    await act(async () => { saving = h.value.saveTargets(targetRequest(2500)); });
    assert.equal(server.calls.length, 1);
    await act(async () => { server.calls[0].commit(); await saving; });
    await assertNewestTarget(h, server, 2500);
  } finally { await h.close(); }
});
test('pending snapshot superseded after enqueue is discarded before network dispatch', async () => {
  const h = await contextHarness();
  try {
    const server = controlledTargetServer(h);
    const read = deferred();
    const pendingKey = storageLib.targetStorageKey('a', 'pending-save');
    let saving!: Promise<void>; let refreshing!: Promise<void>;
    // Register before refresh awaits the read. Its continuation enqueues the
    // pending snapshot, then this microtask creates a newer intent before send.
    void read.promise.then(() => { queueMicrotask(() => { saving = h.value.saveTargets(targetRequest(2500)); }); });
    h.storage.getItem = (key: string) => key === pendingKey ? read.promise : Promise.resolve(h.data.get(key) ?? null);
    await act(async () => { refreshing = h.value.refresh(); });
    await act(async () => { read.resolve(JSON.stringify(targetRequest(2100))); });
    assert.equal(server.calls.length, 1);
    assert.equal(server.calls[0].request.targets.base.calories, 2500, 'obsolete 2100 must not reach server');
    await act(async () => { server.calls[0].commit(); await saving; await refreshing; });
    h.storage.getItem = async (key: string) => h.data.get(key) ?? null;
    await assertNewestTarget(h, server, 2500);
  } finally { await h.close(); }
});
test('weekly import reserves intent before its merge read and excludes an obsolete pending snapshot', async () => {
  const h = await contextHarness();
  try {
    const server = controlledTargetServer(h);
    const read = deferred(); let reads = 0;
    h.api.fetchNutritionTargetSet = () => ++reads === 1 ? read.promise : Promise.resolve({ target_set: server.server });
    h.data.set(storageLib.targetStorageKey('a', 'pending-save'), JSON.stringify(targetRequest(1900)));
    let importing!: Promise<void>; let saving!: Promise<void>;
    await act(async () => { importing = h.value.importWeeklyGoals(true); });
    await act(async () => { saving = h.value.saveTargets(targetRequest(2500)); });
    await act(async () => h.value.refresh());
    assert.equal(server.calls.length, 0, 'merge read is inside the mutation lane');
    await act(async () => { read.resolve({ target_set: saved }); });
    assert.equal(server.calls.length, 1);
    assert.equal(server.calls[0].request.targets.base.calories, 2100);
    await act(async () => { server.calls[0].commit(); await importing; });
    assert.equal(server.calls.length, 2);
    assert.equal(server.calls[1].request.targets.base.calories, 2500);
    await act(async () => { server.calls[1].commit(); await saving; });
    await assertNewestTarget(h, server, 2500);
    assert.equal(server.calls.length, 2, 'obsolete persisted pending save must never be sent');
  } finally { await h.close(); }
});
test('another owner is not blocked and queued old-owner mutations never dispatch after switching', async () => {
  const h = await contextHarness();
  try {
    const server = controlledTargetServer(h);
    let older!: Promise<void>; let queued!: Promise<void>;
    let oldError: unknown; let queuedError: unknown;
    await act(async () => {
      older = h.value.saveTargets(targetRequest(2100)).catch((e: unknown) => { oldError = e; });
      queued = h.value.saveTargets(targetRequest(2300)).catch((e: unknown) => { queuedError = e; });
    });
    assert.equal(server.calls.length, 1);
    await h.switchUser();
    const bSaved = { ...saved, user_id: 'b', base_target: { ...macro, calories: 2800 } };
    h.api.saveNutritionTargetSet = async () => ({ targets: bSaved });
    await act(async () => h.value.saveTargets(targetRequest(2800)));
    await act(async () => h.value.saveDraft({ source: 'manual', base_target: macro }));
    const bCache = h.data.get(storageLib.targetStorageKey('b', 'cache'));
    const bDraft = h.data.get(storageLib.targetStorageKey('b', 'draft'));
    await act(async () => { server.calls[0].commit(); await older; await queued; });
    assert.match(String(oldError), /Account changed/);
    assert.match(String(queuedError), /Account changed/);
    assert.equal(server.calls.length, 1);
    assert.equal(h.value.todayTarget.target.calories, 2800);
    assert.equal(h.value.syncStatus, 'synced');
    assert.equal(h.data.get(storageLib.targetStorageKey('b', 'cache')), bCache);
    assert.equal(h.data.get(storageLib.targetStorageKey('b', 'draft')), bDraft);
    assert.equal(h.value.draftTargets.base_target.calories, 2100);
  } finally { await h.close(); }
});
function screenHarness() {
  const state: any = { mealPlan: { plan: null, meals: [] }, mealPlanStatus: 'loading', refreshMealPlan: async () => {} };
  const api: any = {}; const toasts: any[] = [];
  const deps: any = { 'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: (x: any) => x } }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) }, 'expo-router': { useRouter: () => ({ push: () => {} }) }, '@/contexts/NutritionContext': { useNutrition: () => state }, '@/contexts/EntitlementContext': { useEntitlement: () => ({ can: () => true }) }, '@/lib/entitlements': { FeatureGateError: class extends Error {} }, '@/lib/upgradePrompt': { showUpgradeAlert() {} }, '@/lib/nutrition': api, '@/lib/notifications': { fireMealPlanReady: async () => {} }, '@/hooks/useThemeColor': { useThemeColor: () => 'black' }, '@/hooks/useToast': { useToast: () => ({ toast: null, showToast: (...x: any[]) => toasts.push(x), hideToast() {} }) } };
  for (const [file, name] of [['themed-view', 'ThemedView'], ['themed-text', 'ThemedText'], ['screen-header', 'ScreenHeader'], ['Toast', 'Toast']]) deps['@/components/ui/' + file] = { [name]: name };
  return { state, api, toasts, Screen: load('../../app/(tabs)/nutrition/plan.tsx', deps).default };
}
test('rendered plan separates loading/error/empty and synchronous double taps wait for readback', async () => {
  const h = screenHarness(); let root: any;
  await act(async () => { root = Renderer.create(React.createElement(h.Screen)); });
  try {
    const button = (label: string) => root.root.findAllByProps({ accessibilityLabel: label });
    assert.equal(button('Generate meal plan').length, 0);
    assert.ok(root.root.findAllByType('ActivityIndicator').length);
    h.state.mealPlanStatus = 'error'; await act(async () => root.update(React.createElement(h.Screen)));
    assert.equal(button('Generate meal plan').length, 0); assert.equal(button('Retry loading meal plan').length, 1);
    h.state.mealPlanStatus = 'ready'; await act(async () => root.update(React.createElement(h.Screen)));
    const d = deferred(); let calls = 0; h.api.generateMealPlan = () => { calls++; return d.promise; };
    h.state.refreshMealPlan = async () => { throw new Error('readback failed'); };
    await act(async () => root.update(React.createElement(h.Screen)));
    await act(async () => { const press = button('Generate meal plan')[0].props.onPress; const first = press(); await press(); d.resolve({ plan: { id: 'new' } }); await first; });
    assert.equal(calls, 1); assert.equal(h.toasts.some(x => x[1] === 'success'), false);
  } finally { await act(async () => root.unmount()); }
});
