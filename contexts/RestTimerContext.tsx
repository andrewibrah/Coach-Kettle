// RestTimerContext — wraps `useRestTimer` once so both the trigger code
// (workout screen) and the display chip (`RestTimerBar`) share the same state.

import React, { createContext, useContext } from 'react';
import { useRestTimer } from '@/hooks/useRestTimer';

type RestTimerCtx = ReturnType<typeof useRestTimer>;

const RestTimerContext = createContext<RestTimerCtx | null>(null);

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  const value = useRestTimer();
  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
}

export function useSharedRestTimer(): RestTimerCtx {
  const ctx = useContext(RestTimerContext);
  if (!ctx) throw new Error('useSharedRestTimer must be used within RestTimerProvider');
  return ctx;
}
