import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { getCoachPresentation } from '../coachingEvidence.ts';

// Exercise screen functions with a controlled context. This verifies rendered
// values/wiring, not native layout, navigation, persistence, or lifecycle.
function render(file: string, symbol: string, nutrition: any, props = {}) {
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }),
    useMemo: (fn: any) => fn(), useCallback: (fn: any) => fn,
  };
  const exports: any = {};
  const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const sandbox = { exports, require: (name: string) => {
    if (name === 'react') return { ...react, default: react };
    if (name === 'react-native') return { StyleSheet: { create: (x: any) => x, hairlineWidth: 1 } };
    if (name === 'expo-router') return { useRouter: () => ({ push() {} }), useFocusEffect(fn: any) { if (nutrition.testFocus) fn(); } };
    if (name.includes('safe-area')) return { useSafeAreaInsets: () => ({ bottom: 0 }) };
    if (name.endsWith('NutritionContext')) return { useNutrition: () => nutrition };
    if (name.endsWith('coachingEvidence')) return { getCoachPresentation };
    if (name.endsWith('workoutRules')) return { todayISO: () => nutrition.clock ?? nutrition.date };
    if (name.endsWith('ProfileContext')) return { useProfile: () => ({ profile: {} }) };
    if (name.endsWith('trainingSchedule')) return { isTrainingDay: () => false };
    if (name.endsWith('useThemeColor')) return { useThemeColor: () => '#000000' };
    if (name.endsWith('useToast')) return { useToast: () => ({}) };
    return {};
  } };
  vm.runInNewContext(code, sandbox, { filename: file });
  return exports[symbol](props);
}


// Minimal hook host: real provider refresh code, isolated network/storage only.
function providerHost() {
  let day = '2026-09-06';
  const states: any[] = [], refs: any[] = [];
  let cursor = 0, refCursor = 0;
  const pending = new Map<string, (value: any) => void>();
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    createElement: (_: any, props: any) => props.value,
    useState: (initial: any) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (v: any) => { states[i] = v; }]; },
    useRef: (initial: any) => { const i = refCursor++; return refs[i] ??= { current: initial }; },
    useEffect: () => {}, useMemo: (fn: any) => fn(), useCallback: (fn: any) => fn,
  };
  const exports: any = {};
  const api = {
    fetchFoodLogDay: (date: string) => new Promise(resolve => pending.set(date, resolve)),
    fetchNutritionTargets: async () => ({ targets: null }),
    fetchNutritionTargetSet: async () => ({ target_set: null }),
    fetchMealPlan: async () => ({ plan: null, meals: [] }),
    fetchRecentFoods: async () => ({ foods: [] }),
  };
  const code = ts.transpileModule(readFileSync(new URL('../../contexts/NutritionContext.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, console, require: (name: string) => {
    if (name === 'react') return { ...react, default: react };
    if (name.endsWith('AuthProvider')) return { useAuth: () => ({ session: { user: { id: 'fixture-user' } } }) };
    if (name.endsWith('ProfileContext')) return { useProfile: () => ({ profile: {} }) };
    if (name.endsWith('workoutRules')) return { todayISO: () => day };
    if (name.endsWith('/nutrition')) return api;
    if (name.endsWith('trainingSchedule')) return { isTrainingDay: () => false };
    if (name.endsWith('nutritionTargets')) return { dayOfWeekFromIso: () => 1, resolveApprovedClientTarget: () => ({ target: null }) };
    if (name.endsWith('nutritionTargetStorage')) return { targetStorageKey: () => 'fixture-key', parseJson: () => null, buildImportSaveRequest: () => null };
    if (name.includes('async-storage')) return { __esModule: true, default: { getItem: async () => null, removeItem: async () => {} } };
    return {};
  } });
  return {
    render: () => { cursor = 0; refCursor = 0; return exports.NutritionProvider({ children: null }); },
    advance: () => { day = '2026-09-07'; },
    resolve: (date: string) => pending.get(date)!({ entries: [{ id: date }], totals: { calories: 100, log_count: 1 } }),
  };
}

test('rollover clears yesterday totals before the new request resolves', async () => {
  const host = providerHost();
  const first = host.render().refresh();
  host.resolve('2026-09-06');
  await first;
  host.advance();
  const next = host.render().refresh();
  try {
    assert.equal(host.render().date, '2026-09-07');
    assert.equal(host.render().totals, null);
    assert.equal(host.render().entries.length, 0);
  } finally { host.resolve('2026-09-07'); await next; }
});

test('late old-day refresh cannot replace the new-day food log', async () => {
  const host = providerHost();
  const old = host.render().refresh();
  host.advance();
  const next = host.render().refresh();
  host.resolve('2026-09-07');
  await next;
  host.resolve('2026-09-06');
  await old;
  assert.equal(host.render().entries[0]?.id, '2026-09-07');
});

const nutrition = {
  date: '2026-09-07', entries: [], totals: { calories: 100, protein_g: 10 },
  targets: { training_calories: 3000, training_protein_g: 225, rest_calories: 2700, rest_protein_g: 203 },
  weeklyGoals: {}, loading: false,
  todayTarget: { target: { calories: 2300, protein_g: 170 }, explanation: 'Weekly override for Monday', source: 'manual' },
};

test('Nutrition focus refreshes a stale day without refreshing an unchanged day', () => {
  let refreshes = 0;
  const data = { ...nutrition, testFocus: true, clock: '2026-09-08', refresh: () => { refreshes++; } };
  render('app/(tabs)/nutrition/index.tsx', 'default', data);
  assert.equal(refreshes, 1);
  render('app/(tabs)/nutrition/index.tsx', 'default', { ...data, clock: data.date });
  assert.equal(refreshes, 1);
});

test('Home coaching focus does not repeat old unsupported dietary directives', () => {
  const tree = JSON.stringify(render('components/home/HomeDashboard.tsx', 'HomeDashboard', nutrition, {
    program: null, currentWeek: null, programLoading: false, totals: null, targets: nutrition.targets,
    coachToday: { feedback_date: '2026-09-06', tomorrow_focus: 'Add a 200-cal snack', workout_completed: false },
  }));
  assert.doesNotMatch(tree, /Add a 200-cal snack/);
});

test('Add food appears before the budget and totals', () => {
  const screen = JSON.stringify(render('app/(tabs)/nutrition/index.tsx', 'default', nutrition));
  assert.ok(screen.indexOf('Add food') < screen.indexOf('budget'));
});

test('Home and Nutrition render the same resolved target rather than legacy training/rest values', () => {
  const home = JSON.stringify(render('components/home/HomeDashboard.tsx', 'HomeDashboard', nutrition, {
    program: null, currentWeek: null, programLoading: false, coachToday: null,
    totals: nutrition.totals, targets: nutrition.targets,
  }));
  const screen = JSON.stringify(render('app/(tabs)/nutrition/index.tsx', 'default', nutrition));
  assert.match(home, /2,300/);
  assert.match(home, /170/);
  assert.match(screen, /2300/);
  assert.match(screen, /Weekly override for Monday/);
  assert.doesNotMatch(home, /3,000/);
});
