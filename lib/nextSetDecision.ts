// A2 deterministic next-set engine. Pure: no clock, IO or model. Relative `.ts` type
// imports (not `@/`) because Edge re-exports this file, as with workoutValidation.
import type { CoachingAnswer, CurrentAnswer } from '../types/coachingAnswers.ts';
import type { NextSetBaseline } from '../types/programming.ts';

type AnswerValue = number | string;
type RepRange = { low: number; high: number };

/** Every threshold/increment/response comes from here. D07/D09 are unapproved. */
export interface NextSetPolicy {
  version: string;
  /** readiness is cited in evidenceIds and clarifies on conflict/exclusion only; it has no response slot. */
  questionIds: { pain: string; effort: string; readiness: string };
  pain: { noPainValues: AnswerValue[]; stopValues: AnswerValue[] };
  /** Effort answers that trigger a response; first match wins. */
  effortResponses: { values: AnswerValue[]; response: 'hold' | 'reduce' }[];
  missedTargetResponse: 'hold' | 'reduce';
  /** Reps on the reference set that earn an increase when no target is planned; null = never. */
  untargetedProgressionReps: number | null;
  incrementLbs: Record<string, number>;
  decrementLbs: Record<string, number>;
}

/** Shipped value: inert until D07/D09 approve a versioned table. */
export const NEXT_SET_POLICY: NextSetPolicy | null = null;

export interface PerformedSetEvidence {
  id: string;
  setKind?: string | null;
  /** null = no load (bodyweight/unknown); never invented. */
  weightLbs: number | null;
  reps: number;
}

export interface NextSetEvidence {
  sessionId: string;
  revision: number;
  /** The revision the caller asked about; a mismatch is a race and returns `stale`. */
  request: { sessionId: string; revision: number };
  exerciseKey: string;
  equipment: string | null;
  /** Ordered current-session performed sets (performedRows), kept apart from the baseline. */
  sessionSets: PerformedSetEvidence[];
  baseline: NextSetBaseline | null;
  /** Output of currentAnswer(...) for this session/exercise/row. */
  answers: Record<string, CurrentAnswer>;
  target: { reps: RepRange } | null;
}

/** What a client sends to next-set: the Edge adds the H1 baseline it fetched. */
export type NextSetEvidenceInput = Omit<NextSetEvidence, 'baseline'>;

type NoActionCode =
  | 'unavailable' | 'stale' | 'stop_or_clarify' | 'baseline_mismatch' | 'invalid_evidence' | 'clarify' | 'no_history';
type ActionCode = 'reduce' | 'hold' | 'increase';
type NextSetAction = { loadLbs?: number; reps?: RepRange };

/**
 * Every reason code decideNextSet returns, with the codes it may appear with. Edge readers
 * validate client-sent decisions against this table (a test pins it to the engine's output).
 */
export const NEXT_SET_REASONS: Record<string, readonly string[]> = {
  policy_unapproved: ['unavailable'], revision_mismatch: ['stale'],
  pain_conflict: ['stop_or_clarify'], pain_stop: ['stop_or_clarify'], pain_clarify: ['stop_or_clarify'], pain_excluded: ['stop_or_clarify'],
  baseline_mismatch: ['baseline_mismatch'], invalid_target: ['invalid_evidence'],
  answer_conflict: ['clarify'], excluded_evidence: ['clarify'], no_history: ['no_history'],
  effort_response: ['hold', 'reduce'], missed_target: ['hold', 'reduce'],
  below_progression: ['hold'], pain_unanswered: ['hold'], no_load: ['hold'], no_increment_for_equipment: ['hold'],
  target_met: ['increase'], reps_threshold_met: ['increase'],
};

/** Only reduce/hold/increase may carry an action; stop/clarify and the rest never do. */
export type NextSetDecision = { reason: string; evidenceIds: string[]; policyVersion: string | null } &
  ({ code: NoActionCode; action?: never } | { code: ActionCode; action?: NextSetAction });

// Exclusions that are this session/exercise's own evidence (see coachingAnswers SAME_CONTEXT).
const OWN_EXCLUSIONS = ['clock_skew', 'stale', 'revision_mismatch'];
// Warmup/backoff/drop are prescribed lighter work (cardio is not strength): never a reference
// or a failure. Superset stays a reference, as H1 keeps it in the baseline.
const NOT_REFERENCE = ['warmup', 'backoff', 'drop', 'cardio'];
const isWorkSet = (setKind: string | null | undefined) => !setKind || !NOT_REFERENCE.includes(setKind);

const canon = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
// Equipment is data: never a prototype key.
const lookup = (table: Record<string, number>, key: string | null) => key !== null && Object.hasOwn(table, key) ? table[key] : undefined;
// Malformed sets are not evidence. A null load is explicit no-load, not malformed.
const isValidSet = (s: { weightLbs: number | null; reps: number }) =>
  (s.weightLbs === null || (Number.isFinite(s.weightLbs) && s.weightLbs >= 0)) && Number.isSafeInteger(s.reps) && s.reps > 0;
const isValidRange = (r: RepRange) => Number.isSafeInteger(r.low) && Number.isSafeInteger(r.high) && r.low > 0 && r.low <= r.high;

/** Defensive: answers from another session/exercise are never applicable here (still cited). */
function scopeAnswer(current: CurrentAnswer, own: (a: CoachingAnswer) => boolean): CurrentAnswer {
  const excluded = current.excluded?.filter(e => own(e.answer));
  const report = { excluded: excluded?.length ? excluded : undefined };
  const unknown: CurrentAnswer = { questionId: current.questionId, state: 'unknown', ...report };
  if (current.state === 'conflict') {
    const evidence = current.evidence.filter(own);
    return evidence.length ? { ...current, evidence, ...report } : unknown;
  }
  if (current.state !== 'unknown' && !own(current.answer)) return unknown;
  return { ...current, ...report };
}

function answerIds(current: CurrentAnswer | undefined): string[] {
  if (!current) return [];
  const own = current.state === 'conflict' ? current.evidence : current.state === 'unknown' ? [] : [current.answer];
  return [...own, ...(current.excluded ?? []).map(e => e.answer)].map(a => a.answerId);
}

/**
 * Fixed priority (A2 plan, not policy): safety stop/clarify → clarify contradictory or
 * excluded evidence → policy effort response → policy target/equipment progression →
 * hold/no_history. Skipped/unknown pain is never no-pain; only explicit no-pain allows an increase.
 */
export function decideNextSet(evidence: NextSetEvidence, policy: NextSetPolicy | null): NextSetDecision {
  const q = policy?.questionIds;
  const ids = [
    ...evidence.sessionSets.map(s => s.id),
    ...(evidence.baseline ? [`baseline:${evidence.baseline.workoutId}`] : []),
    ...(q ? [q.pain, q.effort, q.readiness] : []).flatMap(id => answerIds(evidence.answers[id])),
  ];
  const evidenceIds = [...new Set(ids)];
  const policyVersion = policy?.version ?? null;
  const out = (code: NoActionCode, reason: string): NextSetDecision => ({ code, reason, evidenceIds, policyVersion });
  const act = (code: ActionCode, reason: string, action: NextSetAction | undefined): NextSetDecision =>
    ({ code, ...(action && { action }), reason, evidenceIds, policyVersion });

  if (!policy || !q) return out('unavailable', 'policy_unapproved');
  if (evidence.request.sessionId !== evidence.sessionId || evidence.request.revision !== evidence.revision) {
    return out('stale', 'revision_mismatch');
  }

  const exercise = canon(evidence.exerciseKey);
  const own = (a: CoachingAnswer) => a.sessionId === evidence.request.sessionId && canon(a.exerciseKey) === exercise;
  const answers = Object.values(evidence.answers).map(a => scopeAnswer(a, own));
  const byId = (id: string) => answers.find(a => a.questionId === id);

  // 1. Safety: any pain value not explicitly listed as no-pain stops or clarifies.
  const pain = byId(q.pain);
  const noPain = (v: AnswerValue | undefined) => v !== undefined && policy.pain.noPainValues.includes(v);
  if (pain?.state === 'conflict') return out('stop_or_clarify', 'pain_conflict');
  if (pain?.state === 'answered' && !noPain(pain.answer.value)) {
    return out('stop_or_clarify', policy.pain.stopValues.includes(pain.answer.value as AnswerValue) ? 'pain_stop' : 'pain_clarify');
  }
  if (pain?.excluded?.some(e => OWN_EXCLUSIONS.includes(e.reason) && !noPain(e.answer.value))) {
    return out('stop_or_clarify', 'pain_excluded');
  }

  // 2. Mismatched, invalid, contradictory or excluded evidence for this exercise.
  if (evidence.baseline && canon(evidence.baseline.exercise) !== exercise) return out('baseline_mismatch', 'baseline_mismatch');
  if (evidence.target && !isValidRange(evidence.target.reps)) return out('invalid_evidence', 'invalid_target');
  if (answers.some(a => a.state === 'conflict')) return out('clarify', 'answer_conflict');
  if (answers.some(a => a.excluded?.some(e => OWN_EXCLUSIONS.includes(e.reason)))) return out('clarify', 'excluded_evidence');

  const reference = [...evidence.sessionSets].reverse().find(s => isWorkSet(s.setKind) && isValidSet(s)) ??
    [...(evidence.baseline?.sets ?? [])].reverse().find(s => isWorkSet(s.setKind) && isValidSet(s));
  if (!reference) return out('no_history', 'no_history');

  const load = reference.weightLbs;
  const reps = evidence.target?.reps;
  // The action carries a load only when one is known, and the planned rep range when there is one.
  const at = (loadLbs: number | null): NextSetAction | undefined => {
    if (loadLbs === null && !reps) return undefined;
    return { ...(loadLbs !== null && { loadLbs }), ...(reps && { reps }) };
  };
  const respond = (response: 'hold' | 'reduce', reason: string) => {
    if (response === 'hold') return act('hold', reason, at(load));
    const step = lookup(policy.decrementLbs, evidence.equipment);
    return act('reduce', reason, at(load !== null && step !== undefined ? Math.max(0, load - step) : null));
  };

  // 3. Approved effort response (hold or reduce only).
  const effort = byId(q.effort);
  if (effort?.state === 'answered') {
    const rule = policy.effortResponses.find(r => r.values.includes(effort.answer.value as AnswerValue));
    if (rule) return respond(rule.response, 'effort_response');
  }

  // 4. Target/equipment progression.
  if (reps && reference.reps < reps.low) return respond(policy.missedTargetResponse, 'missed_target');
  const threshold = reps ? reps.high : policy.untargetedProgressionReps;
  if (threshold === null || reference.reps < threshold) return act('hold', 'below_progression', at(load));
  if (pain?.state !== 'answered') return act('hold', 'pain_unanswered', at(load));
  if (load === null) return act('hold', 'no_load', at(null));
  const increment = lookup(policy.incrementLbs, evidence.equipment);
  if (increment === undefined) return act('hold', 'no_increment_for_equipment', at(load));
  return act('increase', reps ? 'target_met' : 'reps_threshold_met', at(load + increment));
}

/** A model's structured next-set field; never parsed from prose. Null and absent are equal. */
export interface NextSetProposal {
  code: string;
  loadLbs?: number | null;
  reps?: RepRange | null;
}

/**
 * Coach/chat/review enforcement: the model must emit a structured NextSetProposal, and it
 * agrees only if code, load and rep range all equal the decision exactly. Prose is never
 * parsed and is not enforcement; numeric advice in free text must be dropped, not checked.
 */
export function agreesWithDecision(decision: NextSetDecision, proposal: NextSetProposal): boolean {
  const a = decision.action;
  const reps = proposal.reps ?? undefined;
  const expected = a?.reps;
  // Both rep ranges absent, or both present with equal bounds; a malformed range never matches.
  const repsAgree = reps === undefined || expected === undefined
    ? reps === expected : reps.low === expected.low && reps.high === expected.high;
  return proposal.code === decision.code && (proposal.loadLbs ?? undefined) === a?.loadLbs && repsAgree;
}
