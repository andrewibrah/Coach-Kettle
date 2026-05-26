// ProgramContext — the user's currently active workout program (multi-week).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthProvider';
import {
  fetchActiveProgram,
  fetchProgramWeek,
  generateProgram,
  advanceProgramWeek,
  type GenerateProgramInput,
  type ProgramWeekExpanded,
} from '@/lib/programming';
import type { WorkoutProgram } from '@/types/programming';

interface ProgramContextValue {
  loading: boolean;
  program: WorkoutProgram | null;
  currentWeek: ProgramWeekExpanded | { week: null; days: never[] } | null;
  refresh: () => Promise<void>;
  loadWeek: (weekNumber: number) => Promise<ProgramWeekExpanded | { week: null; days: never[] }>;
  create: (input: GenerateProgramInput) => Promise<WorkoutProgram>;
  advance: () => Promise<void>;
}

const ProgramContext = createContext<ProgramContextValue>({
  loading: true,
  program: null,
  currentWeek: null,
  refresh: async () => {},
  loadWeek: async () => ({ week: null, days: [] }),
  create: async () => { throw new Error('Not ready'); },
  advance: async () => {},
});

export const useProgram = () => useContext(ProgramContext);

export function ProgramProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState<WorkoutProgram | null>(null);
  const [currentWeek, setCurrentWeek] = useState<ProgramWeekExpanded | { week: null; days: never[] } | null>(null);

  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      if (isMounted.current) { setProgram(null); setCurrentWeek(null); setLoading(false); }
      return;
    }
    if (isMounted.current) setLoading(true);
    try {
      const p = await fetchActiveProgram();
      if (!isMounted.current) return;
      setProgram(p);
      if (p) {
        const w = await fetchProgramWeek(p.id, p.current_week);
        if (isMounted.current) setCurrentWeek(w);
      } else {
        setCurrentWeek(null);
      }
    } catch (e) {
      console.warn('[ProgramContext] refresh error', e);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const loadWeek = useCallback(async (weekNumber: number) => {
    if (!program) return { week: null, days: [] as never[] };
    return await fetchProgramWeek(program.id, weekNumber);
  }, [program]);

  const create = useCallback(async (input: GenerateProgramInput) => {
    const p = await generateProgram(input);
    await refresh();
    return p;
  }, [refresh]);

  const advance = useCallback(async () => {
    if (!program) return;
    await advanceProgramWeek(program.id);
    await refresh();
  }, [program, refresh]);

  const value = useMemo<ProgramContextValue>(() => ({
    loading, program, currentWeek, refresh, loadWeek, create, advance,
  }), [loading, program, currentWeek, refresh, loadWeek, create, advance]);

  return <ProgramContext.Provider value={value}>{children}</ProgramContext.Provider>;
}
