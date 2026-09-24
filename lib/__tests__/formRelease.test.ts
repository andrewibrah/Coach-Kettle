import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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

test('capture cannot fabricate a score, even when arbitrary landmarks are supplied', () => {
  const api = load('lib/formAnalysis.ts', { './supabase': {} });
  for (const pose_landmarks of [null, { unvalidated: true }]) {
    assert.throws(() => api.estimateFormFromCapture({ exercise: 'Squat', expected_reps: 8, pose_landmarks }), /unavailable/i);
  }
});

test('saving while analysis is unavailable performs no authentication or database access', async () => {
  let accesses = 0;
  const supabase = new Proxy({}, { get() { accesses++; throw new Error('Unexpected backend access'); } });
  const api = load('lib/formAnalysis.ts', { './supabase': { supabase } });
  await assert.rejects(api.saveFormAnalysis({ exercise: 'Squat', video_uri: 'fixture://not-real' }), /unavailable/i);
  assert.equal(accesses, 0);
});

function renderForm(recent: any[], { isPro = false, pushes = [] as string[] } = {}) {
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }),
    useState: (value: any) => [Array.isArray(value) ? recent : value, () => {}],
    useEffect: () => {},
  };
  const api = load('lib/formAnalysis.ts', { './supabase': {} });
  return load('app/form/index.tsx', {
    react: { ...react, default: react },
    'react-native': { View: 'View', Pressable: 'Pressable', TextInput: 'TextInput', ScrollView: 'ScrollView', StyleSheet: { create: (s: any) => s } },
    'expo-image-picker': {},
    'expo-router': { useRouter: () => ({ push: (href: string) => pushes.push(href) }) },
    '@/contexts/EntitlementContext': { useEntitlement: () => ({ isPro }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/components/ui/screen-header': { ScreenHeader: 'ScreenHeader' },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/components/ui/Toast': { Toast: 'Toast' },
    '@/hooks/useThemeColor': { useThemeColor: () => '#000' },
    '@/hooks/useToast': { useToast: () => ({ toast: null }) },
    '@/lib/formAnalysis': api,
  }).default();
}

test('Form Check announces unavailable analysis and offers no capture action', () => {
  const pushes: string[] = [];
  const tree = renderForm([], { pushes });
  assert.match(JSON.stringify(tree), /analysis is unavailable/i);
  function inspect(node: any) {
    if (!node || typeof node !== 'object') return;
    assert.notEqual(node.type, 'TextInput');
    // The only enabled control allowed is the upgrade CTA, and it may only open the paywall.
    if (node.type === 'Pressable' && node.props?.disabled !== true) {
      node.props.onPress();
      assert.deepEqual(pushes.splice(0), ['/paywall']);
    }
    for (const child of node.children ?? []) {
      if (Array.isArray(child)) child.forEach(inspect); else inspect(child);
    }
  }
  inspect(tree);
});

test('historical records remain identifiable without displaying unverified metrics or cues', () => {
  const record = { id: 'fixture-legacy', exercise: 'Fixture Squat', captured_at: '2026-09-07T12:00:00Z', rep_count: 8, rom_score: 70, form_score: 72, cues: [{ message: 'Fixture misleading advice' }], warnings: [], analyzer_version: 'local-form-v1' };
  const before = JSON.stringify(record);
  const rendered = JSON.stringify(renderForm([record]));
  assert.match(rendered, /Fixture Squat/);
  assert.match(rendered, /unverified/i);
  assert.doesNotMatch(rendered, /Fixture misleading advice|ROM |Form "/);
  assert.equal(JSON.stringify(record), before);
});

test('historical read returns stored rows unchanged and never writes them', async () => {
  const rows = [{ id: 'fixture-saved', form_score: 72, analyzer_version: 'local-form-v1' }];
  const calls: any[] = [];
  const query = {
    select(value: any) { calls.push(['select', value]); return query; },
    order(value: any, options: any) { calls.push(['order', value, options.ascending]); return query; },
    limit(value: any) { calls.push(['limit', value]); return Promise.resolve({ data: rows, error: null }); },
  };
  const api = load('lib/formAnalysis.ts', { './supabase': { supabase: { from(table: string) { calls.push(['from', table]); return query; } } } });
  assert.equal(await api.fetchRecentFormAnalyses(8), rows);
  assert.deepEqual(calls, [['from', 'form_analyses'], ['select', '*'], ['order', 'captured_at', false], ['limit', 8]]);
});

test('Form Check says video analysis is coming soon and never claims it works today', () => {
  const rendered = JSON.stringify(renderForm([]));
  assert.match(rendered, /Video analysis is coming soon/);
  assert.doesNotMatch(rendered, /analy[sz]e your form|record your (set|lift)|upload a video|get (a )?form score/i);
});

test('free users get an upgrade CTA to the paywall; Pro users do not', () => {
  const upgradeCtas = (tree: any) => {
    const out: any[] = [];
    const walk = (node: any) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Pressable' && node.props?.accessibilityLabel === 'Upgrade to Pro') out.push(node);
      walk(node.children);
    };
    walk(tree);
    return out;
  };
  const pushes: string[] = [];
  const free = upgradeCtas(renderForm([], { isPro: false, pushes }));
  assert.equal(free.length, 1);
  free[0].props.onPress();
  assert.deepEqual(pushes, ['/paywall']);
  assert.equal(upgradeCtas(renderForm([], { isPro: true })).length, 0);
});

test('Settings keeps the Form check entry visible with coming-soon copy and the guarded /form route', () => {
  const settings = readFileSync(new URL('../../app/settings/index.tsx', import.meta.url), 'utf8');
  const start = settings.indexOf("router.push('/form'");
  assert.ok(start > 0);
  const row = settings.slice(start, settings.indexOf('</Pressable>', start));
  assert.match(row, />Form check</);
  assert.match(row, /Video analysis coming soon · view previous records/);
  assert.match(row, /accessibilityLabel="Form check — video analysis coming soon; view previous records"/);
  assert.doesNotMatch(settings, /isPro[^\n]*\/form|\/form[^\n]*isPro/);
});
