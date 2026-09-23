import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const req = createRequire(import.meta.url);
function flatten(node: any): string {
  if (node == null) return '';
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return '';
}
function transpile(file: string): string {
  return ts.transpileModule(source(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
}

function load(file: string, dependencies: Record<string, any>) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

function source(file: string): string {
  return readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
}

// --- Task E2: strict integer parsing (bodyMetricValidation.ts) ---

test('parseStrictInteger accepts only a full-string whole number', () => {
  const api = load('lib/bodyMetricValidation.ts', {});
  assert.equal(api.parseStrictInteger('60'), 60);
  assert.equal(api.parseStrictInteger(' 60 '), 60);
  assert.equal(api.parseStrictInteger('-5'), -5);
});

test('parseStrictInteger rejects fractional, trailing-garbage, and empty input', () => {
  const api = load('lib/bodyMetricValidation.ts', {});
  assert.equal(api.parseStrictInteger('60.5'), null);
  assert.equal(api.parseStrictInteger('60abc'), null);
  assert.equal(api.parseStrictInteger('abc'), null);
  assert.equal(api.parseStrictInteger(''), null);
  assert.equal(api.parseStrictInteger('   '), null);
});

// --- Task E2: fetchStrengthProgression must throw RPC errors (plan step 4) ---

test('fetchStrengthProgression throws on RPC error instead of swallowing it into []', async () => {
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    rpc: async () => ({ data: null, error: { message: 'rpc exploded' } }),
  };
  const api = load('lib/bodyMetrics.ts', {
    './supabase': { supabaseUrl: 'https://example.test', supabase },
    './auth': { fetchWithAuth: async () => { throw new Error('not used in this test'); } },
    'expo-file-system': { File: class {} },
  });
  await assert.rejects(
    api.fetchStrengthProgression('Bench Press', 60),
    /rpc exploded/
  );
});

test('fetchStrengthProgression still returns [] when there is no signed-in user (no data to distinguish from an error)', async () => {
  const supabase = {
    auth: { getSession: async () => ({ data: { session: null } }) },
    rpc: async () => { throw new Error('should not be called without a session'); },
  };
  const api = load('lib/bodyMetrics.ts', {
    './supabase': { supabaseUrl: 'https://example.test', supabase },
    './auth': { fetchWithAuth: async () => { throw new Error('not used in this test'); } },
    'expo-file-system': { File: class {} },
  });
  assert.equal(JSON.stringify(await api.fetchStrengthProgression('Bench Press', 60)), '[]');
});

// --- Task E2: resting BPM uses strict integer parsing aligned with the server bounds (25..220) ---

test('resting-hr screen validates BPM with the strict parser and the server bounds (25..220)', () => {
  const api = load('app/(tabs)/progress/resting-hr.tsx', {
    react: { useCallback: (f: any) => f, useEffect: () => {}, useState: (v: any) => [v, () => {}], default: {} },
    'react-native': { Alert: {}, Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (s: any) => s }, TextInput: 'TextInput', View: 'View' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/screen-header': { ScreenHeader: 'ScreenHeader' },
    '@/components/ui/Toast': { Toast: 'Toast' },
    '@/hooks/useThemeColor': { useThemeColor: () => '#000' },
    '@/hooks/useToast': { useToast: () => ({ toast: null, showToast: () => {}, hideToast: () => {} }) },
    '@/lib/bodyMetrics': { fetchRestingHRSummary: async () => null, fetchRestingHRList: async () => [], upsertRestingHR: async () => ({}), deleteRestingHR: async () => {} },
    '@/lib/workoutRules': { todayISO: () => '2026-01-01' },
    // Load the real validator module rather than re-implementing its logic
    // here, so this test actually guards against a regression in the shared
    // parser (finding 7).
    '@/lib/bodyMetricValidation': load('lib/bodyMetricValidation.ts', {}),
  });
  assert.equal(typeof api.validateRestingBpmInput, 'function');
  assert.equal(JSON.stringify(api.validateRestingBpmInput('60')), JSON.stringify({ value: 60 }));
  assert.equal(JSON.stringify(api.validateRestingBpmInput('24')), JSON.stringify({ error: 'Enter a whole number between 25 and 220.' }));
  assert.equal(JSON.stringify(api.validateRestingBpmInput('221')), JSON.stringify({ error: 'Enter a whole number between 25 and 220.' }));
  assert.equal(JSON.stringify(api.validateRestingBpmInput('60.5')), JSON.stringify({ error: 'Enter a whole number between 25 and 220.' }));
  assert.equal(JSON.stringify(api.validateRestingBpmInput('abc')), JSON.stringify({ error: 'Enter a whole number between 25 and 220.' }));
});

// --- Task E2: successful-empty copy must be the exact brief strings, verbatim ---

test('body.tsx uses the exact successful-empty copy from the brief', () => {
  assert.match(
    source('app/(tabs)/progress/body.tsx'),
    /No measurements saved yet\. Enter a measurement above and tap Save\./
  );
});

test('resting-hr.tsx uses the exact successful-empty copy from the brief', () => {
  assert.match(
    source('app/(tabs)/progress/resting-hr.tsx'),
    /No resting heart rate entries yet\. Enter your resting BPM above to start tracking\./
  );
});

test('photos.tsx uses the exact successful-empty copy from the brief, adapted to the real "Add photo" button label', () => {
  assert.match(
    source('app/(tabs)/progress/photos.tsx'),
    /No progress photos yet\. .*Add photo.* to start a comparison\./
  );
});

test('strength.tsx uses the exact successful-empty copy from the brief', () => {
  assert.match(
    source('app/(tabs)/progress/strength.tsx'),
    /No saved sets found for this exercise\. Use the exact name from Workout History, or log and finish a workout first\./
  );
});

// --- Task E3: progress home — last-logged label must never claim "never" (F15) ---

const progressIndexDeps = {
  react: { useCallback: (f: any) => f, useEffect: () => {}, useRef: (v: any) => ({ current: v }), useState: (v: any) => [v, () => {}], default: {} },
  '@react-native-async-storage/async-storage': { default: { getItem: async () => null } },
  'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (s: any) => s }, View: 'View' },
  'expo-router': { useRouter: () => ({ push: () => {} }), useFocusEffect: () => {} },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
  '@/components/ui/themed-view': { ThemedView: 'View' },
  '@/components/ui/themed-text': { ThemedText: 'Text' },
  '@/components/ui/screen-header': { ScreenHeader: 'ScreenHeader' },
  '@/components/ui/icon-symbol': { IconSymbol: 'IconSymbol' },
  '@/hooks/useThemeColor': { useThemeColor: () => '#000' },
  '@/contexts/EntitlementContext': { useEntitlement: () => ({ can: () => true }) },
  '@/lib/bodyMetrics': { fetchLatestBodyMetric: async () => null, fetchRestingHRSummary: async () => null, fetchBodyMetrics: async () => [] },
  '@/lib/workoutStorage': { WORKOUT_HISTORY_KEY: 'workout_history' },
};

test('getLastLoggedLabel shows the exact empty copy when nothing has ever been logged, never "never"', () => {
  const api = load('app/(tabs)/progress/index.tsx', progressIndexDeps);
  assert.equal(api.getLastLoggedLabel(null), 'No measurements logged yet.');
});

test('getLastLoggedLabel shows a date-based label once something has been logged', () => {
  const api = load('app/(tabs)/progress/index.tsx', progressIndexDeps);
  assert.equal(api.getLastLoggedLabel('2026-09-01'), 'Last logged 2026-09-01');
});

// --- Task E3: progress home — visible Pro marker on the Strength nav card (F16) ---

test('getStrengthNavLabel is unchanged when Advanced Analytics is entitled', () => {
  const api = load('app/(tabs)/progress/index.tsx', progressIndexDeps);
  assert.equal(api.getStrengthNavLabel(true), 'Strength progression');
});

test('getStrengthNavLabel appends a visible Pro marker when Advanced Analytics is locked', () => {
  const api = load('app/(tabs)/progress/index.tsx', progressIndexDeps);
  assert.equal(api.getStrengthNavLabel(false), 'Strength progression (Pro)');
});

// --- Final review, finding 2: behavioral render-harness tests for the F14 ---
// --- invariant (loading / error+retry / stale-but-visible / successful-empty). ---
// These render the real screens (react-test-renderer) with only native UI and
// the network boundary mocked, so deleting a loadState branch fails them.

async function bodyHost(opts: { failFirst?: boolean } = {}) {
  const React = req('react');
  const renderer = req('react-test-renderer');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let failNext = opts.failFirst ?? false;
  const exports: any = {};
  vm.runInNewContext(transpile('app/(tabs)/progress/body.tsx'), {
    exports, console, require(name: string) {
      if (name === 'react') return React;
      if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Alert: { alert() {} }, Pressable: 'Pressable', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (v: any) => v } };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name.includes('AuthProvider')) return { useAuth: () => ({ session: { user: { id: 'user-a' } } }) };
      if (name.includes('bodyMetricValidation')) return load('lib/bodyMetricValidation.ts', {});
      if (name.includes('bodyMetrics')) return {
        fetchBodyMetrics: async () => {
          if (failNext) { failNext = false; throw new Error('network down'); }
          return [{ id: 'entry-1', measured_date: '2026-09-21', weight_lbs: 180 }];
        },
        deleteBodyMetric: async () => {},
        upsertBodyMetric: async () => ({}),
      };
      if (name.includes('workoutRules')) return { todayISO: () => '2026-09-21' };
      if (name.includes('useThemeColor')) return { useThemeColor: () => 'black' };
      if (name.includes('useToast')) return { useToast: () => ({ toast: null, showToast: () => {}, hideToast() {} }) };
      const components: Record<string, string> = { 'themed-view': 'ThemedView', 'themed-text': 'ThemedText', 'screen-header': 'ScreenHeader', Toast: 'Toast' };
      for (const [suffix, component] of Object.entries(components)) if (name.endsWith(suffix)) return { [component]: component };
      throw new Error(name);
    },
  });
  let tree: any;
  await renderer.act(async () => { tree = renderer.create(React.createElement(exports.default)); });
  return {
    act: renderer.act,
    texts: () => tree.root.findAllByType('ThemedText').map((n: any) => flatten(n.props.children)).join(' | '),
    retryButton: () => tree.root.findAllByType('Pressable').find((p: any) => p.props.accessibilityLabel === 'Retry loading measurements'),
    failNextLoad: () => { failNext = true; },
    refresh: () => tree.root.findByType('ScrollView').props.refreshControl.props.onRefresh(),
    unmount: async () => renderer.act(async () => tree.unmount()),
  };
}

test('body.tsx: first load rejects -> Retry visible, empty copy absent', async () => {
  const h = await bodyHost({ failFirst: true });
  const t = h.texts();
  assert.match(t, /Couldn't load measurements\. Check your connection and try again\./);
  assert.ok(h.retryButton(), 'retry button should be visible');
  assert.doesNotMatch(t, /No measurements saved yet/);
  await h.unmount();
});

test('body.tsx: ready, then refresh rejects -> entries retained + stale banner shown', async () => {
  const h = await bodyHost();
  assert.match(h.texts(), /2026-09-21/, 'the loaded entry must render first');
  h.failNextLoad();
  await h.act(async () => { void h.refresh(); });
  const t = h.texts();
  assert.match(t, /2026-09-21/, 'entries must remain visible after a refresh failure');
  assert.match(t, /Couldn't refresh\. Showing previously loaded measurements\./);
  await h.unmount();
});

async function strengthHost() {
  const React = req('react');
  const renderer = req('react-test-renderer');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const responses: Record<string, () => Promise<any[]>> = {};
  const exports: any = {};
  vm.runInNewContext(transpile('app/(tabs)/progress/strength.tsx'), {
    exports, console, require(name: string) {
      if (name === 'react') return React;
      if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (v: any) => v }, TextInput: 'TextInput', View: 'View' };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name === 'expo-router') return { router: { push: () => {} } };
      if (name.includes('EntitlementContext')) return { useEntitlement: () => ({ can: () => true }) };
      if (name.includes('bodyMetrics')) return {
        fetchStrengthProgression: async (exercise: string) => {
          const handler = responses[exercise];
          return handler ? handler() : [];
        },
      };
      if (name.includes('useThemeColor')) return { useThemeColor: () => 'black' };
      if (name.includes('useToast')) return { useToast: () => ({ toast: null, showToast: () => {}, hideToast() {} }) };
      const components: Record<string, string> = { 'themed-view': 'ThemedView', 'themed-text': 'ThemedText', 'screen-header': 'ScreenHeader', Toast: 'Toast' };
      for (const [suffix, component] of Object.entries(components)) if (name.endsWith(suffix)) return { [component]: component };
      throw new Error(name);
    },
  });
  let tree: any;
  await renderer.act(async () => { tree = renderer.create(React.createElement(exports.default)); });
  return {
    act: renderer.act,
    texts: () => tree.root.findAllByType('ThemedText').map((n: any) => flatten(n.props.children)).join(' | '),
    setExercise: (name: string) => tree.root.findAllByType('TextInput')[0].props.onChangeText(name),
    press: () => tree.root.findAllByType('Pressable').find((p: any) => p.props.accessibilityLabel === 'Load strength progression').props.onPress(),
    setResponse: (exercise: string, handler: () => Promise<any[]>) => { responses[exercise] = handler; },
    unmount: async () => renderer.act(async () => tree.unmount()),
  };
}

test('strength.tsx: error vs successful-empty are visually distinguished', async () => {
  const h = await strengthHost();
  h.setResponse('Empty Lift', async () => []);
  await h.act(async () => { h.setExercise('Empty Lift'); });
  await h.act(async () => { void h.press(); });
  let t = h.texts();
  assert.match(t, /No saved sets found for this exercise/);
  assert.doesNotMatch(t, /Couldn't load progression data/);

  h.setResponse('Bad Lift', async () => { throw new Error('rpc exploded'); });
  await h.act(async () => { h.setExercise('Bad Lift'); });
  await h.act(async () => { void h.press(); });
  t = h.texts();
  assert.match(t, /Couldn't load progression data\. Check your connection and try again\./);
  assert.doesNotMatch(t, /No saved sets found for this exercise/);
  await h.unmount();
});

test('strength.tsx: a failed search for a different exercise never shows stale results under the wrong label (finding 1)', async () => {
  const h = await strengthHost();
  h.setResponse('Bench Press', async () => [{ workout_date: '2026-09-01', top_weight: 185, top_reps: 8, top_e1rm: 230, total_volume: 1480, set_count: 3 }]);
  await h.act(async () => { h.setExercise('Bench Press'); });
  await h.act(async () => { void h.press(); });
  assert.match(h.texts(), /2026-09-01/);

  h.setResponse('Squat', async () => { throw new Error('rpc exploded'); });
  await h.act(async () => { h.setExercise('Squat'); });
  await h.act(async () => { void h.press(); });
  const t = h.texts();
  assert.doesNotMatch(t, /2026-09-01/, 'stale Bench Press results must not show under a failed Squat search');
  assert.match(t, /Couldn't load progression data\. Check your connection and try again\./);
  await h.unmount();
});

test('strength.tsx: a late-resolving stale search never overwrites a newer one (finding 4)', async () => {
  const h = await strengthHost();
  let resolveSlow: (v: any[]) => void = () => {};
  h.setResponse('Slow Lift', () => new Promise((resolve) => { resolveSlow = resolve; }));
  await h.act(async () => { h.setExercise('Slow Lift'); });
  await h.act(async () => { void h.press(); });

  h.setResponse('Fast Lift', async () => [{ workout_date: '2026-09-10', top_weight: 100, top_reps: 5, top_e1rm: 115, total_volume: 500, set_count: 2 }]);
  await h.act(async () => { h.setExercise('Fast Lift'); });
  await h.act(async () => { void h.press(); });
  assert.match(h.texts(), /2026-09-10/);

  await h.act(async () => { resolveSlow([{ workout_date: '1999-01-01', top_weight: 1, top_reps: 1, top_e1rm: 1, total_volume: 1, set_count: 1 }]); });
  const t = h.texts();
  assert.doesNotMatch(t, /1999-01-01/, 'the stale, late-resolving search must not overwrite the newer result');
  assert.match(t, /2026-09-10/);
  await h.unmount();
});

async function indexHost(opts: { failFirst?: boolean; latest?: any } = {}) {
  const React = req('react');
  const renderer = req('react-test-renderer');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let failNext = opts.failFirst ?? false;
  const exports: any = {};
  vm.runInNewContext(transpile('app/(tabs)/progress/index.tsx'), {
    exports, console, require(name: string) {
      if (name === 'react') return React;
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: { getItem: async () => null } };
      if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (v: any) => v }, View: 'View' };
      if (name === 'expo-router') return { useRouter: () => ({ push: () => {} }), useFocusEffect: (cb: any) => React.useEffect(() => cb(), [cb]) };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name.includes('EntitlementContext')) return { useEntitlement: () => ({ can: () => true }) };
      if (name.includes('bodyMetrics')) return {
        fetchLatestBodyMetric: async () => {
          if (failNext) { failNext = false; throw new Error('network down'); }
          return opts.latest ?? null;
        },
        fetchRestingHRSummary: async () => null,
        fetchBodyMetrics: async () => [],
      };
      if (name.includes('workoutStorage')) return { WORKOUT_HISTORY_KEY: 'workout_history' };
      if (name.includes('useThemeColor')) return { useThemeColor: () => 'black' };
      const components: Record<string, string> = { 'themed-view': 'ThemedView', 'themed-text': 'ThemedText', 'screen-header': 'ScreenHeader', 'icon-symbol': 'IconSymbol' };
      for (const [suffix, component] of Object.entries(components)) if (name.endsWith(suffix)) return { [component]: component };
      throw new Error(name);
    },
  });
  let tree: any;
  await renderer.act(async () => { tree = renderer.create(React.createElement(exports.default)); });
  return {
    texts: () => tree.root.findAllByType('ThemedText').map((n: any) => flatten(n.props.children)).join(' | '),
    retryButton: () => tree.root.findAllByType('Pressable').find((p: any) => p.props.accessibilityLabel === 'Retry loading progress data'),
    unmount: async () => renderer.act(async () => tree.unmount()),
  };
}

test('progress home: first load rejects -> error+Retry, no "No measurements logged yet." (finding 2d)', async () => {
  const h = await indexHost({ failFirst: true });
  const t = h.texts();
  assert.match(t, /Couldn't load progress data\. Check your connection and try again\./);
  assert.ok(h.retryButton(), 'retry button should be visible');
  assert.doesNotMatch(t, /No measurements logged yet\./);
  await h.unmount();
});

test('progress home: success with null latest -> "No measurements logged yet." (finding 2d)', async () => {
  const h = await indexHost({ latest: null });
  const t = h.texts();
  assert.match(t, /No measurements logged yet\./);
  await h.unmount();
});
