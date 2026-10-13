import assert from 'node:assert/strict';
import test from 'node:test';
import { isPerformedRow } from '../performedSets.ts';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';

export function offlineReviewApi(fetchWithAuth: (...args: any[]) => any) {
  return sourceModule('lib/api.ts', {
    './performedSets': { isPerformedRow },
    './supabase': { supabaseUrl: 'https://offline.invalid' }, './auth': { fetchWithAuth },
    './profile': { fetchProfile: async () => null }, './entitlements': { parseFeatureGateError: () => null },
    './nutrition': {}, './coaching': {}, './programming': {}, './bodyMetrics': {}, './exerciseLibrary': {},
  }).api;
}
const strengthRows = [{ exercise: 'Bench', set: 1, weightLbs: '0', reps: '0', notes: '' }];
const valid = { rating: 5, strengths: ['Logged evidence'], weakness: 'Review detail', nextSessionNote: 'Context' };
for (const [name, response] of [
  ['transport rejection', () => Promise.reject(new Error('private transport data'))],
  ['HTTP failure', async () => ({ ok: false, status: 503, text: async () => 'private provider response' })],
  ['no JSON', async () => ({ ok: true, text: async () => 'unstructured answer' })],
  ['invalid JSON', async () => ({ ok: true, text: async () => '{invalid}' })],
] as const) test(`actual API ${name} rejects instead of inventing a completed-session review`, async () => {
  await assert.rejects(offlineReviewApi(response).generateSessionReview(strengthRows, 'Push'), /Session review unavailable/);
});

for (const [name, value] of [
  ['missing fields', {}], ['invalid rating', { ...valid, rating: 'private invalid rating' }],
  ['invalid strengths', { ...valid, strengths: [{}] }], ['invalid weakness', { ...valid, weakness: {} }],
  ['invalid next note', { ...valid, nextSessionNote: null }],
] as const) test(`actual API ${name} cannot become a synthetic review`, async () => {
  await assert.rejects(offlineReviewApi(async () => ({ ok: true, text: async () => JSON.stringify(value) })).generateSessionReview(strengthRows, 'Push'), /Session review unavailable/);
});

for (const rating of [1, 6.5, 10]) test(`actual review accepts supplied rating ${rating} and empty text without default fabrication`, async () => {
  const value = { rating, strengths: [], weakness: '', nextSessionNote: '' };
  const result = await offlineReviewApi(async () => ({ ok: true, text: async () => JSON.stringify(value) })).generateSessionReview(strengthRows, 'Push');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), value);
});

test('actual API failure through actual End and real local-first storage saves performance with no fabricated review', async () => {
  const api = offlineReviewApi(async () => ({ ok: false, status: 503, text: async () => 'unavailable' }));
  let raw: string | null = null; let review: any = 'unset'; let ended = 0; const phases: string[] = [];
  const storage = sourceModule('lib/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => raw, setItem: async (_k: any, value: string) => { raw = value; } } },
    './api': { api: { saveWorkout: async () => { throw new Error('offline remote'); } } },
  });
  const row = { id: 'set-original', exercise: 'Bench', set: 1, weightLbs: '100', reps: '5', notes: 'literal', performance: 'performed', timestamp: 1 };
  const run = sourceClosure('handleEndWorkoutWithReview', {
    api, workoutId: 'original', selectedPart: 'Push', savedWorkoutIdRef: { current: null },
    saveWorkoutLocalFirst: storage.saveWorkout, buildWorkoutToSave: (rows: any[]) => ({ id: 'original', dateISO: '2026-10-07', part: 'Push', createdAt: 1, rows }),
    clearWorkoutDraft: async () => {}, setReviewModalVisible: () => {}, setReviewLoading: () => {},
    setSessionReview: (value: any) => { review = value; }, setSavePhase: (phase: string) => phases.push(phase),
    endWorkoutSession: () => ended++, setRows: () => assert.equal(JSON.parse(raw!)[0].rows[0].id, row.id),
    setMessageInput: () => {}, setEditingCell: () => {}, setEditValue: () => {}, showToast: () => {}, console,
  });
  await run([row]); const saved = JSON.parse(raw!)[0];
  assert.equal(saved.rows[0].id, 'set-original'); assert.equal(saved.dateISO, '2026-10-07');
  assert.equal(saved.review, undefined); assert.equal(review, null); assert.equal(ended, 1); assert.equal(phases.at(-1), 'saved');
});

test('actual valid review response remains compatible', async () => {
  const result = await offlineReviewApi(async () => ({ ok: true, text: async () => JSON.stringify(valid) })).generateSessionReview(strengthRows, 'Push');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), valid);
});

for (const rows of [[], [{ ...strengthRows[0], isCardio: true }], [{ ...strengthRows[0], setKind: 'cardio' }], [{ ...strengthRows[0], performance: 'planned' }], [{ ...strengthRows[0], weightLbs: '' }]]) test(`review with no strength evidence rejects before provider IO: ${JSON.stringify(rows)}`, async () => {
  let calls = 0;
  await assert.rejects(offlineReviewApi(async () => { calls++; return { ok: true, text: async () => JSON.stringify(valid) }; }).generateSessionReview(rows as any, 'Cardio'), /Session review unavailable/);
  assert.equal(calls, 0);
});

test('direct API mixed review sends only performed strength evidence', async () => {
  let payload: any;
  const api = offlineReviewApi(async (_url: any, options: any) => { payload = JSON.parse(options.body); return { ok: true, text: async () => JSON.stringify(valid) }; });
  await api.generateSessionReview([...strengthRows, { ...strengthRows[0], isCardio: true }, { ...strengthRows[0], performance: 'planned' }] as any, 'Push');
  assert.deepEqual(payload.rows, strengthRows);
});
