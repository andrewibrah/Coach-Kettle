// Strict validation of the client's next-set evidence (A2). Malformed input is a client bug
// and is rejected (400), never trimmed. Numbers use the shared I3 rules (numericValue).
import type { NextSetEvidenceInput, PerformedSetEvidence } from "../_shared/nextSetDecision.ts";
import { record, shortId } from "../_shared/nextSetDecision.ts";
import type { CoachingAnswer, CurrentAnswer } from "../../../types/coachingAnswers.ts";
import { numericValue } from "../_shared/workoutValidation.ts";

// Transport bound (request size only, not coaching policy); ids use the shared 200-char shortId.
const MAX_ITEMS = 100;
const SET_KINDS = ["work", "warmup", "backoff", "drop", "superset", "cardio"];
const ANSWER_STATES = ["answered", "skipped", "unknown"];

type Obj = Record<string, unknown>;
const revision = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const known = (v: unknown, whole = false) => typeof v === "number" && numericValue(v, whole).kind === "known";

function validSet(s: unknown): boolean {
    return record(s) && shortId(s.id) && (s.setKind === undefined || s.setKind === null || SET_KINDS.includes(s.setKind as string)) &&
        (s.weightLbs === null || known(s.weightLbs)) && known(s.reps, true);
}

/** A persisted CoachingAnswer (types/coachingAnswers.ts); `state` must match where given. */
function validAnswer(a: unknown, questionId: string, state?: string): boolean {
    if (!record(a) || !shortId(a.answerId) || !shortId(a.sessionId) || !shortId(a.exerciseKey) || a.questionId !== questionId ||
        !ANSWER_STATES.includes(a.state as string) || (state !== undefined && a.state !== state) || a.provenance !== "user" ||
        typeof a.capturedAt !== "number" || !Number.isFinite(a.capturedAt) ||
        (a.rowId !== undefined && !shortId(a.rowId)) || (a.rowRevision !== undefined && !Number.isSafeInteger(a.rowRevision))) return false;
    if (a.state !== "answered") return a.value === undefined;
    return (typeof a.value === "number" && Number.isFinite(a.value)) || shortId(a.value);
}

/** A currentAnswer(...) entry. */
function validCurrent(c: unknown, questionId: string): boolean {
    if (!record(c) || c.questionId !== questionId) return false;
    if (c.excluded !== undefined && !(Array.isArray(c.excluded) && c.excluded.length <= MAX_ITEMS &&
        c.excluded.every((e) => record(e) && shortId(e.reason) && validAnswer(e.answer, questionId, "answered")))) return false;
    if (c.skippedLater !== undefined && c.skippedLater !== true) return false;
    switch (c.state) {
        case "unknown": return c.answer === undefined && c.evidence === undefined;
        case "skipped": return validAnswer(c.answer, questionId, "skipped");
        case "answered": return validAnswer(c.answer, questionId, "answered");
        case "conflict": return Array.isArray(c.evidence) && c.evidence.length > 0 && c.evidence.length <= MAX_ITEMS &&
            c.evidence.every((a) => validAnswer(a, questionId, "answered"));
        default: return false;
    }
}

/**
 * Null when malformed. The evidence session must be the session the baseline excludes, so
 * the prior-session baseline never includes the live session's own sets.
 */
export function readNextSetEvidence(value: unknown, sessionId: string | null): NextSetEvidenceInput | null {
    if (!record(value)) return null;
    const { request, sessionSets, answers, target, equipment } = value;
    if (!shortId(value.sessionId) || value.sessionId !== sessionId || !revision(value.revision) ||
        !record(request) || !shortId(request.sessionId) || !revision(request.revision) ||
        !shortId(value.exerciseKey) || !(equipment === null || shortId(equipment)) ||
        !Array.isArray(sessionSets) || sessionSets.length > MAX_ITEMS || !sessionSets.every(validSet) ||
        !record(answers) || Object.keys(answers).length > MAX_ITEMS || !Object.entries(answers).every(([id, c]) => validCurrent(c, id)) ||
        !(target === null || (record(target) && record(target.reps) && known(target.reps.low, true) && known(target.reps.high, true)))) {
        return null;
    }
    // Whitelisted, rebuilt: unknown keys (including any client `baseline`) never pass through.
    return {
        sessionId: value.sessionId as string, revision: value.revision as number,
        request: { sessionId: request.sessionId, revision: request.revision as number },
        exerciseKey: value.exerciseKey as string, equipment: equipment as string | null,
        sessionSets: (sessionSets as Obj[]).map((s) => ({ id: s.id, ...(s.setKind !== undefined && { setKind: s.setKind }),
            weightLbs: s.weightLbs, reps: s.reps }) as PerformedSetEvidence),
        answers: answers as Record<string, CurrentAnswer>,
        target: target === null ? null : { reps: { low: (target.reps as Obj).low as number, high: (target.reps as Obj).high as number } },
    };
}

/**
 * Re-key answers recorded under an alias of this lift (e.g. "bench" for tracked "Bench Press")
 * to the canonical key, so the engine compares them under one name. Answers for any other
 * lift keep their key and stay foreign.
 */
export function canonicalAnswers(answers: Record<string, CurrentAnswer>, sameLift: (key: string) => boolean,
    canonicalKey: string): Record<string, CurrentAnswer> {
    const rekey = (a: CoachingAnswer): CoachingAnswer => sameLift(a.exerciseKey) ? { ...a, exerciseKey: canonicalKey } : a;
    return Object.fromEntries(Object.entries(answers).map(([id, c]) => {
        const excluded = c.excluded?.map((e) => ({ ...e, answer: rekey(e.answer) }));
        const scoped = { ...c, ...(excluded && { excluded }) } as CurrentAnswer;
        if (scoped.state === "conflict") return [id, { ...scoped, evidence: scoped.evidence.map(rekey) }];
        if (scoped.state === "unknown") return [id, scoped];
        return [id, { ...scoped, answer: rekey(scoped.answer) }];
    }));
}
