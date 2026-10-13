import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { isPerformedRow } from '../performedSets.ts';
import { numericText, validateWorkoutRow } from '../workoutValidation.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';

const plain = (value: any) => JSON.parse(JSON.stringify(value));
const cardio = { id: 'cardio-original', exercise: 'Bike', set: 2, weightLbs: '', reps: '', notes: 'literal no pain', timestamp: 123, performance: 'performed', setKind: 'cardio', isCardio: true, durationMins: 12.5, distance: 0, distanceUnit: 'km', heartRate: 120, calories: 0, level: 0, plannedTarget: { reps: '', weightLbs: '' } };

// Execute the actual Edge entrypoint offline. Only auth and database IO are doubles.
function historyEdge(failure: { stage?: 'delete' | 'insert' | 'pr' } = {}) {
  let handler: any; let record: any; let inserted: any[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'offline-user' } }, error: null }) },
    // P4 moves the write seam into one RPC. This remains an IO double, not SQL proof.
    rpc: async (name: string, args: any) => {
      assert.equal(name, 'apply_workout_operation');
      if (failure.stage) return { error: { message: `private fixture ${failure.stage} failure` } };
      const payload = args.p_payload;
      record = { id: args.p_session_id, dateISO: payload.dateISO, part: payload.part,
        createdAt: payload.createdAt, rows_json: JSON.stringify(payload.rows), review_json: payload.review ? JSON.stringify(payload.review) : null, reflection: payload.reflection };
      inserted = payload.logRows.map((row: any, index: number) => ({
        workout_id: args.p_session_id, exercise: row.exercise, set_number: row.set ?? index+1,
        weight_lbs: row.weightLbs, reps: row.reps, notes: row.notes,
        is_cardio: row.isCardio ?? false, duration_mins: row.durationMins ?? null,
        distance: row.distance ?? null, distance_unit: row.distanceUnit ?? null,
        heart_rate: row.heartRate ?? null, calories: row.calories ?? null, level: row.level ?? null,
      }));
      return { data: { ok: true }, error: null };
    },
    from(table: string) {
      let operation = 'select';
      const chain: any = {
        upsert(value: any) { record = plain(value); operation = 'upsert'; return chain; },
        insert(value: any) { inserted = plain(value); operation = 'insert'; return chain; },
        delete() { operation = 'delete'; return chain; },
        select() { return chain; }, eq() { return chain; }, in() { return chain; }, limit() { return chain; }, order() { return chain; },
        single: async () => ({ data: record, error: null }),
        then(resolve: any, reject: any) { return Promise.resolve({ data: table === 'workouts' && operation === 'select' ? [record] : [], error: failure.stage === operation ? { message: 'private fixture write failure' } : null }).then(resolve, reject); },
      };
      return chain;
    },
  };
  const dependencies: Record<string, any> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: any) => { handler = fn; } },
    'https://esm.sh/@supabase/supabase-js@2.50.1': { createClient: () => client },
    '../_shared/liftMatching.ts': { resolveTrackedLift: () => null },
    '../_shared/workoutValidation.ts': { numericText, validateWorkoutRow },
  };
  const source = readFileSync(new URL('../../supabase/functions/history/index.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: {}, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
    Deno: { env: { get: () => 'offline-only' } }, Request, Response, URL, console,
  });
  return { request: (method: string, body?: any) => handler(new Request('https://offline.invalid/history', { method, headers: { Authorization: 'Bearer offline-test', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })), get record() { return record; }, get inserted() { return inserted; } };
}

function actualApi(fetchWithAuth: any) {
  return sourceModule('lib/api.ts', {
    './performedSets': { isPerformedRow },
    './supabase': { supabaseUrl: 'https://offline.invalid' }, './auth': { fetchWithAuth },
    './profile': { fetchProfile: async () => null }, './entitlements': { parseFeatureGateError: () => null },
    './nutrition': {}, './coaching': {}, './programming': {}, './bodyMetrics': {}, './exerciseLibrary': {},
  }).api;
}

function actualBuilder() {
  const values: any[] = ['10/07', ['Cardio'], true, 'original-session', 100, '2026-10-07'];
  const hook = sourceModule('hooks/useWorkoutSession.ts', {
    react: { useState: () => [values.shift(), () => {}], useCallback: (fn: any) => fn, useMemo: (fn: any) => fn(), useEffect: () => {} },
    'react-native': { AppState: {} }, '@/lib/workoutRules': { getTodayMMDD: () => '10/09', makeId: () => 'wrong-new-id', todayISO: () => '2026-10-09' },
  });
  return hook.useWorkoutSession({ onResetForNewDay: () => {} }).buildWorkoutToSave;
}

async function roundtrip(rows: any[], offline = false, failFirstLocal = false) {
  const edge = historyEdge(); const posts: any[] = []; let disconnected = offline;
  const api = actualApi(async (_url: string, options: any) => {
    if (disconnected) throw new Error('intentional offline transport');
    const payload = JSON.parse(options.body); posts.push(payload); return edge.request('POST', payload);
  });
  let raw: string | null = null; const writes: any[] = []; let localFailed = false;
  const storage = sourceModule('lib/workoutStorage.ts', {
    './api': { api }, '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => raw, setItem: async (_key: string, value: string) => { if (failFirstLocal && !localFailed) { localFailed = true; throw new Error('intentional local write failure'); } raw = value; writes.push(JSON.parse(value)); } } },
  });
  const reviews: any[] = []; let displayedReview: any = 'unset'; let ended = 0; let cleared = 0; const phases: string[] = [];
  const reviewApi = actualApi(async (_url: string, options: any) => {
    reviews.push(JSON.parse(options.body).rows);
    return new Response(JSON.stringify({ rating: 5, strengths: [], weakness: '', nextSessionNote: '' }));
  });
  const run = sourceClosure('handleEndWorkoutWithReview', {
    workoutId: 'original-session', selectedPart: 'Cardio', savedWorkoutIdRef: { current: null },
    api: reviewApi,
    buildWorkoutToSave: actualBuilder(), saveWorkoutLocalFirst: storage.saveWorkout,
    clearWorkoutDraft: async () => { cleared++; }, endWorkoutSession: () => { ended++; }, setRows: () => {}, setMessageInput: () => {}, setEditingCell: () => {}, setEditValue: () => {}, setReviewModalVisible: () => {}, setReviewLoading: () => {}, setSessionReview: (value: any) => { displayedReview = value; }, setSavePhase: (value: string) => phases.push(value), showToast: () => {}, console,
  });
  await run(rows);
  if (failFirstLocal) {
    assert.equal(raw, null); assert.equal(ended, 0); assert.equal(cleared, 0); assert.equal(phases.at(-1), 'failed');
    assert.equal(posts.length, 0);
    await run(rows);
  }
  const first = plain(await storage.listWorkouts());
  disconnected = false;
  const retried = await storage.syncPendingWorkouts();
  const local = plain(await storage.listWorkouts());
  const response = await edge.request('GET'); assert.equal(response.status, 200);
  return { first, local, remote: await response.json(), edge, posts, writes, retried, reviews, displayedReview, phases, ended, cleared };
}

test('actual history insert failure returns non-2xx and preserves local pending retry', async () => {
  const failure: { stage?: 'insert' } = { stage: 'insert' };
  const edge = historyEdge(failure);
  const session = { id: 'failure-session', revision: 1, operationKey: 'finalize:failure:1', dateISO: '2026-10-08', part: 'Cardio', createdAt: 123, rows: [cardio] };
  const response = await edge.request('POST', session);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Database error' });
  const api = actualApi(async (_url: string, options: any) => edge.request('POST', JSON.parse(options.body)));
  let raw: string | null = null;
  const storage = sourceModule('lib/workoutStorage.ts', {
    './api': { api }, '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => raw, setItem: async (_key: string, value: string) => { raw = value; } } },
  });
  assert.deepEqual(plain(await storage.saveWorkout(session)), { synced: false });
  assert.equal((await storage.listWorkouts())[0].pendingSync, true);
  assert.deepEqual(plain((await storage.listWorkouts())[0].rows), [cardio]);
  assert.equal(await storage.syncPendingWorkouts(), 0);
  assert.equal((await storage.listWorkouts())[0].pendingSync, true);
  failure.stage = undefined;
  assert.equal(await storage.syncPendingWorkouts(), 1);
  assert.equal((await storage.listWorkouts())[0].pendingSync, false);
  assert.deepEqual(plain((await storage.listWorkouts())[0].rows), [cardio]);
});

for (const stage of ['delete', 'pr'] as const) test(`actual history ${stage} failure is not acknowledged as finalization`, async () => {
  const edge = historyEdge({ stage });
  const response = await edge.request('POST', { id: 'failure-session', revision: 1, operationKey: 'finalize:failure:1', dateISO: '2026-10-08', part: 'Cardio', createdAt: 123, rows: [cardio] });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Database error' });
  if (stage === 'delete') assert.equal(edge.inserted.length, 0);
});

test('actual coach/API row projection retains cardio and typed evidence rather than strength zeros', () => {
  const project = sourceClosure('toApiRows', {});
  assert.deepEqual(plain(project([cardio])), [cardio]);
});

test('actual End -> builder -> local history -> API -> Edge reconciliation retains all typed cardio fields', async () => {
  const result = await roundtrip([cardio]);
  const expected = { ...cardio }; delete (expected as any).status;
  assert.deepEqual(result.local[0].rows, [expected]);
  assert.equal(result.local[0].id, 'original-session'); assert.equal(result.local[0].dateISO, '2026-10-07'); assert.equal(result.local[0].createdAt, 100);
  assert.deepEqual(result.posts[0].rows, [expected]);
  assert.deepEqual(result.remote[0].rows, [expected]);
  const log = result.edge.inserted[0];
  assert.equal(log.is_cardio, true); assert.equal(log.duration_mins, 12.5); assert.equal(log.distance, 0); assert.equal(log.distance_unit, 'km'); assert.equal(log.heart_rate, 120); assert.equal(log.calories, 0); assert.equal(log.level, 0);
  assert.deepEqual(result.writes[0][0].rows, [expected]); assert.deepEqual(result.writes[1][0].rows, [expected]);
  assert.equal(result.reviews.length, 0); assert.equal(result.displayedReview, null);
  assert.equal(result.local[0].review, undefined);
});

for (const failLocal of [false, true]) test(`actual AI ingestion -> mixed End -> offline pending retry -> API/Edge retains evidence (local failure ${failLocal})`, async () => {
  const legacy = { id: 'legacy-strength', exercise: 'Bench', set: 1, weightLbs: '0', reps: '0', notes: '', timestamp: 10, isCardio: false };
  const parsed = { ...cardio, id: 'ai-cardio', timestamp: 0, durationMins: 0 };
  const planned = { ...parsed, id: 'planned-cardio', performance: 'planned', plannedTarget: { reps: '30' } };
  const missing = { id: 'missing-optionals', exercise: 'Walk', set: 1, weightLbs: '', reps: '', notes: '', timestamp: 12, isCardio: true };
  const route = await runWorkoutRoute('Bench and Squat 185 8', [legacy], { rows: [parsed, planned, missing] });
  assert.equal(route.calls.filter(c => c.method === 'chat').length, 1);
  assert.equal(route.calls.filter(c => c.method === 'buildRowsFromApi').length, 1);
  const live = route.calls.filter(c => c.method === 'logSet');
  assert.deepEqual(live.map(c => c.data.isCardio), [true, true]);
  assert.equal(live[0].data.durationMins, 0); assert.equal(live[0].data.level, 0);
  assert.equal(route.calls.filter(c => c.method === 'rest' || c.method === 'pr').length, 0);
  const expected = [legacy, { ...parsed, performance: 'performed' }, { ...missing, performance: 'performed' }];
  const result = await roundtrip(route.rows, true, failLocal);
  assert.deepEqual(result.first[0].rows, expected); assert.equal(result.first[0].pendingSync, true);
  assert.deepEqual(result.local[0].rows, expected); assert.equal(result.local[0].pendingSync, false);
  assert.deepEqual(result.posts[0].rows, expected); assert.deepEqual(result.remote[0].rows, expected);
  assert.deepEqual(result.reviews, failLocal ? [[legacy], [legacy]] : [[legacy]]);
  assert.equal(result.retried, 1); assert.equal(result.ended, 1); assert.equal(result.cleared, 1);
  assert.equal(result.edge.inserted.length, 3);
  assert.equal(result.edge.inserted[1].is_cardio, true); assert.equal(result.edge.inserted[1].duration_mins, 0);
  assert.equal(result.edge.inserted[1].calories, 0); assert.equal(result.edge.inserted[1].level, 0);
  assert.equal('durationMins' in result.remote[0].rows[2], false);
});
