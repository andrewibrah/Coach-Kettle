// D09 is unresolved: contextual coaching ships disabled. Mirrored in
// supabase/functions/_shared/coachingPolicy.ts; change both together.
export const COACHING_POLICY = { version: 'unapproved', contextualDisclosures: false, adaptiveNextSet: false, structuredQuestions: false } as const;
