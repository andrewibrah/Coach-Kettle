// App and Edge use one implementation (and one policy slot), not drift-prone copies.
import type { NextSetDecision } from '../../../lib/nextSetDecision.ts';
import { NEXT_SET_REASONS } from '../../../lib/nextSetDecision.ts';
export { decideNextSet, agreesWithDecision, NEXT_SET_POLICY } from '../../../lib/nextSetDecision.ts';
export type { NextSetDecision, NextSetEvidence, NextSetEvidenceInput, NextSetPolicy, NextSetProposal, PerformedSetEvidence } from '../../../lib/nextSetDecision.ts';

// Transport bound (request size only, not coaching policy): at most 50 evidence ids of
// 200 chars each keeps the provider block small. A client must not send more.
const MAX_ID = 200;
const MAX_EVIDENCE_IDS = 50;
const WITH_ACTION = ['reduce', 'hold', 'increase'];

/** Shared Edge transport guards (also used by next-set/evidence.ts). */
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A non-blank id of at most 200 chars; whitespace-only is rejected. */
export const shortId = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_ID;
const load = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const range = (v: unknown): v is { low: number; high: number } => record(v) && Number.isSafeInteger(v.low) &&
    Number.isSafeInteger(v.high) && (v.low as number) > 0 && (v.low as number) <= (v.high as number);

/**
 * A client-sent decision for coach/chat context. The server cannot recompute it here, so it
 * is only trusted as far as it can be checked: the policy version must be the server's own
 * (`expectedVersion`, i.e. NEXT_SET_POLICY?.version ?? null, so the shipped null policy admits
 * only the inert `unavailable`), the reason must be a known engine code for that code, and the
 * action must be well formed. Rebuilt from known fields so nothing extra reaches a model.
 */
export function readNextSetDecision(value: unknown, expectedVersion: string | null): NextSetDecision | null {
    if (!record(value)) return null;
    const { code, action, reason, evidenceIds, policyVersion } = value;
    if (policyVersion !== expectedVersion || (expectedVersion === null && code !== 'unavailable') || typeof code !== 'string' || typeof reason !== 'string' ||
        !Object.hasOwn(NEXT_SET_REASONS, reason) || !NEXT_SET_REASONS[reason].includes(code) || !Array.isArray(evidenceIds) ||
        evidenceIds.length > MAX_EVIDENCE_IDS || !evidenceIds.every(shortId)) return null;
    const base = { reason, evidenceIds: [...evidenceIds], policyVersion };
    if (!WITH_ACTION.includes(code)) return action === undefined ? { code, ...base } as NextSetDecision : null;
    if (action === undefined) return { code, ...base } as NextSetDecision;
    if (!record(action) || (action.loadLbs !== undefined && !load(action.loadLbs)) || (action.reps !== undefined && !range(action.reps))) return null;
    const reps = action.reps as { low: number; high: number } | undefined;
    return { code, action: { ...(action.loadLbs !== undefined && { loadLbs: action.loadLbs }),
        ...(reps && { reps: { low: reps.low, high: reps.high } }) }, ...base } as NextSetDecision;
}

/**
 * Labeled provider block for coach/chat. This is guidance only: free prose is NOT enforced.
 * Enforcement is the structured review `nextSet` field (agreesWithDecision) and the A3 UI.
 */
export function nextSetDecisionBlock(decision: NextSetDecision): string {
    return `NEXT-SET DECISION (computed deterministically by the app from this session's evidence; context only, not sets to log): ` +
        `${JSON.stringify(decision)}\n` +
        `Any number you give for the user's next set (load, reps or a load change) must come only from this decision's action. ` +
        `If the decision has no action (for example stop_or_clarify or clarify), do not suggest any load, weight, rep target or load change. ` +
        `Do not diagnose.`;
}
