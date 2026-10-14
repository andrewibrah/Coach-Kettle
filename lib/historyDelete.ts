import { deleteFailureMessage, terminalRejectionCode } from './workoutStorage';

type Item = { id: string; dateISO: string; pendingSync?: boolean };
type Deps = {
  remoteDelete: (id: string) => Promise<unknown>;
  localDelete: (id: string) => Promise<void>;
  abandon: (owner: string, id: string, dateISO: string) => Promise<void>;
  flush: (owner: string) => Promise<number>;
};

/**
 * History delete. A never-synced workout has no server session yet (403 forbidden), so the
 * server delete cannot succeed. Instead, queue the durable abandon (bootstrap row + permanent
 * tombstone) first, then drop the local copy: a late sync of that ID is rejected by the tombstone.
 */
export async function deleteHistoryWorkout(item: Item, owner: string, deps: Deps): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await deps.remoteDelete(item.id);
  } catch (error) {
    if (!(owner && item.pendingSync && terminalRejectionCode(error) === 'forbidden')) {
      return { ok: false, message: deleteFailureMessage(error) };
    }
    try {
      await deps.abandon(owner, item.id, item.dateISO);
    } catch {
      return { ok: false, message: 'Failed to delete workout. Please try again.' };
    }
    await deps.localDelete(item.id).catch(() => undefined);
    deps.flush(owner).catch(() => undefined);
    return { ok: true };
  }
  // Keep the offline cache consistent so the workout can't resurrect on next sync.
  await deps.localDelete(item.id).catch(() => undefined);
  return { ok: true };
}
