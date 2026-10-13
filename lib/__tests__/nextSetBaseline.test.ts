import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './workoutIdentityHarness.ts';

const baseline = { workoutId: 'w1', date: '2026-10-12', exercise: 'Bench Press', sets: [
  { setNumber: 1, setKind: 'work', weightLbs: 182.5, reps: 8, e1rm: 231.2 },
  { setNumber: 2, setKind: 'work', weightLbs: 182.5, reps: 9, e1rm: 237.3 },
  { setNumber: 3, setKind: 'backoff', weightLbs: 160, reps: 12, e1rm: 224 },
] };
const plain = (v: any) => JSON.parse(JSON.stringify(v));

function programming(fetchWithAuth: (url: string, init: any) => Promise<Response>) {
  return sourceModule('lib/programming.ts', { './supabase': { supabaseUrl: 'https://offline.invalid' }, './auth': { fetchWithAuth } });
}
const json = (body: any, status = 200) => async () => new Response(JSON.stringify(body), { status });

test('fetchNextSetSuggestion maps 200 with baseline to unavailable + baseline (adaptive off)', async () => {
  const r = await programming(json({ suggestion: null, reason: 'policy_unapproved', baseline })).fetchNextSetSuggestion('Bench');
  assert.deepEqual(plain(r), { status: 'unavailable', reason: 'policy_unapproved', baseline });
});
test('fetchNextSetSuggestion maps 200 with null baseline to no_history', async () => {
  const r = await programming(json({ suggestion: null, reason: 'policy_unapproved', baseline: null })).fetchNextSetSuggestion('Bench');
  assert.deepEqual(plain(r), { status: 'no_history' });
});
test('fetchNextSetSuggestion never claims no_history for a legacy response without a baseline field', async () => {
  const r = await programming(json({ suggestion: null, reason: 'policy_unapproved' })).fetchNextSetSuggestion('Bench');
  assert.deepEqual(plain(r), { status: 'unavailable', reason: 'policy_unapproved', baseline: null });
});
test('fetchNextSetSuggestion maps a returned suggestion', async () => {
  const suggestion = { suggested_weight_lbs: 185, suggested_reps_low: 6, suggested_reps_high: 8, strategy: 'hold', rationale: 'x' };
  const r = await programming(json({ suggestion, baseline })).fetchNextSetSuggestion('Bench');
  assert.deepEqual(plain(r), { status: 'suggestion', suggestion, baseline });
});
test('fetchNextSetSuggestion maps HTTP 500 and 401 to unavailable without throwing', async () => {
  for (const status of [500, 401]) {
    const r = await programming(json({ error: 'History unavailable' }, status)).fetchNextSetSuggestion('Bench');
    assert.deepEqual(plain(r), { status: 'unavailable', reason: 'error', baseline: null });
  }
});
test('fetchNextSetSuggestion maps a network throw to unavailable without throwing', async () => {
  const r = await programming(async () => { throw new TypeError('Network request failed'); }).fetchNextSetSuggestion('Bench');
  assert.deepEqual(plain(r), { status: 'unavailable', reason: 'error', baseline: null });
});
test('fetchNextSetSuggestion forwards the optional session id', async () => {
  const urls: string[] = [];
  const api = programming(async (url) => { urls.push(url); return new Response(JSON.stringify({ baseline: null })); });
  await api.fetchNextSetSuggestion('Bench Press', 'sess 1');
  await api.fetchNextSetSuggestion('Bench Press');
  assert.deepEqual(urls, [
    'https://offline.invalid/functions/v1/next-set?exercise=Bench%20Press&session=sess%201',
    'https://offline.invalid/functions/v1/next-set?exercise=Bench%20Press',
  ]);
});

// Minimal offline hook runtime: state, refs and dependency-tracked effects with cleanup.
function mountPill(fetchNextSetSuggestion: (exercise: string) => Promise<any>) {
  const states: any[] = []; const refs: any[] = []; const effects: any[] = [];
  let si = 0, ri = 0, ei = 0; let queued: (() => void)[] = [];
  const react = {
    useState: (init: any) => { const i = si++; if (!(i in states)) states[i] = init; return [states[i], (v: any) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
    useRef: (current: any) => { const i = ri++; return refs[i] ??= { current }; },
    useEffect: (fn: () => any, deps?: any[]) => {
      const i = ei++; const prev = effects[i];
      if (!prev || !deps || deps.some((d, k) => !Object.is(d, prev.deps[k]))) queued.push(() => { prev?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; });
    },
  };
  const node = (type: any, props: any) => ({ type, props });
  const mod = sourceModule('components/workout/NextSetSuggestion.tsx', {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    react: { __esModule: true, default: react, ...react },
    'react-native': { View: 'View', Pressable: 'Pressable', StyleSheet: { create: (v: any) => v } },
    '@/components/ui/themed-text': { ThemedText: 'ThemedText' },
    '@/hooks/useThemeColor': { useThemeColor: () => 'themed' },
    '@/lib/programming': { fetchNextSetSuggestion },
  });
  const text = (n: any): string => n == null || typeof n === 'boolean' ? '' : Array.isArray(n) ? n.map(text).join('') : typeof n === 'object' ? text(n.props?.children) : String(n);
  return { mod, render: (exercise: string) => { si = ri = ei = 0; queued = []; const tree = mod.NextSetSuggestionPill({ exercise }); queued.forEach((f) => f()); return text(tree); } };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('casing-only exercise change during an in-flight fetch does not leave Loading forever', async () => {
  let resolveFetch: (v: any) => void = () => {};
  const calls: string[] = [];
  const pill = mountPill((exercise) => { calls.push(exercise); return new Promise((r) => { resolveFetch = r; }); });
  assert.match(pill.render('bench'), /^$|Loading/);
  assert.match(pill.render('bench'), /Loading/);
  pill.render('Bench');
  resolveFetch({ status: 'no_history' });
  await settle();
  const shown = pill.render('Bench');
  assert.doesNotMatch(shown, /Loading/);
  assert.match(shown, /No previous session/);
  assert.equal(calls.length, 1, 'casing-only change must not refetch');
});
test('pill renders explicit unavailable, baseline and no-history states', async () => {
  for (const [result, expected] of [
    [{ status: 'unavailable', reason: 'policy_unapproved', baseline }, /Last session: 182\.5 lb × 9.*Suggestions off/],
    [{ status: 'unavailable', reason: 'error', baseline: null }, /Suggestions unavailable/],
    [{ status: 'no_history' }, /No previous session/],
  ] as const) {
    const pill = mountPill(async () => result);
    pill.render('Bench'); await settle();
    assert.match(pill.render('Bench'), expected);
  }
});
test('micro_load label is the returned delta, not a hardcoded +2.5 lb', async () => {
  const pill = mountPill(async () => ({ status: 'suggestion', baseline: null, suggestion: { last_top_weight_lbs: 185, suggested_weight_lbs: 190, suggested_reps_low: 6, suggested_reps_high: 8, strategy: 'micro_load', rationale: '' } }));
  pill.render('Bench'); await settle();
  const shown = pill.render('Bench');
  assert.match(shown, /\+5 lb/); assert.doesNotMatch(shown, /2\.5/);
});
test('loadDeltaLabel computes signed rounded delta and refuses missing numbers', () => {
  const { loadDeltaLabel } = mountPill(async () => null).mod;
  const s = (last: any, next: any) => ({ last_top_weight_lbs: last, suggested_weight_lbs: next });
  assert.equal(loadDeltaLabel(s(185, 187.5)), '+2.5 lb');
  assert.equal(loadDeltaLabel(s(185, 190)), '+5 lb');
  assert.equal(loadDeltaLabel(s(0.1, 0.3)), '+0.2 lb');
  assert.equal(loadDeltaLabel(s(200, 190)), '-10 lb');
  assert.equal(loadDeltaLabel(s(185, 185)), '0 lb');
  assert.equal(loadDeltaLabel(s(null, 190)), null);
  assert.equal(loadDeltaLabel(s(185, null)), null);
});
test('lastSessionLabel uses the heaviest set without rounding the load', () => {
  const { lastSessionLabel } = mountPill(async () => null).mod;
  assert.equal(lastSessionLabel(baseline), 'Last session: 182.5 lb × 9');
  assert.equal(lastSessionLabel({ ...baseline, sets: [] }), null);
});
