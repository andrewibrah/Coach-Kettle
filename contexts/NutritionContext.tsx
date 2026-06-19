// NutritionContext — exposes today's food log, totals, targets, and active meal plan.
// Refresh model: pull on mount + when day changes + after every mutation.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/contexts/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import {
  fetchFoodLogDay,
  fetchNutritionTargets,
  fetchMealPlan,
  fetchRecentFoods,
  logFood as logFoodApi,
  deleteFoodLog as deleteFoodLogApi,
  updateFoodLog as updateFoodLogApi,
  type LogFoodInput,
} from '@/lib/nutrition';
import { isTrainingDay } from '@/lib/trainingSchedule';
import type { FoodLogEntry, DailyTotals, NutritionTargets, MealPlan, PlannedMeal, RecentFood, WeeklyGoals } from '@/types/nutrition';

const WEEKLY_GOALS_KEY = 'nutrition_weekly_goals_v1';
const LOCAL_TARGETS_KEY = 'nutrition_targets_local_v1';

// ---------- Grade helpers (module scope, pure) ----------

function scoreNear(actual: number, target: number, tolerance: number): number {
  if (target <= 0) return 50;
  const diff = Math.abs(actual - target) / target;
  if (diff <= tolerance) return 100;
  return Math.max(0, 100 - (diff - tolerance) * 200);
}

function scoreOver(actual: number, target: number, floorPct: number): number {
  if (target <= 0) return 50;
  const ratio = actual / target;
  if (ratio < floorPct) return Math.max(0, (ratio / floorPct) * 60);
  return Math.min(100, 60 + ((ratio - floorPct) / (1 - floorPct)) * 40);
}

function computeGrade(
  totals: DailyTotals | null,
  targets: NutritionTargets | null,
  training: boolean,
): 'green' | 'yellow' | 'red' | null {
  if (!targets || !totals || totals.log_count === 0) return null;
  const cal  = training ? targets.training_calories  : targets.rest_calories;
  const prot = training ? targets.training_protein_g : targets.rest_protein_g;
  const carb = training ? targets.training_carbs_g   : targets.rest_carbs_g;
  const fat  = training ? targets.training_fat_g     : targets.rest_fat_g;

  const calScore   = scoreNear(totals.calories,        cal,  0.10) * 0.25;
  const protScore  = scoreOver(totals.protein_g,       prot, 0.85) * 0.30;
  const carbScore  = scoreNear(totals.carbs_g,         carb, 0.15) * 0.15;
  const fatScore   = scoreNear(totals.fat_g,           fat,  0.15) * 0.15;
  const fiberScore = (totals.fiber_g >= targets.fiber_g_min
    ? 100
    : (totals.fiber_g / targets.fiber_g_min) * 100) * 0.10;
  const satScore   = (totals.saturated_fat_g <= targets.saturated_fat_g_max
    ? 100
    : Math.max(0, 100 - (totals.saturated_fat_g - targets.saturated_fat_g_max) * 5)) * 0.05;

  const score = calScore + protScore + carbScore + fatScore + fiberScore + satScore;
  return score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red';
}

// ---------- Context interface ----------

interface NutritionContextValue {
  loading: boolean;
  error: string | null;
  date: string;                       // YYYY-MM-DD
  entries: FoodLogEntry[];
  totals: DailyTotals | null;
  targets: NutritionTargets | null;
  mealPlan: { plan: MealPlan | null; meals: PlannedMeal[] };
  grade: 'green' | 'yellow' | 'red' | null;
  refresh: () => Promise<void>;
  logFood: (input: LogFoodInput) => Promise<FoodLogEntry>;
  deleteEntry: (id: string) => Promise<void>;
  updateEntry: (id: string, patch: Partial<Pick<FoodLogEntry, 'servings' | 'meal_slot' | 'notes'>>) => Promise<FoodLogEntry>;
  recentFoods: RecentFood[];
  weeklyGoals: WeeklyGoals;
  saveWeeklyGoals: (goals: WeeklyGoals) => Promise<void>;
  saveLocalTargets: (patch: Partial<NutritionTargets>) => Promise<void>;
}

const NutritionContext = createContext<NutritionContextValue>({
  loading: true,
  error: null,
  date: new Date().toISOString().slice(0, 10),
  entries: [],
  totals: null,
  targets: null,
  mealPlan: { plan: null, meals: [] },
  grade: null,
  refresh: async () => {},
  logFood: async () => { throw new Error('Not ready'); },
  deleteEntry: async () => {},
  updateEntry: async () => { throw new Error('Not ready'); },
  recentFoods: [],
  weeklyGoals: {},
  saveWeeklyGoals: async () => {},
  saveLocalTargets: async () => {},
});

export const useNutrition = () => useContext(NutritionContext);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NutritionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { profile } = useProfile();
  const userId = session?.user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(todayIso());
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [totals, setTotals] = useState<DailyTotals | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [mealPlan, setMealPlan] = useState<{ plan: MealPlan | null; meals: PlannedMeal[] }>({ plan: null, meals: [] });
  const [recentFoods, setRecentFoods] = useState<RecentFood[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoals>({});
  const [localTargets, setLocalTargets] = useState<Partial<NutritionTargets> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(WEEKLY_GOALS_KEY).then((raw) => {
      if (raw) {
        try { setWeeklyGoals(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
    AsyncStorage.getItem(LOCAL_TARGETS_KEY).then((raw) => {
      if (raw) {
        try { setLocalTargets(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
  }, []);

  const saveWeeklyGoals = useCallback(async (goals: WeeklyGoals) => {
    setWeeklyGoals(goals);
    await AsyncStorage.setItem(WEEKLY_GOALS_KEY, JSON.stringify(goals));
  }, []);

  const saveLocalTargets = useCallback(async (patch: Partial<NutritionTargets>) => {
    const merged = { ...localTargets, ...patch };
    setLocalTargets(merged);
    await AsyncStorage.setItem(LOCAL_TARGETS_KEY, JSON.stringify(merged));
  }, [localTargets]);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      if (isMounted.current) {
        setError(null);
        setEntries([]); setTotals(null); setTargets(null); setMealPlan({ plan: null, meals: [] }); setRecentFoods([]);
        setLoading(false);
      }
      return;
    }
    const currentDate = todayIso();
    if (isMounted.current) {
      setLoading(true);
      setError(null);
      setDate(currentDate);
    }
    try {
      const [dayRes, tgtRes, planRes, recentRes] = await Promise.allSettled([
        fetchFoodLogDay(currentDate),
        fetchNutritionTargets(),
        fetchMealPlan(),
        fetchRecentFoods(),
      ]);
      if (!isMounted.current) return;
      if (dayRes.status === 'fulfilled') {
        setEntries(dayRes.value.entries ?? []);
        setTotals(dayRes.value.totals ?? null);
      } else {
        setEntries([]);
        setTotals(null);
      }
      if (tgtRes.status === 'fulfilled') {
        // Local targets take priority; Supabase is fallback for users with existing data
        setTargets((localTargets as NutritionTargets | null) ?? tgtRes.value.targets);
      } else {
        setTargets((localTargets as NutritionTargets | null) ?? null);
      }
      if (planRes.status === 'fulfilled') {
        setMealPlan({ plan: planRes.value.plan, meals: planRes.value.meals });
      } else {
        setMealPlan({ plan: null, meals: [] });
      }
      if (recentRes.status === 'fulfilled') {
        setRecentFoods(recentRes.value.foods ?? []);
      } else {
        setRecentFoods([]);
      }

      const failures = [dayRes, tgtRes, planRes, recentRes].filter((res) => res.status === 'rejected');
      if (failures.length > 0) {
        setError(failures.length === 1
          ? 'Some nutrition data could not be refreshed. Pull to retry or try again in a moment.'
          : 'Nutrition data loaded partially. Pull to retry or try again in a moment.');
      }
    } catch (e) {
      console.warn('[NutritionContext] refresh error', e);
      if (isMounted.current) {
        setEntries([]);
        setTotals(null);
        setTargets((localTargets as NutritionTargets | null) ?? null);
        setMealPlan({ plan: null, meals: [] });
        setRecentFoods([]);
        setError('Nutrition data could not be loaded. Please try again.');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [userId, localTargets]);

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

  const updateEntry = useCallback(async (
    id: string,
    patch: Partial<Pick<FoodLogEntry, 'servings' | 'meal_slot' | 'notes'>>
  ): Promise<FoodLogEntry> => {
    const result = await updateFoodLogApi(id, patch);
    await refresh();
    return result.entry;
  }, [refresh]);

  const grade = useMemo(
    () => computeGrade(totals, targets, isTrainingDay(new Date().getDay(), profile?.training_days_per_week)),
    [totals, targets, profile?.training_days_per_week],
  );

  const value = useMemo<NutritionContextValue>(() => ({
    loading, error, date, entries, totals, targets, mealPlan, grade, refresh, logFood, deleteEntry, updateEntry, recentFoods, weeklyGoals, saveWeeklyGoals, saveLocalTargets,
  }), [loading, error, date, entries, totals, targets, mealPlan, grade, refresh, logFood, deleteEntry, updateEntry, recentFoods, weeklyGoals, saveWeeklyGoals, saveLocalTargets]);

  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
}
