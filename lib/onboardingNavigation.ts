/** Indexed by completed-step count; step six can skip PR values. */
export const ONBOARDING_ROUTES = [
  '/onboarding/height',
  '/onboarding/age',
  '/onboarding/current-weight',
  '/onboarding/goal-weight',
  '/onboarding/focus',
  '/onboarding/pr-lifts',
  '/onboarding/pr-values',
  '/onboarding/workout-setup',
  '/onboarding/complete',
] as const;

export type OnboardingRoute = (typeof ONBOARDING_ROUTES)[number];
export type OnboardingInputRoute = Exclude<OnboardingRoute, '/onboarding/complete'>;

export interface OnboardingNavigationDraft {
  // Persisted values are validated at the navigation boundary.
  readonly current_step?: unknown;
  readonly tracked_lifts?: readonly string[] | null;
}

export function resolveOnboardingRoute(
  draft?: OnboardingNavigationDraft | null,
  profile?: { readonly onboarding_completed?: boolean } | null,
): OnboardingRoute | '/(tabs)' {
  if (profile?.onboarding_completed === true) return '/(tabs)';

  const step = draft?.current_step;
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 0 || step > 8) {
    return ONBOARDING_ROUTES[0];
  }
  if (step === 6 && !draft?.tracked_lifts?.length) {
    return '/onboarding/workout-setup';
  }
  return ONBOARDING_ROUTES[step];
}

const PREVIOUS_ROUTES = {
  '/onboarding/height': '/onboarding',
  '/onboarding/age': '/onboarding/height',
  '/onboarding/current-weight': '/onboarding/age',
  '/onboarding/goal-weight': '/onboarding/current-weight',
  '/onboarding/focus': '/onboarding/goal-weight',
  '/onboarding/pr-lifts': '/onboarding/focus',
  '/onboarding/pr-values': '/onboarding/pr-lifts',
  '/onboarding/workout-setup': '/onboarding/pr-lifts',
} as const satisfies Record<OnboardingInputRoute, OnboardingRoute | '/onboarding'>;

/** Semantic Back does not depend on the router's history stack. */
export function resolvePreviousOnboardingRoute(
  route: OnboardingInputRoute,
  trackedLifts?: readonly string[] | null,
): OnboardingRoute | '/onboarding' {
  if (route === '/onboarding/workout-setup' && trackedLifts?.length) {
    return '/onboarding/pr-values';
  }
  return PREVIOUS_ROUTES[route];
}

export type WorkoutSetupStep = 'initial' | 'name' | 'lifts' | 'addMore';

/** Back only changes navigation; saved templates are left untouched. */
export function resolveWorkoutSetupBack(
  step: WorkoutSetupStep,
  trackedLifts?: readonly string[] | null,
): { step: WorkoutSetupStep } | { route: OnboardingRoute | '/onboarding' } {
  if (step === 'initial') {
    return { route: resolvePreviousOnboardingRoute('/onboarding/workout-setup', trackedLifts) };
  }
  return { step: step === 'lifts' ? 'name' : 'initial' };
}
