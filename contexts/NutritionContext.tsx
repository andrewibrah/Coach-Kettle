// NutritionContext — today's food log, totals, targets, and active meal plan.
//
// Target architecture (hybrid):
//   - Supabase `nutrition_target_sets` is the durable source of truth for
//     accepted, provenance-tracked targets.
//   - AsyncStorage holds ONLY: an offline cache (namespaced per user), an
//     unsaved draft, and a pending-save queue. It never silently overrides the
//     server and never leaks across accounts.
//   - The dashboard target is resolved deterministically from the saved set,
//     with a backend suggestion / draft as clearly-labeled fallbacks.
//
// Refresh model: pull on mount + when day changes + after every mutation.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/contexts/AuthProvider';
import { useProfile } from '@/contexts/ProfileContext';
import {
  fetchFoodLogDay,
  fetchNutritionTargets,
  fetchNutritionTargetSet,
  suggestNutritionTargets,
  saveNutritionTargetSet,
  fetchMealPlan,
  fetchRecentFoods,
  logFood as logFoodApi,
  deleteFoodLog as deleteFoodLogApi,
  updateFoodLog as updateFoodLogApi,
  type LogFoodInput,
} from '@/lib/nutrition';
import { isTrainingDay } from '@/lib/trainingSchedule';
import { todayISO as localTodayISO } from '@/lib/workoutRules';
import { resolveTodayNutritionTarget } from '@/lib/nutritionTargets';
import {
  targetStorageKey,
  parseJson,
  buildImportSaveRequest,
  savedSetToLegacyTargets,
  LEGACY_LOCAL_TARGETS_KEY,
} from '@/lib/nutritionTargetStorage';
import type { FoodLogEntry, DailyTotals, NutritionTargets, MealPlan, PlannedMeal, RecentFood, WeeklyGoals } from '@/types/nutrition';
import type {
  SavedNutritionTargetSet,
  DraftNutritionTargetSet,
  NutritionTargetSuggestRequest,
  NutritionTargetSuggestResponse,
  NutritionTargetSaveRequest,
  ResolvedNutritionTarget,
} from '@/types/nutritionTargets';

const LEGACY_IMPORT_DISMISSED_KEY = 'coach-kettle:nutrition-targets:import-dismissed:v1';

// Weekly goals are namespaced per user so they never leak across accounts
// (they take priority over resolved targets on the dashboard).
function weeklyGoalsKey(userId: string | null): string {
  return `coach-kettle:nutrition-weekly-goals:${userId ?? 'anonymous'}`;
}

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

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
type SyncStatus = 'synced' | 'pending' | 'failed';

interface NutritionContextValue {
  loading: boolean;
  error: string | null;
  date: string;                       // YYYY-MM-DD
  entries: FoodLogEntry[];
  totals: DailyTotals | null;
  targets: NutritionTargets | null;   // legacy big-row shape (bridged) for dashboard + grading
  mealPlan: { plan: MealPlan | null; meals: PlannedMeal[] };
  grade: 'green' | 'yellow' | 'red' | null;
  refresh: () => Promise<void>;
  logFood: (input: LogFoodInput) => Promise<FoodLogEntry>;
  deleteEntry: (id: string) => Promise<void>;
  updateEntry: (id: string, patch: Partial<Pick<FoodLogEntry, 'servings' | 'meal_slot' | 'notes'>>) => Promise<FoodLogEntry>;
  recentFoods: RecentFood[];
  weeklyGoals: WeeklyGoals;
  saveWeeklyGoals: (goals: WeeklyGoals) => Promise<void>;

  // Hybrid target system
  savedTargets: SavedNutritionTargetSet | null;
  savedTargetsStatus: LoadStatus;
  draftTargets: DraftNutritionTargetSet | null;
  suggestedTargets: NutritionTargetSuggestResponse | null;
  suggestionStatus: LoadStatus;
  syncStatus: SyncStatus;
  todayTarget: ResolvedNutritionTarget;
  legacyImport: NutritionTargetSaveRequest | null;   // detected ant2 local targets, awaiting decision
  requestSuggestion: (req: NutritionTargetSuggestRequest) => Promise<NutritionTargetSuggestResponse>;
  clearSuggestion: () => void;
  saveTargets: (req: NutritionTargetSaveRequest) => Promise<void>;
  saveDraft: (draft: DraftNutritionTargetSet) => Promise<void>;
  clearDraft: () => Promise<void>;
  importLegacyTargets: () => Promise<void>;
  dismissLegacyImport: () => Promise<void>;
}

const EMPTY_RESOLVED: ResolvedNutritionTarget = {
  target: null, source: null, stale: false, fallback: false,
  explanation: 'No target set yet. Set your calories or get a suggestion to begin.',
};

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
  savedTargets: null,
  savedTargetsStatus: 'idle',
  draftTargets: null,
  suggestedTargets: null,
  suggestionStatus: 'idle',
  syncStatus: 'synced',
  todayTarget: EMPTY_RESOLVED,
  legacyImport: null,
  requestSuggestion: async () => { throw new Error('Not ready'); },
  clearSuggestion: () => {},
  saveTargets: async () => {},
  saveDraft: async () => {},
  clearDraft: async () => {},
  importLegacyTargets: async () => {},
  dismissLegacyImport: async () => {},
});

export const useNutrition = () => useContext(NutritionContext);

function todayIso(): string {
  // Local calendar day (shared semantics with workout dates).
  return localTodayISO();
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

  // Hybrid target state buckets
  const [savedTargets, setSavedTargets] = useState<SavedNutritionTargetSet | null>(null);
  const [savedTargetsStatus, setSavedTargetsStatus] = useState<LoadStatus>('idle');
  const [draftTargets, setDraftTargets] = useState<DraftNutritionTargetSet | null>(null);
  const [suggestedTargets, setSuggestedTargets] = useState<NutritionTargetSuggestResponse | null>(null);
  const [suggestionStatus, setSuggestionStatus] = useState<LoadStatus>('idle');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [legacyImport, setLegacyImport] = useState<NutritionTargetSaveRequest | null>(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Weekly goals load — reset then load for the current user namespace.
  useEffect(() => {
    let active = true;
    setWeeklyGoals({});
    AsyncStorage.getItem(weeklyGoalsKey(userId)).then((raw) => {
      const g = parseJson<WeeklyGoals>(raw);
      if (active && g) setWeeklyGoals(g);
    });
    return () => { active = false; };
  }, [userId]);

  const saveWeeklyGoals = useCallback(async (goals: WeeklyGoals) => {
    setWeeklyGoals(goals);
    await AsyncStorage.setItem(weeklyGoalsKey(userId), JSON.stringify(goals));
  }, [userId]);

  // ---------- Local draft (user-namespaced; anonymous before auth) ----------
  const draftKey = useCallback(() => targetStorageKey(userId, 'draft'), [userId]);
  const cacheKey = useCallback(() => (userId ? targetStorageKey(userId, 'cache') : null), [userId]);
  const pendingKey = useCallback(() => (userId ? targetStorageKey(userId, 'pending-save') : null), [userId]);

  const saveDraft = useCallback(async (draft: DraftNutritionTargetSet) => {
    setDraftTargets(draft);
    await AsyncStorage.setItem(draftKey(), JSON.stringify(draft));
  }, [draftKey]);

  const clearDraft = useCallback(async () => {
    setDraftTargets(null);
    await AsyncStorage.removeItem(draftKey());
  }, [draftKey]);

  // ---------- Migration: detect ant2 local targets ----------
  const detectLegacyImport = useCallback(async (hasSavedSet: boolean) => {
    if (hasSavedSet) { setLegacyImport(null); return; }
    const dismissed = await AsyncStorage.getItem(LEGACY_IMPORT_DISMISSED_KEY);
    if (dismissed === userId) { setLegacyImport(null); return; }
    const legacy = parseJson<Partial<NutritionTargets>>(await AsyncStorage.getItem(LEGACY_LOCAL_TARGETS_KEY));
    const req = buildImportSaveRequest(legacy);
    if (isMounted.current) setLegacyImport(req);
  }, [userId]);

  // ---------- Core refresh ----------
  const refresh = useCallback(async () => {
    if (!userId) {
      if (isMounted.current) {
        setError(null);
        setEntries([]); setTotals(null); setTargets(null); setMealPlan({ plan: null, meals: [] }); setRecentFoods([]);
        setSavedTargets(null); setSavedTargetsStatus('idle'); setSuggestedTargets(null); setLegacyImport(null);
        setLoading(false);
      }
      return;
    }
    const currentDate = todayIso();
    if (isMounted.current) {
      setLoading(true);
      setError(null);
      setDate(currentDate);
      setSavedTargetsStatus('loading');
    }
    try {
      const [dayRes, legacyTgtRes, setRes, planRes, recentRes] = await Promise.allSettled([
        fetchFoodLogDay(currentDate),
        fetchNutritionTargets(),
        fetchNutritionTargetSet(),
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

      // Resolve saved target set (Supabase source of truth) with offline cache fallback.
      let resolvedSet: SavedNutritionTargetSet | null = null;
      if (setRes.status === 'fulfilled') {
        resolvedSet = setRes.value.target_set ?? null;

        // Flush any queued offline save now that the server is reachable.
        const pk = pendingKey();
        if (pk) {
          const pending = parseJson<NutritionTargetSaveRequest>(await AsyncStorage.getItem(pk));
          if (pending) {
            try {
              const flushed = await saveNutritionTargetSet(pending);
              resolvedSet = flushed.targets;
              await AsyncStorage.removeItem(pk);
              if (isMounted.current) setSyncStatus('synced');
            } catch {
              if (isMounted.current) setSyncStatus('pending');
            }
          }
        }

        setSavedTargetsStatus('ready');
        const ck = cacheKey();
        if (ck) {
          if (resolvedSet) await AsyncStorage.setItem(ck, JSON.stringify(resolvedSet));
          else await AsyncStorage.removeItem(ck);
        }
      } else {
        // Offline: load last-known cache for THIS user only.
        const ck = cacheKey();
        resolvedSet = ck ? parseJson<SavedNutritionTargetSet>(await AsyncStorage.getItem(ck)) : null;
        setSavedTargetsStatus(resolvedSet ? 'ready' : 'error');
      }
      setSavedTargets(resolvedSet);

      // Legacy big-row targets for dashboard/grading: prefer hybrid set bridge.
      const legacyRow = legacyTgtRes.status === 'fulfilled' ? legacyTgtRes.value.targets : null;
      setTargets(resolvedSet ? savedSetToLegacyTargets(resolvedSet) : legacyRow);

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

      await detectLegacyImport(Boolean(resolvedSet));

      const failures = [dayRes, setRes, planRes, recentRes].filter((res) => res.status === 'rejected');
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
        setTargets(null);
        setSavedTargets(null);
        setSavedTargetsStatus('error');
        setMealPlan({ plan: null, meals: [] });
        setRecentFoods([]);
        setError('Nutrition data could not be loaded. Please try again.');
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [userId, cacheKey, pendingKey, detectLegacyImport]);

  // Load draft for the current namespace whenever the user changes.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(targetStorageKey(userId, 'draft')).then((raw) => {
      const d = parseJson<DraftNutritionTargetSet>(raw);
      if (active) setDraftTargets(d);
    });
    return () => { active = false; };
  }, [userId]);

  // Clear active suggestion state on user switch/logout (no cross-account leakage).
  useEffect(() => {
    setSuggestedTargets(null);
    setSuggestionStatus('idle');
    setSyncStatus('synced');
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

  // ---------- Target actions ----------
  const requestSuggestion = useCallback(async (req: NutritionTargetSuggestRequest) => {
    setSuggestionStatus('loading');
    try {
      const res = await suggestNutritionTargets(req);
      if (isMounted.current) { setSuggestedTargets(res); setSuggestionStatus('ready'); }
      return res;
    } catch (e) {
      if (isMounted.current) setSuggestionStatus('error');
      throw e;
    }
  }, []);

  const clearSuggestion = useCallback(() => {
    setSuggestedTargets(null);
    setSuggestionStatus('idle');
  }, []);

  const saveTargets = useCallback(async (req: NutritionTargetSaveRequest) => {
    if (!userId) throw new Error('You must be signed in to save targets.');
    try {
      const res = await saveNutritionTargetSet(req);
      const saved = res.targets;
      if (isMounted.current) {
        setSavedTargets(saved);
        setSavedTargetsStatus('ready');
        setTargets(savedSetToLegacyTargets(saved));
        setSyncStatus('synced');
        setSuggestedTargets(null);
        setSuggestionStatus('idle');
        setLegacyImport(null);
      }
      const ck = cacheKey();
      if (ck) await AsyncStorage.setItem(ck, JSON.stringify(saved));
      const pk = pendingKey();
      if (pk) await AsyncStorage.removeItem(pk);
      await clearDraft();
    } catch (e) {
      // Offline / failure: queue a pending save so it isn't lost.
      const pk = pendingKey();
      if (pk) await AsyncStorage.setItem(pk, JSON.stringify(req));
      if (isMounted.current) setSyncStatus('pending');
      throw e;
    }
  }, [userId, cacheKey, pendingKey, clearDraft]);

  const importLegacyTargets = useCallback(async () => {
    if (!legacyImport) return;
    await saveTargets(legacyImport);
    // On success, remove the old un-namespaced local key.
    await AsyncStorage.removeItem(LEGACY_LOCAL_TARGETS_KEY);
    if (isMounted.current) setLegacyImport(null);
  }, [legacyImport, saveTargets]);

  const dismissLegacyImport = useCallback(async () => {
    if (userId) await AsyncStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, userId);
    if (isMounted.current) setLegacyImport(null);
  }, [userId]);

  // ---------- Mutations ----------
  const logFood = useCallback(async (input: LogFoodInput) => {
    const result = await logFoodApi(input);
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

  const trainingToday = isTrainingDay(
    new Date().getDay(),
    profile?.training_days_per_week,
    profile?.training_days,
  );

  const grade = useMemo(
    () => computeGrade(totals, targets, trainingToday),
    [totals, targets, trainingToday],
  );

  const todayTarget = useMemo<ResolvedNutritionTarget>(
    () => resolveTodayNutritionTarget({
      date,
      savedTargets,
      isTrainingDay: trainingToday,
      suggestedTargets,
      draftTargets,
    }),
    [date, savedTargets, trainingToday, suggestedTargets, draftTargets],
  );

  const value = useMemo<NutritionContextValue>(() => ({
    loading, error, date, entries, totals, targets, mealPlan, grade, refresh, logFood, deleteEntry, updateEntry, recentFoods, weeklyGoals, saveWeeklyGoals,
    savedTargets, savedTargetsStatus, draftTargets, suggestedTargets, suggestionStatus, syncStatus, todayTarget, legacyImport,
    requestSuggestion, clearSuggestion, saveTargets, saveDraft, clearDraft, importLegacyTargets, dismissLegacyImport,
  }), [
    loading, error, date, entries, totals, targets, mealPlan, grade, refresh, logFood, deleteEntry, updateEntry, recentFoods, weeklyGoals, saveWeeklyGoals,
    savedTargets, savedTargetsStatus, draftTargets, suggestedTargets, suggestionStatus, syncStatus, todayTarget, legacyImport,
    requestSuggestion, clearSuggestion, saveTargets, saveDraft, clearDraft, importLegacyTargets, dismissLegacyImport,
  ]);

  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
}
