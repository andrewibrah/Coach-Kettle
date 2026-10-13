import type { AnswerContext, CoachingAnswer, CurrentAnswer, ExcludedAnswer, QuestionnairePolicy, QuestionnaireQuestion, RejectReason, ValidationResult } from '@/types/coachingAnswers';

const OK: ValidationResult = { ok: true };
const fail = (reason: RejectReason): ValidationResult => ({ ok: false, reason });

// Valid answers that do not apply here are still evidence and are reported as excluded.
const EXCLUSIONS: RejectReason[] = ['other_session', 'other_exercise', 'clock_skew', 'stale', 'revision_mismatch'];
// Same session/exercise, but not current: these can never be silently outvoted.
const SAME_CONTEXT: RejectReason[] = ['clock_skew', 'stale', 'revision_mismatch'];

/** A scale the UI cannot enumerate (step <= 0, non-finite or inverted bounds). */
export function isMalformedScale(question: QuestionnaireQuestion): boolean {
  return question.kind === 'scale' && !(Number.isFinite(question.min) && Number.isFinite(question.max) &&
    question.max >= question.min && Number.isFinite(question.step) && question.step > 0);
}

/** Shape/bounds check against the policy. A null (unapproved) policy rejects everything. */
export function validateAnswer(answer: CoachingAnswer, policy: QuestionnairePolicy | null): ValidationResult {
  if (!policy) return fail('policy_unapproved');
  const question = policy.questions.find(q => q.id === answer.questionId);
  if (!question) return fail('unknown_question');
  if (!['answered', 'skipped', 'unknown'].includes(answer.state)) return fail('invalid_state');
  if (answer.provenance !== 'user') return fail('invalid_provenance');
  if (isMalformedScale(question)) return fail('invalid_policy');
  if (answer.state !== 'answered') return answer.value === undefined ? OK : fail('unexpected_value');
  const value = answer.value;
  if (question.kind === 'choice') return typeof value === 'string' && question.choices.includes(value) ? OK : fail('invalid_choice');
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail('invalid_value');
  if (value < question.min || value > question.max) return fail('out_of_range');
  const steps = (value - question.min) / question.step;
  return Math.abs(steps - Math.round(steps)) < 1e-9 ? OK : fail('off_step');
}

/** Whether a valid answer applies to this session/exercise/row now. */
export function isApplicable(answer: CoachingAnswer, ctx: AnswerContext, policy: QuestionnairePolicy | null, now: number): ValidationResult {
  const valid = validateAnswer(answer, policy);
  if (!valid.ok || !policy) return valid;
  if (answer.sessionId !== ctx.sessionId) return fail('other_session');
  const question = policy.questions.find(q => q.id === answer.questionId);
  if (question?.scope === 'exercise' && answer.exerciseKey !== ctx.exerciseKey) return fail('other_exercise');
  // Captured "in the future" (clock moved backwards) or a non-finite time: unknown.
  if (!(answer.capturedAt <= now)) return fail('clock_skew');
  if (answer.capturedAt + policy.freshnessMs < now) return fail('stale');
  // Only the answer's own row can be superseded; other sets of the exercise still apply.
  // D09 open: whether effort is set-scoped, i.e. whether an answer on a deleted row r1 counts for r2.
  if (answer.rowId !== undefined && answer.rowId === ctx.rowId && answer.rowRevision !== ctx.rowRevision) {
    return fail('revision_mismatch');
  }
  return OK;
}

/**
 * Latest applicable answer per question. `answers` is an append-only log: "later"
 * is log position, never capturedAt. Skipped/unknown never become a value and never
 * clear a prior answered value (marked `skippedLater`). Differing answered values,
 * even under one answerId, are a conflict keeping all evidence (precedence is D09).
 * Answered evidence that does not apply is reported in `excluded`. Same-context
 * exclusions (clock skew, stale, superseded revision) that differ from the surviving
 * value, or have no survivor, make a conflict: they are never silently outvoted.
 */
export function currentAnswer(answers: CoachingAnswer[], ctx: AnswerContext, policy: QuestionnairePolicy | null, now: number): Record<string, CurrentAnswer> {
  if (!policy) return {};
  const result: Record<string, CurrentAnswer> = {};
  for (const { id: questionId } of policy.questions) {
    // Keyed by answerId + value: an identical repeat collapses, a changed value does not.
    // D09 open: whether every effort edit should be a permanent conflict versus latest-wins.
    const answered = new Map<string, CoachingAnswer>();
    const excluded: ExcludedAnswer[] = [];
    let lastSkip: CoachingAnswer | undefined;
    let skippedLater = false;
    for (const answer of answers) {
      if (answer.questionId !== questionId) continue;
      const applicable = isApplicable(answer, ctx, policy, now);
      if (!applicable.ok) {
        if (answer.state === 'answered' && EXCLUSIONS.includes(applicable.reason)) excluded.push({ answer, reason: applicable.reason });
        continue;
      }
      if (answer.state === 'answered') {
        const key = JSON.stringify([answer.answerId, answer.value]);
        answered.delete(key);
        answered.set(key, answer);
        skippedLater = false;
      } else {
        lastSkip = answer;
        if (answered.size > 0) skippedLater = true;
      }
    }
    const survivors = [...answered.values()];
    const values = new Set(survivors.map(a => a.value));
    const outvoted = excluded.filter(e => SAME_CONTEXT.includes(e.reason) && (values.size === 0 || !values.has(e.answer.value)))
      .map(e => e.answer);
    const extra = { ...(skippedLater && { skippedLater: true as const }) };
    const report = { ...(excluded.length > 0 && { excluded }) };
    if (values.size > 1 || outvoted.length > 0) {
      const evidence = answers.filter(a => survivors.includes(a) || outvoted.includes(a));
      result[questionId] = { questionId, state: 'conflict', evidence, ...extra, ...report };
    } else if (survivors.length > 0) {
      result[questionId] = { questionId, state: 'answered', answer: survivors[survivors.length - 1], ...extra, ...report };
    } else {
      result[questionId] = lastSkip ? { questionId, state: 'skipped', answer: lastSkip, ...report } : { questionId, state: 'unknown', ...report };
    }
  }
  return result;
}
