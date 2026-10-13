import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './workoutIdentityHarness.ts';

// SPEC F3: pre-P4 pending sessions (no revision/operationKey) must get a P4 identity, persisted
// in the queued history write BEFORE any HTTP, and a deterministic server rejection (403/409)
// must stop retries while keeping the local copy. Real lib/workoutStorage.ts over a fake store.
function harness(remote: (session: any) => Promise<unknown>) {
  const store = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => { store.set(key, value); },
    removeItem: async (key: string) => { store.delete(key); },
  };
  const mod = sourceModule('lib/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    './api': { api: { saveWorkout: remote } },
  });
  const read = () => JSON.parse(store.get(mod.WORKOUT_HISTORY_KEY) ?? '[]') as any[];
  const seed = (sessions: any[]) => store.set(mod.WORKOUT_HISTORY_KEY, JSON.stringify(sessions));
  return { mod, read, seed };
}
const legacy = (id: string) => ({
  id, dateISO: '2026-10-01', part: 'Push', createdAt: 1, pendingSync: true,
  rows: [{ id: `${id}-r1`, exercise: 'Bench', set: 1, weightLbs: '100', reps: '5', notes: '' }],
});
// The exact error shape api.saveWorkout throws today.
const rejected = (status: number, code: string) => new Error(`Failed to save workout: ${status} - ${JSON.stringify({ error: 'Operation rejected', code })}`);

test('legacy pending session gets a P4 identity persisted before HTTP, then syncs', async () => {
  const sent: any[] = [];
  const h = harness(async (payload) => {
    const stored = h.read().find((w) => w.id === 'old');
    assert.equal(stored.operationKey, payload.operationKey, 'identity persisted before the request');
    assert.equal(stored.revision, payload.revision);
    sent.push(payload);
  });
  h.seed([legacy('old')]);
  assert.equal(await h.mod.syncPendingWorkouts(), 1);
  assert.equal(sent.length, 1);
  assert.ok(Number.isSafeInteger(sent[0].revision) && sent[0].revision > 0);
  assert.match(sent[0].operationKey, /^finalize:old:\d+$/);
  assert.equal(sent[0].pendingSync, undefined);
  assert.equal(h.read()[0].pendingSync, false);
});

test('terminal 409 keeps the local copy, flags it and never retries it', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw rejected(409, 'legacy_session'); });
  h.seed([legacy('old')]);
  assert.equal(await h.mod.syncPendingWorkouts(), 0);
  const [stored] = h.read();
  assert.equal(stored.syncBlocked, 'legacy_session');
  assert.equal(stored.pendingSync, true, 'stays pending so a server refresh cannot replace the local copy');
  assert.equal(await h.mod.syncPendingWorkouts(), 0);
  assert.equal(calls, 1, 'not retried');
  const merged = await h.mod.mergeServerHistory([{ ...legacy('old'), pendingSync: undefined, part: 'Server copy' }]);
  assert.equal(merged.find((w: any) => w.id === 'old').part, 'Push');
});

test('403 is terminal too; 500, 401 and network failures stay retryable with the same identity', async () => {
  const forbidden = harness(async () => { throw rejected(403, 'forbidden'); });
  forbidden.seed([legacy('f')]);
  await forbidden.mod.syncPendingWorkouts();
  assert.equal(forbidden.read()[0].syncBlocked, 'forbidden');

  for (const failure of [new Error('Failed to save workout: 500 - {"error":"Database error"}'), new Error('Failed to save workout: 401 - x'), new TypeError('Network request failed')]) {
    const keys: string[] = [];
    const h = harness(async (payload) => { keys.push(payload.operationKey); throw failure; });
    h.seed([legacy('t')]);
    await h.mod.syncPendingWorkouts();
    await h.mod.syncPendingWorkouts();
    assert.equal(keys.length, 2, failure.message);
    assert.equal(keys[0], keys[1], 'retry reuses the persisted identity');
    assert.equal(h.read()[0].syncBlocked, undefined);
  }
});

test('terminalRejectionCode reads the delete error shape for the History message', () => {
  const { mod } = harness(async () => {});
  assert.equal(mod.terminalRejectionCode(new Error('Failed to delete workout: 409 - {"error":"Operation rejected","code":"legacy_session"}')), 'legacy_session');
  assert.equal(mod.terminalRejectionCode(new Error('Failed to delete workout: 500 - {"error":"Database error"}')), null);
  assert.equal(mod.terminalRejectionCode(new Error('Failed to delete workout: 409 - not json')), 'rejected');
  assert.equal(mod.terminalRejectionCode('nope'), null);
});

test('History delete message: legacy workouts are explained, other failures stay retryable', () => {
  const { mod } = harness(async () => {});
  assert.equal(mod.deleteFailureMessage(new Error('Failed to delete workout: 409 - {"error":"Operation rejected","code":"legacy_session"}')),
    'This workout was saved before sync updates and can no longer be changed or deleted.');
  assert.equal(mod.deleteFailureMessage(new Error('Failed to delete workout: 409 - {"code":"session_deleted"}')), 'This workout can no longer be deleted.');
  assert.equal(mod.deleteFailureMessage(new Error('Failed to delete workout: 500 - x')), 'Failed to delete workout. Please try again.');
});

test('N1: a deterministic 400 from history pre-validation (pre-P4 row without id) stops retrying but keeps the copy', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw new Error('Failed to save workout: 400 - {"error":"Session operation identity and unique row IDs required."}'); });
  h.seed([{ ...legacy('noid'), rows: [{ exercise: 'Bench', set: 1, weightLbs: '100', reps: '5', notes: '' }] }]);
  await h.mod.syncPendingWorkouts(); await h.mod.syncPendingWorkouts();
  assert.equal(calls, 1);
  const [stored] = h.read();
  assert.equal(stored.syncBlocked, 'invalid_session'); assert.equal(stored.pendingSync, true);
});

test('N2: deleting a never-synced workout (403 forbidden: no server session yet) says to retry after it syncs', () => {
  const { mod } = harness(async () => {});
  assert.equal(mod.deleteFailureMessage(new Error('Failed to delete workout: 403 - {"error":"Operation not allowed","code":"forbidden"}')),
    "This workout hasn't synced yet. Try deleting it again after it syncs.");
});
