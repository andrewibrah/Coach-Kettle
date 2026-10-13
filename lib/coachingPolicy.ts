// D03/D07/D09 are unresolved (DECISIONS Q2-Q4, Q5-Q8): every switch ships disabled. Mirrored in
// supabase/functions/_shared/coachingPolicy.ts; change both together.
// questionnaire: null until D09/Q8 approves wording, scales and freshness (A1 is inert).
import type { QuestionnairePolicy } from '@/types/coachingAnswers';

export const COACHING_POLICY = { version: 'unapproved', contextualDisclosures: false, adaptiveNextSet: false, structuredQuestions: false, reviewSetPolicy: false, suppressReviewLoadAdvice: false, restWorkSetsOnly: false, questionnaire: null as QuestionnairePolicy | null } as const;
