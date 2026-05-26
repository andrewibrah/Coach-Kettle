// NutritionContext — exposes today's food log, totals, targets, and active meal plan.
// Refresh model: pull on mount + when day changes + after every mutation.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/contexts/AuthProvider';
import {
  fetchFoodLogDay,
  fetchNutritionTargets,
  fetchMealPlan,
  logFood as logFoodApi,
  deleteFoodLog as deleteFoodLogApi,
  type LogFoodInput,
} from '@/lib/nutrition';
import type { FoodLogEntry, DailyTotals, NutritionTargets, MealPlan, PlannedMeal } from '@/types/nutrition';

interface NutritionContextValue {
  loading: boolean;
  date: string;                       // YYYY-MM-DD
  entries: FoodLogEntry[];
  totals: DailyTotals | null;
  targets: NutritionTargets | null;
  mealPlan: { plan: MealPlan | null; meals: PlannedMeal[] };
  refresh: () => Promise<void>;
  logFood: (input: LogFoodInput) => Promise<FoodLogEntry>;
  deleteEntry: (id: string) => Promise<void>;
}

const NutritionContext = createContext<NutritionContextValue>({
  loading: true,
  date: new Date().toISOString().slice(0, 10),
  entries: [],
  totals: null,
  targets: null,
  mealPlan: { plan: null, meals: [] },
  refresh: async () => {},
  logFood: async () => { throw new Error('Not ready'); },
  deleteEntry: async () => {},
});

export const useNutrition = () => useContext(NutritionContext);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NutritionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState<string>(todayIso());
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [totals, setTotals] = useState<DailyTotals | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [mealPlan, setMealPlan] = useState<{ plan: MealPlan | null; meals: PlannedMeal[] }>({ plan: null, meals: [] });

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      if (isMounted.current) {
        setEntries([]); setTotals(null); setTargets(null); setMealPlan({ plan: null, meals: [] });
        setLoading(false);
      }
      return;
    }
    const currentDate = todayIso();
    if (isMounted.current) {
      setLoading(true);
      setDate(currentDate);
    }
    try {
      const [dayRes, tgtRes, planRes] = await Promise.allSettled([
        fetchFoodLogDay(currentDate),
        fetchNutritionTargets(),
        fetchMealPlan(),
      ]);
      if (!isMounted.current) return;
      if (dayRes.status === 'fulfilled') {
        setEntries(dayRes.value.entries ?? []);
        setTotals(dayRes.value.totals ?? null);
      }
      if (tgtRes.status === 'fulfilled') setTargets(tgtRes.value.targets);
      if (planRes.status === 'fulfilled') setMealPlan({ plan: planRes.value.plan, meals: planRes.value.meals });
    } catch (e) {
      console.warn('[NutritionContext] refresh error', e);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [userId]);

  // Initial load + on auth change
  useEffect(() => { refresh(); }, [refresh]);

  // Day-boundary refresh
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && todayIso() !== date) {
        refresh();
      }
    });
    return () => sub.remove();
  }, [date, refresh]);

  const logFood = useCallback(async (input: LogFoodInput) => {
    const result = await logFoodApi(input);
    // optimistic refresh
    await refresh();
    return result.entry;
  }, [refresh]);

  const deleteEntry = useCallback(async (id: string) => {
    await deleteFoodLogApi(id);
    await refresh();
  }, [refresh]);

  const value = useMemo<NutritionContextValue>(() => ({
    loading, date, entries, totals, targets, mealPlan, refresh, logFood, deleteEntry,
  }), [loading, date, entries, totals, targets, mealPlan, refresh, logFood, deleteEntry]);

  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
}
