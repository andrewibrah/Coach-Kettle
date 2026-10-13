import type { LogRow } from '../types/workout';

export type SavePhase = 'idle' | 'confirming' | 'saving' | 'failed' | 'saved';
export type EndOwnership = {
  owner: string;
  epoch: number;
  revision: string;
  rows: LogRow[];
};

/** Optional coaching gets a bounded wait; timeout is not a fabricated review. */
export function settleOptionalReview<T>(request: Promise<T>, timeoutMs = 5000, clock = { setTimeout, clearTimeout }): Promise<T | null> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clock.clearTimeout(timer);
      resolve(value);
    };
    const timer = clock.setTimeout(() => finish(null), timeoutMs);
    request.then(finish, () => finish(null));
  });
}

/** Local UI ownership only. This cannot cancel an already dispatched server write. */
export function createSessionOwnership(initialOwner: string) {
  let owner = initialOwner;
  let epoch = 0;
  let mounted = true;
  let end: EndOwnership | null = null;
  let requestEpoch = 0;
  const requests = new Map<string, object>();
  const invalidateRequests = () => { requestEpoch++; requests.clear(); };
  const capture = () => ({ owner, epoch, requestEpoch });
  const isCurrent = (token: ReturnType<typeof capture>) => mounted && token.owner === owner && token.epoch === epoch && token.requestEpoch === requestEpoch;
  return {
    get busy() { return end !== null; },
    mount() { mounted = true; },
    dispose() { mounted = false; epoch++; end = null; invalidateRequests(); },
    setOwner(nextOwner: string) {
      if (owner === nextOwner) return false;
      owner = nextOwner; epoch++; end = null; invalidateRequests();
      return true;
    },
    capture,
    isSession(token: { owner: string; epoch: number }) { return mounted && token.owner === owner && token.epoch === epoch; },
    isCurrent,
    invalidateRequests,
    beginRequest(lane: string) {
      if (!mounted || end || requests.has(lane)) return null;
      const token = { ...capture(), lane };
      requests.set(lane, token);
      return token;
    },
    isCurrentRequest(token: ReturnType<typeof capture> & { lane: string }) {
      return isCurrent(token) && requests.get(token.lane) === token;
    },
    finishRequest(token: ReturnType<typeof capture> & { lane: string }) {
      if (!isCurrent(token) || requests.get(token.lane) !== token) return false;
      requests.delete(token.lane);
      return true;
    },
    beginEnd(rows: LogRow[]): EndOwnership | null {
      if (!mounted || end) return null;
      const snapshot: LogRow[] = JSON.parse(JSON.stringify(rows));
      end = { owner, epoch, revision: JSON.stringify(snapshot), rows: snapshot };
      return end;
    },
    isCurrentEnd(token: EndOwnership) { return mounted && end === token && token.owner === owner && token.epoch === epoch; },
    releaseEnd(token: EndOwnership) { if (end === token) end = null; },
  };
}
