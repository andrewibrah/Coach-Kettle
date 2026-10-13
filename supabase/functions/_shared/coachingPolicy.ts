// D09 is unresolved: contextual coaching ships disabled. Mirrors lib/coachingPolicy.ts;
// change both together.
export const COACHING_POLICY = { version: 'unapproved', contextualDisclosures: false, adaptiveNextSet: false, structuredQuestions: false } as const;

// Transport-safety bounds, not coaching policy; mirrored in lib/coachingContext.ts.
// 5000 chars matches lib/chatStorage sanitizeContent; 100 disclosures and 200-char ids
// are request-size limits only. The client sends the most recent 100 plus an explicit
// omittedCount, so a malformed or oversized context is a client bug and is rejected
// (400), never trimmed here: symptom evidence is not silently dropped.
const MAX_TEXT = 5000;
const MAX_ID = 200;
const MAX_DISCLOSURES = 100;

export type Disclosure = {
    sessionId: string; source: 'row_note' | 'coach_question' | 'composer_message'; rowId: string | null;
    exercise: string | null; exerciseCanonical: string | null; revision: number | null; text: string;
};
export type CoachingContext = { sessionId: string; disclosures: Disclosure[]; omittedCount: number; exchange?: { question: string; answer: string } };

const shortId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID;
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Validated context, or null when malformed. */
export function readCoachingContext(value: unknown): CoachingContext | null {
    if (!record(value)) return null;
    const { sessionId, disclosures, omittedCount, exchange } = value;
    if (!shortId(sessionId) || !Array.isArray(disclosures) || disclosures.length > MAX_DISCLOSURES ||
        !Number.isSafeInteger(omittedCount) || (omittedCount as number) < 0) return null;
    if (exchange !== undefined && !(record(exchange) && text(exchange.question) && text(exchange.answer))) return null;
    const valid = disclosures.every((d) => record(d) && d.sessionId === sessionId && text(d.text) &&
        (d.source === 'row_note' ? shortId(d.rowId) : (d.source === 'coach_question' || d.source === 'composer_message') && d.rowId === null) &&
        (d.exercise === null || text(d.exercise)) && (d.exerciseCanonical === null || text(d.exerciseCanonical)) &&
        (d.revision === null || Number.isSafeInteger(d.revision)));
    return valid ? value as CoachingContext : null;
}

const label = (v: unknown) => v === null ? 'unknown' : JSON.stringify(v);

/** Labeled provider block; null when there is nothing to add. Absence means unknown. */
export function disclosureBlock(context: CoachingContext): string | null {
    if (context.disclosures.length === 0 && !context.exchange && context.omittedCount === 0) return null;
    const lines = context.disclosures.map(d => d.source === 'row_note'
        ? `- row note (row ${d.rowId}, exercise ${label(d.exercise)}, canonical ${label(d.exerciseCanonical)}, revision ${label(d.revision)}): ${JSON.stringify(d.text)}`
        : `- ${d.source === 'coach_question' ? 'coach question' : 'workout message'}: ${JSON.stringify(d.text)}`);
    if (context.omittedCount > 0) lines.push(`- ${context.omittedCount} earlier disclosures omitted for request size; they still apply as unknown, not resolved.`);
    const parts = [`CURRENT-SESSION DISCLOSURES (the user's exact words from this session, quoted verbatim). ` +
        `Context only: these are not chat turns and not sets to log. Do not diagnose. ` +
        `Anything not listed is unknown, not "no pain".\n${lines.join('\n')}`];
    if (context.exchange) {
        parts.push(`PRECEDING EXCHANGE (the user's previous workout message and the assistant's reply; context only, not sets to log):\n` +
            `- user: ${JSON.stringify(context.exchange.question)}\n- assistant: ${JSON.stringify(context.exchange.answer)}`);
    }
    return parts.join('\n\n');
}
