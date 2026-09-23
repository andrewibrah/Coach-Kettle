import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { getCoachPresentation } from '../coachingEvidence.ts';

function screen(file: string, coaching: any) {
  const react = { createElement: (_: any, props: any, ...children: any[]) => ({ props, children }),
    useState: (v: any) => [v, () => {}], useCallback: (fn: any) => fn() };
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'react') return { ...react, default: react };
    if (name === 'react-native') return { StyleSheet: { create: (s: any) => s } };
    if (name === 'expo-router') return { useRouter: () => ({}), useFocusEffect: () => {} };
    if (name.includes('safe-area')) return { useSafeAreaInsets: () => ({ bottom: 0 }) };
    if (name.endsWith('CoachingContext')) return { useCoaching: () => coaching };
    if (name.endsWith('NutritionContext')) return { useNutrition: () => ({ date: '2026-09-07', totals: null, todayTarget: { target: null } }) };
    if (name.endsWith('coachingEvidence')) return { getCoachPresentation };
    if (name.endsWith('workoutRules')) return { todayISO: () => '2026-09-07' };
    if (name.endsWith('useThemeColor')) return { useThemeColor: () => '#000000' };
    return {};
  } });
  return exports.default();
}



function coachingHost(generate: () => Promise<any>) {
  const states: any[] = [], refs: any[] = [];
  let cursor = 0, refCursor = 0;
  const react = {
    createContext: () => ({ Provider: 'Provider' }), createElement: (_: any, props: any) => props.value,
    useState: (initial: any) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = v; }]; },
    useRef: (initial: any) => { const i = refCursor++; return refs[i] ??= { current: initial }; },
    useEffect: () => {}, useMemo: (fn: any) => fn(), useCallback: (fn: any) => fn,
  };
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL('../../contexts/CoachingContext.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, console: { warn() {} }, require: (name: string) => {
    if (name === 'react') return { ...react, default: react };
    if (name.endsWith('AuthProvider')) return { useAuth: () => ({ session: { user: { id: 'fixture-user' } } }) };
    if (name.endsWith('NutritionContext')) return { useNutrition: () => ({ date: '2026-09-07' }) };
    if (name.endsWith('workoutRules')) return { todayISO: () => '2026-09-07' };
    if (name.endsWith('/coaching')) return { generateFeedbackForDate: generate };
    return {};
  } });
  return () => { cursor = 0; refCursor = 0; return exports.CoachingProvider({ children: null }); };
}

test('regeneration failure is exposed to the screen instead of swallowed', async () => {
  const render = coachingHost(async () => { throw new Error('fixture failure'); });
  await assert.rejects(render().regenerateToday());
  assert.match(render().error, /could not|unable/i);
});

function clientApi(response: any) {
  const calls: any[] = [];
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL('../../lib/coaching.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => {
    if (name.endsWith('supabase')) return { supabaseUrl: 'https://fixture.invalid' };
    if (name.endsWith('auth')) return { fetchWithAuth: async (url: any, options: any) => {
      calls.push({ url, ...options }); return { ok: true, json: async () => ({ feedback: response }) };
    } };
    return {};
  } });
  return { api: exports, calls };
}

test('today fetch lets the server resolve "today" from the stored timezone instead of the device date', async () => {
  const { api, calls } = clientApi({ feedback_date: '2026-09-07' });
  await api.fetchTodayFeedback();
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[0].url, /action=today/);
});

test('regeneration with no date omits it from the body and accepts whatever date the server returns', async () => {
  const { api, calls } = clientApi({ feedback_date: '2026-09-08' });
  const feedback = await api.generateFeedbackForDate();
  assert.equal(feedback.feedback_date, '2026-09-08');
  assert.equal('date' in JSON.parse(calls[0].body), false);
});

test('regeneration with an explicit date still rejects a wrong-date report', async () => {
  const { api } = clientApi({ feedback_date: '2026-09-08' });
  await assert.rejects(api.generateFeedbackForDate('2026-09-07'));
});

const report = { feedback_date: '2026-09-07', nutrition_color: null, nutrition_score: null,
  workout_completed: false, did_well: 'Calories were close to target', streak_days: 0, harshness_level: 0 };

test('Coach screen suppresses unsupported saved praise and internal diagnostics', () => {
  const rendered = JSON.stringify(screen('app/coach/index.tsx', { today: report, loading: false }));
  assert.doesNotMatch(rendered, /Calories were close|harshness |nutrition n\/a/);
  assert.match(rendered, /snapshot|unavailable/);
});

test('history keys use the report date supplied by the RPC without relying on missing ids', () => {
  const tree = screen('app/coach/history.tsx', { loading: false, recent: [report, { ...report, feedback_date: '2026-09-06' }] });
  const keys: string[] = [];
  const visit = (value: any) => {
    if (value?.props?.accessibilityLabel?.includes('coach report')) keys.push(value.props.key);
    if (Array.isArray(value)) value.forEach(visit);
    else if (value?.children) visit(value.children);
  };
  visit(tree);
  assert.deepEqual(keys, ['2026-09-07', '2026-09-06']);
});
