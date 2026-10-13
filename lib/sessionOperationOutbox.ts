import type { LogRow } from '../types/workout';
import type { LogSetPR } from './api';

export type SessionOperation = {
  owner: string;
  sessionId: string;
  kind: 'row' | 'delete';
  payload: Record<string, unknown>;
};
type State = { version: 1; sequence: number; pending: SessionOperation[]; seen: Record<string, string>; abandoned: string[] };
type Dependencies = {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  send: (operation: SessionOperation) => Promise<{ ok?: boolean; pr?: LogSetPR | null } | null>;
};
/** One serialized local ledger; HTTP never holds the storage lock. */
export function createSessionOperationOutbox(deps: Dependencies) {
  let queue: Promise<unknown> = Promise.resolve();
  const identity = (owner: string, session: string, row = '') => JSON.stringify([owner, session, row]);
  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.then(fn); queue = result.catch(() => undefined); return result;
  };
  const read = async (): Promise<State> => {
    const raw = await deps.read();
    if (!raw) return { version:1, sequence:0, pending:[], seen:{}, abandoned:[] };
    const state = JSON.parse(raw);
    if (state.version !== 1 || !Number.isSafeInteger(state.sequence) || state.sequence < 0 ||
      !Array.isArray(state.pending) || !Array.isArray(state.abandoned) || !state.seen || typeof state.seen !== 'object') {
      throw new Error('Session operation recovery is unreadable; stored data was kept.');
    }
    return state;
  };
  const rows = (owner: string, sessionId: string, dateISO: string, changed: LogRow[], operation: 'put' | 'drop' | 'revise' = 'put') => enqueue(async () => {
    if (!owner || !sessionId || !dateISO) throw new Error('Session operation owner required');
    const state = await read();
    if (state.abandoned.includes(identity(owner,sessionId))) throw new Error('Session was abandoned');
    for (const row of changed) {
      const key = identity(owner,sessionId,row.id);
      const fingerprint = JSON.stringify({ operation, row });
      if (state.seen[key] === fingerprint || (operation === 'drop' && state.seen[key]?.startsWith('drop:'))) continue;
      if (state.seen[key]?.startsWith('drop:')) throw new Error('Deleted row identity cannot return');
      const revision = Math.max(Date.now(), state.sequence + 1);
      if (!Number.isSafeInteger(revision)) throw new Error('Session operation revision exhausted');
      state.sequence = revision;
      state.seen[key] = operation === 'drop' ? `drop:${fingerprint}` : fingerprint;
      state.pending = state.pending.filter(op => !(op.owner===owner && op.sessionId===sessionId && op.kind==='row' && op.payload.rowId===row.id));
      state.pending.push({ owner, sessionId, kind:'row', payload:{...row, sessionId, rowId:row.id, dateISO, revision, operationKey:`${operation}:${row.id}:${revision}`, operation} });
    }
    await deps.write(JSON.stringify(state));
  });
  const flush = async (owner: string, onReceipt?: (receipt: { ok?: boolean; pr?: LogSetPR | null }) => void) => {
    const snapshot = await enqueue(read);
    let acknowledged = 0;
    for (const op of snapshot.pending.filter(op => op.owner === owner)) {
      // A concurrent Clear/edit/abandon may have superseded this snapshot.
      const current = await enqueue(read);
      if (!current.pending.some(item => item.owner===owner && item.payload.operationKey===op.payload.operationKey && item.sessionId===op.sessionId)) continue;
      try {
        const receipt = await deps.send(op);
        if (receipt?.ok !== true) continue;
        const wasCurrent = await enqueue(async () => {
          const latest = await read();
          const matched = latest.pending.some(item => item.owner===owner && item.sessionId===op.sessionId && item.payload.operationKey===op.payload.operationKey);
          latest.pending = latest.pending.filter(item => !(item.owner===owner && item.sessionId===op.sessionId && item.payload.operationKey===op.payload.operationKey));
          if (op.kind === 'delete') latest.pending = latest.pending.filter(item => !(item.owner===owner && item.sessionId===op.sessionId));
          await deps.write(JSON.stringify(latest));
          return matched;
        });
        if (wasCurrent) onReceipt?.(receipt);
        acknowledged++;
      } catch { /* Keep exact committed identity for network/lost-ack/storage retry. */ }
    }
    return acknowledged;
  };
  const abandon = (owner: string, sessionId: string, dateISO: string) => enqueue(async () => {
    if (!owner || !sessionId || !dateISO) throw new Error('Session operation owner required');
    const state = await read();
    const key = identity(owner,sessionId);
    if (state.abandoned.includes(key)) return;
    state.abandoned.push(key);
    state.pending = state.pending.filter(op => !(op.owner===owner && op.sessionId===sessionId));
    // The checkpoint delete deliberately cannot claim an unknown/legacy ID.
    // A no-performance row tombstone allocates an owned open session first.
    const rowId = `abandon:${sessionId}:bootstrap:v1`;
    state.pending.push({ owner, sessionId, kind:'row', payload:{
      id:rowId, rowId, sessionId, dateISO, revision:1, operation:'drop',
      operationKey:`drop:${rowId}:1`, exercise:'Abandoned session', set:1, weightLbs:'', reps:'', notes:'',
    } });
    state.pending.push({ owner, sessionId, kind:'delete', payload:{
      id:sessionId, revision:Number.MAX_SAFE_INTEGER, operationKey:`delete:${sessionId}:terminal:v1`,
    } });
    await deps.write(JSON.stringify(state));
  });
  return { rows, flush, abandon };
}
