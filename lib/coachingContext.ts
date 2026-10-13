import type { LogRow } from '../types/workout';

export type CoachTurn = { role: 'user' | 'assistant'; content: string };

export type DisclosureSource = 'row_note' | 'coach_question' | 'composer_message';

export type Disclosure = {
    sessionId: string;
    source: DisclosureSource;
    rowId: string | null; // row notes only
    exercise: string | null; // as typed on the row; null = unknown
    exerciseCanonical: string | null; // no client canonical lift mapping exists: always null (unknown)
    revision: number | null; // LogRow carries no revision: always null (unknown)
    text: string;
};

export type CoachingExchange = { question: string; answer: string };

export type CoachingContext = { sessionId: string; disclosures: Disclosure[]; omittedCount: number; exchange?: CoachingExchange };

/** Per-session coaching memory, in-process only. A new session owner starts empty. */
export type CoachingRecord = { owner: string; turns: CoachTurn[]; disclosures: Disclosure[]; exchange?: CoachingExchange };

// Transport-safety bounds, not coaching policy; mirrored in
// supabase/functions/_shared/coachingPolicy.ts. 5000 matches lib/chatStorage
// sanitizeContent; 100 disclosures and 200-char ids are request-size limits only.
export const MAX_CONTEXT_DISCLOSURES = 100;
export const MAX_CONTEXT_TEXT = 5000;
export const MAX_CONTEXT_ID = 200;

// Recognition only, reusing the structuredGate pain/effort vocabulary. It is not a
// clinical classifier: matched text is forwarded verbatim and never interpreted.
const PAIN_OR_EFFORT = /\b(?:pain|painful|hurts?|soreness|stiffness|aching|numbness|cramps?|rpe|rir|fatigue|exhaust(?:ed|ion))\b/i;

/**
 * Literal pain/effort disclosures, in order. No precedence: a later "no pain" never
 * removes an earlier disclosure, and absence (skip, missing answer) yields nothing,
 * never "no pain". Assistant text is never a user disclosure.
 */
export function collectDisclosures(
    rows: Pick<LogRow, 'id' | 'notes' | 'exercise'>[],
    messages: { source: 'coach_question' | 'composer_message'; text: string }[],
    sessionId: string,
): Disclosure[] {
    const unknown = { exerciseCanonical: null, revision: null };
    const disclosures: Disclosure[] = [];
    for (const row of rows) {
        if (typeof row.notes === 'string' && PAIN_OR_EFFORT.test(row.notes)) {
            disclosures.push({ sessionId, source: 'row_note', rowId: row.id, exercise: row.exercise?.trim() ? row.exercise : null, ...unknown, text: row.notes });
        }
    }
    for (const message of messages) {
        if (PAIN_OR_EFFORT.test(message.text)) {
            disclosures.push({ sessionId, source: message.source, rowId: null, exercise: null, ...unknown, text: message.text });
        }
    }
    return disclosures;
}

export function coachingRecordFor(ref: { current: CoachingRecord | null }, owner: string): CoachingRecord {
    if (ref.current?.owner !== owner) ref.current = { owner, turns: [], disclosures: [] };
    return ref.current;
}

/** Append-only (flag-gated): once observed, a disclosure survives row edits and deletes. */
export function observeCoaching(
    policy: { contextualDisclosures: boolean },
    record: CoachingRecord,
    sessionId: string | null | undefined,
    rows: Pick<LogRow, 'id' | 'notes' | 'exercise'>[],
    messages: { source: 'coach_question' | 'composer_message'; text: string }[],
): void {
    if (!policy.contextualDisclosures || !sessionId) return;
    for (const found of collectDisclosures(rows, messages, sessionId)) {
        const seen = found.source === 'row_note' &&
            record.disclosures.some(d => d.source === 'row_note' && d.rowId === found.rowId && d.text === found.text);
        if (!seen) record.disclosures.push(found);
    }
}

/** Request context, or undefined while the policy flag is off or no session exists. */
export function buildCoachingContext(
    policy: { contextualDisclosures: boolean },
    sessionId: string | null | undefined,
    record: CoachingRecord,
): CoachingContext | undefined {
    if (!policy.contextualDisclosures || !sessionId) return undefined;
    const fits = (d: Disclosure) => d.text.length <= MAX_CONTEXT_TEXT && (d.exercise?.length ?? 0) <= MAX_CONTEXT_TEXT &&
        (d.rowId?.length ?? 0) <= MAX_CONTEXT_ID;
    // Most recent within bounds; anything left out is counted, never silently dropped.
    const disclosures = record.disclosures.filter(fits).slice(-MAX_CONTEXT_DISCLOSURES);
    const exchange = record.exchange && record.exchange.question.length <= MAX_CONTEXT_TEXT &&
        record.exchange.answer.length <= MAX_CONTEXT_TEXT ? record.exchange : undefined;
    return { sessionId, disclosures, omittedCount: record.disclosures.length - disclosures.length, ...(exchange ? { exchange } : {}) };
}
