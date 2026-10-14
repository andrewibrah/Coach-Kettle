import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';
import * as dialHelpers from '../timerDial.ts';
import * as restTimer from '../restTimer.ts';
const { decideRestTimerAction, suggestRestSeconds } = restTimer;

const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };
function hooks() {
  const states: any[] = [], refs: any[] = [], effects: any[] = [], callbacks: any[] = []; let si = 0, ri = 0, ei = 0, ci = 0; let queued: any[] = [];
  const react: any = {
    useState: (init: any) => { const i = si++; if (!(i in states)) states[i] = typeof init === 'function' ? init() : init; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
    useRef: (v: any) => refs[ri++] ??= { current: v }, useCallback: (fn: any, deps: any[]) => { const i = ci++; if (!callbacks[i] || deps.some((v, k) => v !== callbacks[i].deps[k])) callbacks[i] = { deps, fn }; return callbacks[i].fn; }, useMemo: (fn: any) => fn(),
    createContext: () => ({ Provider: 'Provider' }), useContext: () => null,
    useEffect: (fn: any, deps: any[]) => { const i = ei++; if (!effects[i] || deps.some((v, k) => v !== effects[i].deps[k])) queued.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  return { react, states, render: (fn: any) => { si = ri = ei = ci = 0; queued = []; const tree = fn(); queued.forEach(fn => fn()); return tree; } };
}
const node = (type: any, props: any) => ({ type, props });
const jsx = { jsx: node, jsxs: node, Fragment: 'Fragment' };
function elements(tree: any, type: string): any[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(t => elements(t, type));
  return [...(tree.type === type ? [tree.props] : []), ...elements(tree.props?.children, type)];
}
// Real modules under test, loaded with the shared harness (no hand-rolled extraction).
function notificationsApi(fetchWithAuth: any) {
  return sourceModule('lib/notifications.ts', { 'react-native': { Platform: { OS: 'ios' } }, 'expo-constants': { __esModule: true, default: {} }, './supabase': { supabaseUrl: 'local' }, './auth': { fetchWithAuth } });
}
const ok = (prefs: any) => async () => ({ ok: true, json: async () => ({ prefs }) });
// The Deno module needs Deno/Request globals, so it is loaded whole and its served handler captured.
function edgeHandler(admin: any) {
  const source = readFileSync(new URL('../../supabase/functions/notifications/index.ts', import.meta.url), 'utf8');
  let handler: any;
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: {}, require: (name: string) => name.includes('/server.ts') ? { serve: (fn: any) => { handler = fn; } } : { createClient: () => admin },
    Deno: { env: { get: () => 'local-double' } }, Request, Response, URL, console: { ...console, error: () => {} },
  });
  return handler;
}
const edgeAuth = { getUser: async () => ({ data: { user: { id: 'owner' } } }) };
const edgeRead = (result: any) => edgeHandler({ auth: edgeAuth, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) })(new Request('https://local/notifications?action=prefs', { headers: { Authorization: 'Bearer fixture' } }));
function trigger(ctx: Record<string, any>) {
  return sourceClosure('triggerRestTimer', { useCallback: (fn: any) => fn, restTimerStateRef: { current: { kind: 'idle' } }, decideRestTimerAction, suggestRestSeconds, ...ctx });
}
// The real useRestTimer hook; state() reads its live timer state.
function realRestTimer() {
  const runtime = hooks();
  const module = sourceModule('hooks/useRestTimer.ts', {
    react: runtime.react, 'react-native': { Platform: { OS: 'ios' } }, 'expo-haptics': {},
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } },
    '@/lib/restTimer': restTimer, '@/contexts/NotificationsProvider': { useNotifications: () => ({ prefs: null }) },
    '@/lib/notifications': { fireRestTimerNotification: async () => null, cancelLocal: async () => {} },
  });
  const api = runtime.render(() => module.useRestTimer());
  return { start: api.start, state: () => runtime.states[0] };
}
function timerUI(prefs: any, updatePrefs: any = async () => {}, loading = false, saving = false) {
  const runtime = hooks(); const starts: any[] = [];
  const module = sourceModule('app/(tabs)/timer.tsx', {
    react: { __esModule: true, default: runtime.react, ...runtime.react }, 'react/jsx-runtime': jsx,
    'react-native': { NativeScrollEvent: {}, NativeSyntheticEvent: {}, View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', Modal: 'Modal', StyleSheet: { create: (v: any) => v }, useWindowDimensions: () => ({ height: 850 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, 'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle' },
    'expo-haptics': { selectionAsync: async () => {}, impactAsync: async () => {}, ImpactFeedbackStyle: { Medium: 1 } },
    '@/components/ui/themed-text': { ThemedText: 'Text' }, '@/hooks/useThemeColor': { useThemeColor: () => 'theme' },
    '@/contexts/RestTimerContext': { useSharedRestTimer: () => ({ state: { kind: 'idle' }, remainingSec: 0, start: (...args: any[]) => starts.push(args) }) },
    '@/contexts/NotificationsProvider': { useNotifications: () => ({ prefs, updatePrefs, loading, saving, error: null, reloadPrefs: async () => {} }) },
    '@/lib/restTimer': { formatTime: (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }, '@/lib/timerDial': dialHelpers,
  });
  return { render: () => runtime.render(module.default), starts };
}

test('timer duration draft cancels without writes; Save commits custom duration without changing manual dial', async () => {
  const writes: any[] = []; const ui = timerUI({ auto_start_rest_timer: false, auto_rest_duration_sec: 60 }, async (p: any) => writes.push(p));
  let tree = ui.render();
  const duration = elements(tree, 'Pressable').find(p => p.accessibilityLabel?.startsWith('Auto-rest duration'));
  assert.ok(duration, 'duration control next to native switch');
  assert.equal(elements(tree, 'Switch')[0].value, false);
  assert.equal(duration.disabled, false);
  duration.onPress(); tree = ui.render();
  const preset = elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Auto-rest 2:00 preset');
  assert.ok(preset); preset.onPress(); tree = ui.render();
  elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Cancel auto-rest duration').onPress(); tree = ui.render();
  assert.equal(writes.length, 0);
  elements(tree, 'Pressable').find(p => p.accessibilityLabel?.startsWith('Auto-rest duration')).onPress(); tree = ui.render();
  const dial = elements(tree, 'View').find(p => p.testID === 'auto-rest-editor');
  assert.ok(dial);
  const dialElement = dial.children.find((p: any) => typeof p?.type === 'function');
  assert.equal(dialElement.props.value, 60);
  dialElement.props.onChange(125); tree = ui.render();
  await elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Save auto-rest duration').onPress(); tree = ui.render();
  assert.equal(writes[0].auto_rest_duration_sec, 125);
  elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Start rest timer').onPress();
  assert.equal(ui.starts[0][1], 90);
});

test('timer preserves sheet and displays failure instead of claiming Save succeeded', async () => {
  const ui = timerUI({ auto_start_rest_timer: true, auto_rest_duration_sec: 90 }, async () => { throw new Error('offline'); });
  elements(ui.render(), 'Pressable').find(p => p.accessibilityLabel?.startsWith('Auto-rest duration'))?.onPress();
  const save = elements(ui.render(), 'Pressable').find(p => p.accessibilityLabel === 'Save auto-rest duration');
  assert.ok(save); await save.onPress();
  const tree = ui.render(); assert.equal(elements(tree, 'Modal')[0].visible, true);
  assert.ok(elements(tree, 'Text').some(p => p.accessibilityRole === 'alert'));
});

test('shared provider rejects concurrent writes and fences account switch response', async () => {
  const runtime = hooks(); let userId = 'a'; let finish: any; const writes: any[] = [];
  const module = sourceModule('contexts/NotificationsProvider.tsx', {
    react: { __esModule: true, default: runtime.react, ...runtime.react }, 'react/jsx-runtime': jsx,
    '@/contexts/AuthProvider': { useAuth: () => ({ session: { user: { id: userId } } }) },
    '@/contexts/ProfileContext': { useProfile: () => ({ profile: null }) },
    '@/lib/trainingSchedule': { resolveTrainingDays: () => [] },
    '@/lib/notifications': { fetchPreferences: async () => ({ user_id: userId, auto_start_rest_timer: false, auto_rest_duration_sec: 60 }), updatePreferences: (patch: any) => { writes.push(patch); return new Promise(r => { finish = r; }); }, reconcileScheduledNotifications: async () => {} },
  });
  const render = () => runtime.render(() => module.NotificationsProvider({ children: null })).props.value;
  render(); await flush(); let value = render();
  const first = value.updatePrefs({ auto_start_rest_timer: true });
  const second = value.updatePrefs({ auto_rest_duration_sec: 90 });
  let secondSettled = false; second.catch(() => {}).finally(() => { secondSettled = true; });
  await flush();
  assert.equal(secondSettled, true, 'concurrent write must settle while the first is still pending');
  await assert.rejects(second);
  assert.equal(writes.length, 1);
  userId = 'b'; value = render(); assert.equal(value.prefs, null); await flush();
  finish({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: 60 });
  await assert.rejects(first); value = render(); assert.equal(value.prefs.user_id, 'b'); assert.equal(value.prefs.auto_start_rest_timer, false);
});

test('real ingestion waits for durable logging; failure/cardio/replay never starts timer', async () => {
  const { performedRows } = await import('../performedSets.ts');
  const { validateWorkoutRow } = await import('../workoutValidation.ts');
  const row = { id: 'row1', timestamp: Date.now(), exercise: 'Bench', set: '1', weightLbs: '0', reps: '8', performance: 'performed' };
  const starts: any[] = []; let finish: any; let reject: any; const queued: any[] = [];
  const run = sourceClosure('logPerformedRows', {
    performedRows, validateWorkoutRow, processedRestRows: new Set(), COACHING_POLICY: { restWorkSetsOnly: false },
    queueLiveRows: (rows: any[]) => { queued.push(rows); return new Promise((r, j) => { finish = r; reject = j; }); },
    ownership: { capture: () => ({}), isCurrent: () => true }, effectOwner: {}, getWorkoutDraftGeneration: () => 1, effectsDraftGeneration: 1,
    showToast: () => {}, triggerRestTimer: (h: any) => starts.push(h), isCompoundExercise: () => true,
  });
  run([row]); assert.equal(starts.length, 0, 'no timer before durable intent'); reject(new Error('disk failure')); await flush(); assert.equal(starts.length, 0);
  run([row, row]); finish(); await flush(); assert.equal(starts.length, 1, 'bodyweight zero is eligible'); assert.equal(queued[1].length, 1);
  run([row]); await flush(); assert.equal(starts.length, 1); assert.equal(queued.length, 2);
  run([{ ...row, id: 'cardio', isCardio: true, cardioMode: 'run', durationMin: '10', distanceMi: '1' }]); if (queued.length > 2) finish(); await flush(); assert.equal(starts.length, 1);
});

test('existing settings auto switch shares saving gate and reports errors', async () => {
  const runtime = hooks(); const module = sourceModule('app/settings/notifications.tsx', {
    react: { __esModule: true, default: runtime.react, ...runtime.react }, 'react/jsx-runtime': jsx,
    'react-native': { View: 'View', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', ActivityIndicator: 'Spinner', StyleSheet: { create: (v: any) => v } },
    '@/components/ui/screen-header': { ScreenHeader: 'Header' }, '@/components/ui/themed-text': { ThemedText: 'Text' }, '@/components/ui/themed-view': { ThemedView: 'View' }, '@/components/ui/Toast': { Toast: 'Toast' },
    '@/hooks/useThemeColor': { useThemeColor: () => 'theme' }, '@/hooks/useToast': { useToast: () => ({ toast: null, showToast: () => {}, hideToast: () => {} }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/contexts/NotificationsProvider': { useNotifications: () => ({ prefs: { user_id: 'a', auto_start_rest_timer: true }, loading: false, saving: true, error: 'Preferences were not saved.', updatePrefs: async () => {}, permissionGranted: false, reloadPrefs: async () => {} }) },
  });
  const tree = runtime.render(module.default);
  const auto = elements(tree, 'Switch').find(p => p.accessibilityLabel === 'Auto-start rest timer');
  assert.ok(auto); assert.equal(auto.disabled, true);
  assert.ok(elements(tree, 'Text').some(p => p.accessibilityRole === 'alert'));
});

test('real API rejects unconfirmed auto-rest fields from an old server', async () => {
  const run = notificationsApi(ok({ user_id: 'a', auto_start_rest_timer: false })).updatePreferences;
  await assert.rejects(run({ auto_rest_duration_sec: 125 }));
  await assert.rejects(run({ auto_start_rest_timer: true }));
});

test('server preference read does not disguise a database failure as defaults', async () => {
  const response = await edgeRead({ data: null, error: new Error('read failed') });
  assert.equal(response.status, 500); assert.equal((await response.json()).prefs, undefined);
});

test('auto off retains idle Start Rest prompt and does not start or modify active timer', () => {
  for (const kind of ['idle', 'running', 'paused', 'done']) {
    const starts: any[] = []; const prompts: any[] = [];
    const run = trigger({ getConfirmedPrefs: () => ({ user_id: 'a', auto_start_rest_timer: false, auto_rest_duration_sec: 180 }), restTimerStateRef: { current: { kind } }, startRestTimer: async (...args: any[]) => starts.push(args), setRestPrompt: (v: any) => prompts.push(v) });
    run({ exercise: 'Bench', isCompound: true }); assert.equal(starts.length, 0); assert.equal(prompts.length, kind === 'idle' ? 1 : 0);
  }
});

test('loading and saving disable header auto controls, not manual Start', () => {
  for (const [loading, saving] of [[true, false], [false, true]]) {
    const tree = timerUI({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: 60 }, async () => {}, loading, saving).render();
    assert.equal(elements(tree, 'Switch')[0].disabled, true);
    assert.equal(elements(tree, 'Pressable').find(p => p.accessibilityLabel?.startsWith('Auto-rest duration')).disabled, true);
    assert.notEqual(elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Start rest timer').disabled, true);
  }
});

test('real provider reloads persisted account preferences after remount, with failure visible', async () => {
  const storage = new Map([['a', { user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: 125 }], ['b', { user_id: 'b', auto_start_rest_timer: false, auto_rest_duration_sec: 60 }]]);
  let userId = 'a'; let fail = false;
  const mount = () => {
    const runtime = hooks();
    const module = sourceModule('contexts/NotificationsProvider.tsx', {
      react: { __esModule: true, default: runtime.react, ...runtime.react }, 'react/jsx-runtime': jsx,
      '@/contexts/AuthProvider': { useAuth: () => ({ session: { user: { id: userId } } }) }, '@/contexts/ProfileContext': { useProfile: () => ({ profile: null }) }, '@/lib/trainingSchedule': { resolveTrainingDays: () => [] },
      '@/lib/notifications': { fetchPreferences: async () => { if (fail) throw new Error('offline'); return storage.get(userId); }, updatePreferences: async (patch: any) => { const updated = { ...storage.get(userId), ...patch }; storage.set(userId, updated); return updated; }, reconcileScheduledNotifications: async () => {} },
    });
    return () => runtime.render(() => module.NotificationsProvider({ children: null })).props.value;
  };
  let render = mount(); render(); await flush(); let value = render();
  assert.equal(value.prefs.auto_rest_duration_sec, 125);
  const getter = value.getConfirmedPrefs;
  await value.updatePrefs({ auto_rest_duration_sec: 180 });
  assert.equal(getter().auto_rest_duration_sec, 180, 'acknowledged value is available before rerender');
  render = mount(); render(); await flush(); value = render(); assert.equal(value.prefs.auto_rest_duration_sec, 180); assert.equal(value.prefs.auto_start_rest_timer, true);
  userId = 'b'; const accountGetter = value.getConfirmedPrefs; assert.equal(render().prefs, null); assert.equal(accountGetter(), null); await flush(); value = render(); assert.equal(value.prefs.auto_rest_duration_sec, 60); assert.equal(value.prefs.auto_start_rest_timer, false);
  fail = true; render = mount(); render(); await flush(); value = render(); assert.equal(value.prefs, null); assert.ok(value.error); assert.equal(value.loading, false);
});


test('real notification handler rejects invalid duration before persistence and accepts exact bounds', async () => {
  // 10 and 605 are %5-valid, so only the min/max bounds reject them. null resets to the classifier.
  for (const duration of [14, 601, 16, 60.5, '60', 10, 605, 0, -5, 15, 60, 600, null]) {
    const writes: any[] = [];
    const handler = edgeHandler({ auth: edgeAuth, from: () => ({ upsert: (patch: any) => { writes.push(patch); return { select: () => ({ single: async () => ({ data: patch, error: null }) }) }; } }) });
    const response = await handler(new Request('https://local/notifications', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ action: 'update_prefs', auto_rest_duration_sec: duration }) }));
    const valid = duration === null || (typeof duration === 'number' && Number.isInteger(duration) && duration >= 15 && duration <= 600 && duration % 5 === 0);
    assert.equal(response.status, valid ? 200 : 400, String(duration));
    assert.equal(writes.length, valid ? 1 : 0);
    if (valid) { assert.ok('auto_rest_duration_sec' in writes[0], String(duration)); assert.equal(writes[0].auto_rest_duration_sec, duration); }
  }
});

test('real workout trigger uses saved auto duration independent of permission and rest alerts', async () => {
  const starts: any[] = []; const prompts: any[] = [];
  const run = trigger({
    getConfirmedPrefs: () => ({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: 125, permission_granted: false, rest_timer_enabled: false }),
    restTimerStateRef: { current: { kind: 'running' } }, startRestTimer: async (...args: any[]) => starts.push(args), setRestPrompt: (v: any) => prompts.push(v),
  });
  run({ exercise: 'Bench', isCompound: true });
  assert.equal(starts.length, 1);
  assert.equal(starts[0][1], 125);
  assert.equal(prompts.length, 0);
});

test('real API does not acknowledge a missing persistence response', async () => {
  const run = notificationsApi(ok(null)).updatePreferences;
  await assert.rejects(run({ auto_rest_duration_sec: 60 }));
});

// --- SPEC repair: NULL duration means "use the committed classifier" (HEAD behaviour) ---
function realTrigger(getConfirmedPrefs: any, kind = 'idle') {
  const prompts: any[] = []; const timer = realRestTimer();
  const run = trigger({ getConfirmedPrefs, restTimerStateRef: { current: { kind } }, startRestTimer: timer.start, setRestPrompt: (v: any) => prompts.push(v) });
  // Started timers, read from the real hook's state.
  return { run, prompts, get states() { const st = timer.state(); return st.kind === 'idle' ? [] : [st]; } };
}
const heavySquat = { exercise: 'Squat', repsLastSet: 5, isCompound: true };

test('untouched null duration keeps the HEAD classifier: compound at 5 reps rests 180 s', async () => {
  const t = realTrigger(() => ({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: null }));
  t.run(heavySquat); await flush();
  assert.equal(t.states.length, 1); assert.equal(t.states[0].durationSec, 180); assert.equal(t.prompts.length, 0);
  const iso = realTrigger(() => ({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: null }));
  iso.run({ exercise: 'Curl', repsLastSet: 12, isCompound: false }); await flush();
  assert.equal(iso.states[0].durationSec, 75);
  const fixed = realTrigger(() => ({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: 125 }));
  fixed.run(heavySquat); await flush();
  assert.equal(fixed.states[0].durationSec, 125, 'a chosen fixed duration still overrides the classifier');
});

// 'switched': A's confirmed auto-start prefs, then account B whose prefs are still loading.
for (const mode of ['loading', 'offline', 'switched']) test(`unconfirmed prefs (${mode}) behave as auto-start OFF and show the manual Start Rest prompt`, async () => {
  const runtime = hooks(); let userId = 'a';
  const fetchPreferences = () => mode === 'offline' ? Promise.reject(new Error('offline'))
    : mode === 'switched' && userId === 'a' ? Promise.resolve({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: 125 }) : new Promise(() => {});
  const module = sourceModule('contexts/NotificationsProvider.tsx', {
    react: { __esModule: true, default: runtime.react, ...runtime.react }, 'react/jsx-runtime': jsx,
    '@/contexts/AuthProvider': { useAuth: () => ({ session: { user: { id: userId } } }) }, '@/contexts/ProfileContext': { useProfile: () => ({ profile: null }) }, '@/lib/trainingSchedule': { resolveTrainingDays: () => [] },
    '@/lib/notifications': { fetchPreferences, updatePreferences: async () => { throw new Error('unused'); }, reconcileScheduledNotifications: async () => {} },
  });
  const render = () => runtime.render(() => module.NotificationsProvider({ children: null })).props.value;
  render(); await flush(); let value = render();
  if (mode === 'switched') {
    assert.equal(value.getConfirmedPrefs().user_id, 'a');
    userId = 'b'; value = render(); await flush(); value = render();
  }
  assert.equal(value.getConfirmedPrefs(), null);
  assert.equal(value.prefs, null);
  assert.equal(value.loading, mode !== 'offline');
  const t = realTrigger(value.getConfirmedPrefs);
  t.run(heavySquat); await flush();
  assert.equal(t.states.length, 0, 'no auto-start without confirmed prefs');
  assert.equal(t.prompts.length, 1, 'HEAD manual Start Rest prompt still appears');
  assert.equal(t.prompts[0].suggestedSec, 180);
  const active = realTrigger(value.getConfirmedPrefs, 'running');
  active.run(heavySquat); await flush();
  assert.equal(active.states.length + active.prompts.length, 0, 'prompt stays suppressed while a timer is active');
});

test('timer shows Auto (suggested) for null and saves fixed or Auto choices', async () => {
  const label = (tree: any) => elements(tree, 'Pressable').find(p => p.accessibilityLabel?.startsWith('Auto-rest duration'));
  const autoWrites: any[] = []; const auto = timerUI({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: null }, async (p: any) => autoWrites.push(p));
  let tree = auto.render();
  assert.equal(label(tree).accessibilityLabel, 'Auto-rest duration Auto (suggested)');
  assert.ok(elements(tree, 'Text').some(p => String(p.children).includes('Auto (suggested)')));
  label(tree).onPress(); tree = auto.render();
  const autoOption = elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Auto-rest suggested duration');
  assert.ok(autoOption, 'editor offers Auto'); assert.equal(autoOption.accessibilityState.selected, true);
  elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Auto-rest 1:30 preset').onPress(); tree = auto.render();
  await elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Save auto-rest duration').onPress();
  assert.equal(JSON.stringify(autoWrites), JSON.stringify([{ auto_rest_duration_sec: 90 }]));

  const fixedWrites: any[] = []; const fixed = timerUI({ user_id: 'a', auto_start_rest_timer: true, auto_rest_duration_sec: 125 }, async (p: any) => fixedWrites.push(p));
  tree = fixed.render(); assert.equal(label(tree).accessibilityLabel, 'Auto-rest duration 2:05');
  label(tree).onPress(); tree = fixed.render();
  elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Auto-rest suggested duration').onPress(); tree = fixed.render();
  await elements(tree, 'Pressable').find(p => p.accessibilityLabel === 'Save auto-rest duration').onPress();
  assert.equal(JSON.stringify(fixedWrites), JSON.stringify([{ auto_rest_duration_sec: null }]));
});

test('real API confirms a null (Auto) reset and rejects an old server that drops it', async () => {
  const current = notificationsApi(ok({ user_id: 'a', auto_rest_duration_sec: null })).updatePreferences;
  assert.equal((await current({ auto_rest_duration_sec: null })).auto_rest_duration_sec, null);
  const old = notificationsApi(ok({ user_id: 'a' })).updatePreferences;
  await assert.rejects(old({ auto_rest_duration_sec: null }));
});

test('server default for a user with no prefs row is the classifier (null), not 60', async () => {
  const response = await edgeRead({ data: null, error: null });
  assert.equal(response.status, 200); assert.equal((await response.json()).prefs.auto_rest_duration_sec, null);
});
