import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mount complete production screens and the real provider. Only native hosts,
// unrelated app contexts, and notification IO are doubled; no copied JSX/logic.
async function mount(screen: 'timer' | 'settings', provider = true, initial: any = {}) {
  let fail = initial.fail ?? false;
  let value: any;
  let reads = 0;
  let reloads = 0;
  const starts: any[] = [];
  let durable = {
    user_id: 'a', permission_granted: false, auto_start_rest_timer: true,
    auto_rest_duration_sec: 60, workout_reminder_hour: 8,
    nutrition_midday_hour: 12, daily_feedback_hour: 20, rest_timer_enabled: true,
  };
  let injected: any = {
    prefs: durable, permissionGranted: false, loading: false, saving: false,
    error: 'Preferences could not be loaded. Retry when connected.',
    reloadPrefs: async () => { reloads++; }, updatePrefs: async () => {}, ...initial,
  };
  const mocks: Record<string, any> = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      ...Object.fromEntries(['View', 'ScrollView', 'Pressable', 'Switch', 'Modal', 'ActivityIndicator'].map(k => [k, k])),
      Modal: ({ visible, children }: any) => visible ? React.createElement('Modal', null, children) : null,
      StyleSheet: { create: (s: any) => s, absoluteFill: {} }, useWindowDimensions: () => ({ height: 900 }),
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 0 }) },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle' },
    'expo-haptics': { selectionAsync: async () => {}, impactAsync: async () => {}, ImpactFeedbackStyle: { Medium: 'medium' } },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/components/ui/screen-header': { ScreenHeader: 'Header' },
    '@/components/ui/Toast': { Toast: 'Toast' },
    '@/hooks/useToast': { useToast: () => ({ toast: null, showToast: () => {}, hideToast: () => {} }) },
    '@/hooks/useThemeColor': { useThemeColor: () => 'black' },
    '@/contexts/AuthProvider': { useAuth: () => ({ session: { user: { id: 'a' } } }) },
    '@/contexts/ProfileContext': { useProfile: () => ({ profile: null }) },
    '@/lib/trainingSchedule': { resolveTrainingDays: () => [] },
    '@/contexts/RestTimerContext': { useSharedRestTimer: () => ({ state: { kind: 'idle' }, remainingSec: 0, start: (...args: any[]) => starts.push(args) }) },
    '@/lib/notifications': {
      fetchPreferences: async () => { reads++; if (fail) throw new Error('offline'); return { ...durable }; },
      updatePreferences: async (patch: any) => ({ ...durable, ...patch }),
      reconcileScheduledNotifications: async () => {}, requestPermissionsAndRegisterToken: async () => ({ granted: true, token: 'offline' }),
      sendTestPush: async () => ({ ok: true, sent_to: 1 }),
    },
  };
  function load(path: string) {
    const compiled = ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} as any };
    // Trusted checkout source only; never evaluates external/user input.
    new Function('require', 'module', 'exports', compiled)((name: string) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name];
    }, module, module.exports);
    return module.exports;
  }
  mocks['@/lib/restTimer'] = load('lib/restTimer.ts');
  mocks['@/lib/timerDial'] = load('lib/timerDial.ts');
  const notifications = load('contexts/NotificationsProvider.tsx');
  mocks['@/contexts/NotificationsProvider'] = provider ? notifications : { useNotifications: () => injected };
  const Screen = load(screen === 'timer' ? 'app/(tabs)/timer.tsx' : 'app/settings/notifications.tsx').default;
  function Probe() { value = notifications.useNotifications(); return React.createElement(Screen); }
  const tree = () => provider ? React.createElement(notifications.NotificationsProvider, null, React.createElement(Probe)) : React.createElement(Screen);
  let root: any;
  await act(async () => { root = create(tree()); });
  return {
    root, starts, value: () => value, reads: () => reads, reloads: () => reloads,
    fail: (v: boolean) => { fail = v; }, durable: (patch: any) => { durable = { ...durable, ...patch }; },
    inject: async (patch: any) => { injected = { ...injected, ...patch }; await act(async () => { root.update(tree()); }); },
    close: async () => { await act(async () => root.unmount()); },
  };
}
function button(h: any, label = 'Retry loading preferences') {
  return h.root.root.findAll((n: any) => n.type === 'Pressable' && n.props.accessibilityLabel === label)[0];
}
function alerts(h: any) { return h.root.root.findAll((n: any) => n.type === 'Text' && n.props.accessibilityRole === 'alert'); }
function autoSwitch(h: any, screen: string) {
  return h.root.root.findByProps({ accessibilityLabel: screen === 'timer' ? 'Auto rest' : 'Auto-start rest timer' });
}

for (const screen of ['timer', 'settings'] as const) {
  test(`${screen}: loaded prefs survive failed refresh; visible Retry reaches real provider and confirms new prefs/permission`, async () => {
    const h = await mount(screen);
    try {
      assert.equal(autoSwitch(h, screen).props.value, true);
      h.fail(true);
      await act(async () => { await h.value().reloadPrefs(); });
      assert.equal(h.value().prefs.auto_rest_duration_sec, 60);
      assert.equal(h.value().permissionGranted, false);
      assert.equal(autoSwitch(h, screen).props.value, true, 'confirmed switch retained on read failure');
      assert.equal(alerts(h).length, 1);
      if (screen === 'timer') {
        assert.ok(button(h, 'Auto-rest duration 1:00'));
        await act(async () => { button(h, 'Start rest timer').props.onPress(); });
        assert.equal(h.starts[0][1], 90, 'manual timer stays usable and independent');
      } else {
        assert.ok(h.root.root.findByProps({ accessibilityLabel: 'workout reminder hour is 08:00' }));
      }
      const retry = button(h);
      assert.ok(retry, 'Retry must remain visible with populated preferences');
      assert.equal(retry.props.disabled, false);
      h.fail(false);
      h.durable({ permission_granted: true, auto_start_rest_timer: false, auto_rest_duration_sec: 180, workout_reminder_hour: 9 });
      const before = h.reads();
      await act(async () => { await retry.props.onPress(); });
      assert.equal(h.reads(), before + 1, 'Retry invokes provider reload once');
      assert.equal(h.value().error, null);
      assert.equal(h.value().permissionGranted, true);
      assert.equal(h.value().prefs.auto_rest_duration_sec, 180);
      assert.equal(autoSwitch(h, screen).props.value, false);
      assert.equal(alerts(h).length, 0);
      assert.equal(button(h), undefined);
      if (screen === 'timer') assert.ok(button(h, 'Auto-rest duration 3:00'));
      else {
        assert.ok(button(h, 'Send test push notification'));
        assert.ok(h.root.root.findByProps({ accessibilityLabel: 'workout reminder hour is 09:00' }));
      }
    } finally { await h.close(); }
  });
  test(`${screen}: absent preferences retain bootstrap-error recovery through the real provider`, async () => {
    const h = await mount(screen, true, { fail: true });
    try {
      assert.equal(h.value().prefs, null);
      assert.equal(h.value().loading, false);
      assert.equal(alerts(h).length, 1);
      const retry = button(h);
      assert.ok(retry);
      assert.equal(retry.props.disabled, false);
      h.fail(false);
      const before = h.reads();
      await act(async () => { await retry.props.onPress(); });
      assert.equal(h.reads(), before + 1);
      assert.equal(h.value().prefs.auto_rest_duration_sec, 60);
      assert.equal(h.value().error, null);
      assert.equal(alerts(h).length, 0);
      assert.equal(button(h), undefined);
    } finally { await h.close(); }
  });
  for (const absent of [false, true]) for (const phase of ['loading', 'saving']) {
    test(`${screen}: Retry visible but disabled during ${phase} (absent prefs=${absent})`, async () => {
      // Controlled hook value exercises error+busy, which the real provider
      // normally clears at reload/save start. Press dispatch honors native disabled.
      const h = await mount(screen, false, { ...(absent ? { prefs: null } : {}), [phase]: true });
      try {
        const retry = button(h);
        assert.ok(retry);
        assert.equal(retry.props.disabled, true);
        assert.equal(retry.props.accessibilityState.disabled, true);
        await act(async () => { if (!retry.props.disabled) await retry.props.onPress(); });
        assert.equal(h.reloads(), 0, 'disabled native press must not invoke reload');
        await h.inject({ [phase]: false });
        const idleRetry = button(h);
        assert.equal(idleRetry.props.disabled, false);
        assert.equal(idleRetry.props.accessibilityState.disabled, false);
        await act(async () => { if (!idleRetry.props.disabled) await idleRetry.props.onPress(); });
        assert.equal(h.reloads(), 1, 'same recovery becomes actionable once idle');
      } finally { await h.close(); }
    });
  }
}
