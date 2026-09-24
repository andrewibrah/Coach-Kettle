import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useOnboarding } from '@/contexts/OnboardingContext';
import type { OnboardingDraft } from '@/lib/onboardingDraft';
import { createSubmitGuard } from '@/lib/submitGuard';

/**
 * Busy state and single-flight draft save for an onboarding step. `save`
 * resolves true only when the write succeeded; a failed write alerts and
 * resolves false so the caller stays on the step.
 */
export function useOnboardingSubmit() {
  const { draftLoading, draftSaving, updateDraft } = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [guard] = useState(createSubmitGuard);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const busy = submitting || draftSaving || draftLoading;

  const save = async (updates: Partial<OnboardingDraft>): Promise<boolean> => {
    if (!mounted.current || busy) return false;
    try {
      return await guard.run(async () => {
        setSubmitting(true);
        try {
          await updateDraft(updates);
        } finally {
          if (mounted.current) setSubmitting(false);
        }
      });
    } catch {
      if (mounted.current) Alert.alert('Could not save', 'Please try again.');
      return false;
    }
  };

  return { busy, loading: submitting || draftSaving, save, isBusy: () => guard.active || busy };
}
