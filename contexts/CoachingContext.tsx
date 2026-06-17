// CoachingContext — today's daily feedback + recent history + behavior state.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthProvider';
import {
  fetchTodayFeedback,
  fetchRecentFeedback,
  generateFeedbackForDate,
  fetchBehaviorState,
} from '@/lib/coaching';
import type { DailyFeedback, BehaviorState } from '@/types/coaching';

interface CoachingContextValue {
  loading: boolean;
  error: string | null;
  today: DailyFeedback | null;
  recent: DailyFeedback[];
  state: BehaviorState | null;
  refresh: () => Promise<void>;
  regenerateToday: () => Promise<void>;
}

const CoachingContext = createContext<CoachingContextValue>({
  loading: true,
  error: null,
  today: null,
  recent: [],
  state: null,
  refresh: async () => {},
  regenerateToday: async () => {},
});

export const useCoaching = () => useContext(CoachingContext);

export function CoachingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<DailyFeedback | null>(null);
  const [recent, setRecent] = useState<DailyFeedback[]>([]);
  const [state, setState] = useState<BehaviorState | null>(null);

  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      if (isMounted.current) { setError(null); setToday(null); setRecent([]); setState(null); setLoading(false); }
      return;
    }
    if (isMounted.current) { setLoading(true); setError(null); }
    try {
      const [t, r, s] = await Promise.allSettled([
        fetchTodayFeedback(),
        fetchRecentFeedback(7),
        fetchBehaviorState(),
      ]);
      if (!isMounted.current) return;
      if (t.status === 'fulfilled') setToday(t.value);
      if (r.status === 'fulfilled') setRecent(r.value);
      if (s.status === 'fulfilled') setState(s.value);
      const failures = [t, r, s].filter(res => res.status === 'rejected');
      if (failures.length > 0) {
        setError('Coach data could not be fully loaded. Pull to retry.');
      }
    } catch (e) {
      console.warn('[CoachingContext] refresh error', e);
      if (isMounted.current) {
        setToday(null); setRecent([]); setState(null);
        setError('Coach data could not be loaded. Please try again.');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const regenerateToday = useCallback(async () => {
    if (!userId) return;
    try {
      const fresh = await generateFeedbackForDate();
      if (isMounted.current) setToday(fresh);
    } catch (e) {
      console.warn('[CoachingContext] regenerate error', e);
    }
  }, [userId]);

  const value = useMemo<CoachingContextValue>(() => ({
    loading, error, today, recent, state, refresh, regenerateToday,
  }), [loading, error, today, recent, state, refresh, regenerateToday]);

  return <CoachingContext.Provider value={value}>{children}</CoachingContext.Provider>;
}
