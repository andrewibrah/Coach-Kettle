// D03/D07/D09 are unresolved (DECISIONS Q2-Q4, Q5-Q8): every switch ships disabled. Mirrored in
// supabase/functions/_shared/coachingPolicy.ts; change both together.
export const COACHING_POLICY = { version: 'unapproved', contextualDisclosures: false, adaptiveNextSet: false, structuredQuestions: false, reviewSetPolicy: false, suppressReviewLoadAdvice: false, restWorkSetsOnly: false } as const;
