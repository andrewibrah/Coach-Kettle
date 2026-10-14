import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceModule } from './workoutIdentityHarness.ts';

// F6: a never-synced workout (no server session yet) is deleted through the durable abandon
// tombstone instead of failing with "try again after it syncs".
function setup(remote: (id: string) => Promise<unknown>) {
  const storage = sourceModule('lib/workoutStorage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } },
    './api': { api: {} },
  });
  const mod = sourceModule('lib/historyDelete.ts', { './workoutStorage': storage });
  const calls: string[] = [];
  const deps = {
    remoteDelete: async (id: string) => { calls.push(`remote:${id}`); return remote(id); },
    localDelete: async (id: string) => { calls.push(`local:${id}`); },
    abandon: async (owner: string, id: string, dateISO: string) => { calls.push(`abandon:${owner}:${id}:${dateISO}`); },
    flush: async (owner: string) => { calls.push(`flush:${owner}`); return 0; },
  };
  return { mod, calls, deps };
}
const forbidden = () => { throw new Error('Failed to delete workout: 403 - {"error":"Operation not allowed","code":"forbidden"}'); };
const item = (pendingSync?: boolean) => ({ id: 'w1', dateISO: '2026-10-12', pendingSync });

test('synced workout: server delete, then local delete', async () => {
  const { mod, calls, deps } = setup(async () => ({ ok: true }));
  assert.deepEqual(JSON.parse(JSON.stringify(await mod.deleteHistoryWorkout(item(false), 'u', deps))), { ok: true });
  assert.deepEqual(calls, ['remote:w1', 'local:w1']);
});

test('never-synced workout: the abandon tombstone is queued durably BEFORE the local copy is removed', async () => {
  const { mod, calls, deps } = setup(forbidden);
  assert.deepEqual(JSON.parse(JSON.stringify(await mod.deleteHistoryWorkout(item(true), 'u', deps))), { ok: true });
  assert.deepEqual(calls, ['remote:w1', 'abandon:u:w1:2026-10-12', 'local:w1', 'flush:u']);
});

test('the local copy survives when the abandon cannot be stored', async () => {
  const { mod, calls, deps } = setup(forbidden);
  deps.abandon = async () => { calls.push('abandon-failed'); throw new Error('storage full'); };
  const result = JSON.parse(JSON.stringify(await mod.deleteHistoryWorkout(item(true), 'u', deps)));
  assert.equal(result.ok, false);
  assert.equal(calls.includes('local:w1'), false);
});

test('forbidden on a synced workout, no owner, legacy or transient failures do not take the abandon path', async () => {
  for (const [it, owner, remote] of [
    [item(false), 'u', forbidden],
    [item(true), '', forbidden],
    [item(true), 'u', () => { throw new Error('Failed to delete workout: 409 - {"code":"legacy_session"}'); }],
    [item(true), 'u', () => { throw new Error('Failed to delete workout: 500 - x'); }],
  ] as const) {
    const { mod, calls, deps } = setup(remote as any);
    const result = JSON.parse(JSON.stringify(await mod.deleteHistoryWorkout(it, owner, deps)));
    assert.equal(result.ok, false);
    assert.equal(typeof result.message, 'string');
    assert.equal(calls.some((c) => c.startsWith('abandon') || c.startsWith('local')), false, JSON.stringify(calls));
  }
});
