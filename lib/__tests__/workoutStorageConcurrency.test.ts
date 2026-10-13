import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './workoutIdentityHarness.ts';

// P5: controlled barrier schedules over the real lib/workoutStorage.ts module.
// The fake AsyncStorage yields a macrotask on every read/write so that
// concurrent read-modify-write callers genuinely interleave, as on device.
// A JS queue cannot prove cross-process atomicity; only in-process schedules are claimed.
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T = void>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness(remote: (session: any) => Promise<unknown>) {
  const store = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => { await tick(); return store.get(key) ?? null; },
    setItem: async (key: string, value: string) => { await tick(); store.set(key, value); },
    removeItem: async (key: string) => { await tick(); store.delete(key); },
  };
  const mod = sourceModule('lib/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    './api': { api: { saveWorkout: remote } },
  });
  const read = () => JSON.parse(store.get(mod.WORKOUT_HISTORY_KEY) ?? '[]') as any[];
  const seed = (sessions: any[]) => store.set(mod.WORKOUT_HISTORY_KEY, JSON.stringify(sessions));
  return { mod, read, seed };
}
const offline = async () => { throw new Error('offline'); };
const session = (id: string, extra: Record<string, unknown> = {}) => ({
  id, dateISO: '2026-10-13', part: 'Push', createdAt: 1,
  rows: [{ id: `${id}-r1`, exercise: 'Bench', set: 1, weightLbs: '100', reps: '5', notes: '' }], ...extra,
});

test('two concurrent saves of different workouts both survive', async () => {
  const { mod, read } = harness(offline);
  await Promise.all([mod.saveWorkout(session('a')), mod.saveWorkout(session('b'))]);
  assert.deepEqual(read().map(w => w.id).sort(), ['a', 'b']);
  assert.ok(read().every(w => w.pendingSync === true));
});

test('concurrent save and delete of a different workout keep the save and the delete', async () => {
  const { mod, read, seed } = harness(offline);
  seed([session('old', { revision: 1, operationKey: 'finalize:old:1' })]);
  await Promise.all([mod.saveWorkout(session('new')), mod.deleteWorkout('old')]);
  assert.deepEqual(read().map(w => w.id), ['new']);
});

test('old retry acknowledgement after a newer pending revision does not overwrite or clear it', async () => {
  const gate = deferred();
  let calls = 0;
  const { mod, read, seed } = harness(async () => { calls += 1; if (calls === 1) return gate.promise; throw new Error('offline'); });
  seed([session('x', { revision: 1, operationKey: 'finalize:x:1', pendingSync: true })]);
  const retry = mod.syncPendingWorkouts();
  while (calls === 0) await tick();
  const newer = session('x', { revision: 2, operationKey: 'finalize:x:2',
    rows: [{ id: 'x-r1', exercise: 'Bench', set: 1, weightLbs: '105', reps: '5', notes: '' }] });
  await mod.saveWorkout(newer);
  gate.resolve();
  await retry;
  const [stored] = read();
  assert.equal(stored.revision, 2);
  assert.equal(stored.rows[0].weightLbs, '105');
  assert.equal(stored.pendingSync, true, 'only the acknowledged revision may clear pendingSync');
});

test('slow acknowledgement of an older save cannot replace a newer save of the same workout', async () => {
  const gate = deferred();
  let calls = 0;
  const { mod, read } = harness(async () => { calls += 1; if (calls === 1) return gate.promise; throw new Error('offline'); });
  const first = mod.saveWorkout(session('y', { revision: 1, operationKey: 'finalize:y:1' }));
  while (calls === 0) await tick();
  await mod.saveWorkout(session('y', { revision: 2, operationKey: 'finalize:y:2', part: 'Pull' }));
  gate.resolve();
  assert.equal((await first).synced, true);
  const [stored] = read();
  assert.equal(stored.revision, 2); assert.equal(stored.part, 'Pull'); assert.equal(stored.pendingSync, true);
});

test('matching acknowledgement still clears pendingSync for that revision', async () => {
  const { mod, read, seed } = harness(async () => ({}));
  seed([session('z', { revision: 3, operationKey: 'finalize:z:3', pendingSync: true })]);
  assert.equal(await mod.syncPendingWorkouts(), 1);
  assert.equal(read()[0].pendingSync, false);
  assert.equal(read()[0].revision, 3);
});

test('a workout deleted while its sync is in flight is not resurrected by the acknowledgement', async () => {
  const gate = deferred();
  let calls = 0;
  const { mod, read } = harness(async () => { calls += 1; return gate.promise; });
  const save = mod.saveWorkout(session('gone'));
  while (calls === 0) await tick();
  await mod.deleteWorkout('gone');
  gate.resolve();
  await save;
  assert.deepEqual(read(), []);
});

test('review enrichment arriving after delete does not resurrect the workout', async () => {
  const review = deferred<any>();
  const { mod, read } = harness(offline);
  const save = mod.saveWorkout(session('rev'), { review: review.promise });
  while (read().length === 0) await tick();
  await mod.deleteWorkout('rev');
  review.resolve({ rating: 7, strengths: [], weakness: '', nextSessionNote: '', generatedAt: 1 });
  await save;
  assert.deepEqual(read(), []);
});

test('concurrent same-workout saves without identity get distinct increasing revisions', async () => {
  const sent: any[] = [];
  const { mod } = harness(async (s: any) => { sent.push(s); });
  await Promise.all([mod.saveWorkout(session('dup')), mod.saveWorkout(session('dup', { part: 'Legs' }))]);
  assert.equal(sent.length, 2);
  assert.ok(sent[1].revision > sent[0].revision);
  assert.notEqual(sent[0].operationKey, sent[1].operationKey);
});

test('server history refresh keeps local pending revisions and concurrent saves', async () => {
  const { mod, read, seed } = harness(offline);
  seed([
    session('pending', { revision: 5, operationKey: 'finalize:pending:5', pendingSync: true, part: 'Local edit' }),
    session('synced', { revision: 1, operationKey: 'finalize:synced:1', pendingSync: false, part: 'Stale local' }),
  ]);
  const server = [session('pending', { part: 'Server old' }), session('synced', { part: 'Server truth' }), session('remote-only')];
  const [merged] = await Promise.all([mod.mergeServerHistory(server), mod.saveWorkout(session('during'))]);
  const byId = Object.fromEntries(read().map(w => [w.id, w]));
  assert.deepEqual(Object.keys(byId).sort(), ['during', 'pending', 'remote-only', 'synced']);
  assert.equal(byId.pending.part, 'Local edit'); assert.equal(byId.pending.pendingSync, true);
  assert.equal(byId.synced.part, 'Server truth');
  assert.ok(merged.some((w: any) => w.id === 'pending' && w.part === 'Local edit'));
});

test('server history refresh does not resurrect a local delete that raced it', async () => {
  const { mod, read, seed } = harness(offline);
  seed([session('keep', { pendingSync: true, revision: 1, operationKey: 'finalize:keep:1' })]);
  await Promise.all([mod.mergeServerHistory([]), mod.deleteWorkout('keep')]);
  assert.deepEqual(read(), []);
});

test('sign-out clear is not undone by a history merge queued before it', async () => {
  const { mod, read } = harness(offline);
  await Promise.all([mod.mergeServerHistory([session('userA-synced')]), mod.clearWorkouts()]);
  assert.deepEqual(read(), []);
});

test('sign-out clear is not undone by an in-flight save or its acknowledgement', async () => {
  const gate = deferred();
  let calls = 0;
  const { mod, read } = harness(async () => { calls += 1; return gate.promise; });
  const save = mod.saveWorkout(session('userA'));
  await mod.clearWorkouts();
  gate.resolve();
  await save;
  assert.equal(calls, 1, 'the acknowledgement path ran');
  assert.deepEqual(read(), []);
});

test('saves after sign-out clear are kept for the next user', async () => {
  const { mod, read } = harness(offline);
  await mod.clearWorkouts();
  await mod.saveWorkout(session('userB'));
  assert.deepEqual(read().map(w => w.id), ['userB']);
});
