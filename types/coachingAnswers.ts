// Structured readiness/pain/effort answers (A1). Every policy-dependent value
// (wording, scales, choices, freshness) comes from a QuestionnairePolicy; D09/Q8 is
// unapproved, so the shipped policy is null and the feature is inert.

type AnswerState = 'answered' | 'skipped' | 'unknown';

export interface CoachingAnswer {
  answerId: string;
  sessionId: string;
  /** Canonical lower-cased exercise name. */
  exerciseKey: string;
  rowId?: string;
  rowRevision?: number;
  questionId: string;
  /** Skipped/unknown carry no value; skipped never means "no pain". */
  state: AnswerState;
  value?: number | string;
  /** Epoch ms. */
  capturedAt: number;
  provenance: 'user';
}

type QuestionBase = { id: string; prompt: string; scope: 'exercise' | 'session' };
type ScaleQuestion = QuestionBase & { kind: 'scale'; min: number; max: number; step: number };
type ChoiceQuestion = QuestionBase & { kind: 'choice'; choices: string[] };
export type QuestionnaireQuestion = ScaleQuestion | ChoiceQuestion;

export interface QuestionnairePolicy {
  version: string;
  questions: QuestionnaireQuestion[];
  freshnessMs: number;
}

export type RejectReason =
  | 'policy_unapproved'
  | 'invalid_policy'
  | 'invalid_state'
  | 'invalid_provenance'
  | 'unknown_question'
  | 'invalid_value'
  | 'out_of_range'
  | 'off_step'
  | 'invalid_choice'
  | 'unexpected_value'
  | 'other_session'
  | 'other_exercise'
  | 'revision_mismatch'
  | 'clock_skew'
  | 'stale';

export type ValidationResult = { ok: true } | { ok: false; reason: RejectReason };

export interface AnswerContext {
  sessionId: string;
  exerciseKey: string;
  rowId?: string;
  rowRevision?: number;
}

/** Answered evidence for this question that was not applicable, with the reason. */
export type ExcludedAnswer = { answer: CoachingAnswer; reason: RejectReason };
type Excluded = { excluded?: ExcludedAnswer[] };

export type CurrentAnswer = Excluded & (
  | { questionId: string; state: 'unknown' }
  | { questionId: string; state: 'skipped'; answer: CoachingAnswer }
  | { questionId: string; state: 'answered'; answer: CoachingAnswer; skippedLater?: true }
  | { questionId: string; state: 'conflict'; evidence: CoachingAnswer[]; skippedLater?: true });
