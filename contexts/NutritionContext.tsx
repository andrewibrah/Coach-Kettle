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
  isRetryableNutritionError,
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
import { dayOfWeekFromIso, resolveApprovedClientTarget } from '@/lib/nutritionTargets';
import { watchNutritionDay } from '@/lib/nutritionDay';
import {
  targetStorageKey,
  parseJson,
  buildImportSaveRequest,
  buildWeeklyImportSaveRequest,
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
  targets: import('@/types/nutritionTargets').NutritionMacroTarget | null,
): 'green' | 'yellow' | 'red' | null {
  if (!targets || !totals || totals.log_count === 0) return null;
  const { calories: cal, protein_g: prot, carbs_g: carb, fat_g: fat } = targets;
  if (prot == null || carb == null || fat == null) return null;

  const calScore   = scoreNear(totals.calories,        cal,  0.10) * 0.25;
  const protScore  = scoreOver(totals.protein_g,       prot, 0.85) * 0.30;
  const carbScore  = scoreNear(totals.carbs_g,         carb, 0.15) * 0.15;
  const fatScore   = scoreNear(totals.fat_g,           fat,  0.15) * 0.15;
  const fiberScore = (totals.fiber_g >= 25
    ? 100
    : (totals.fiber_g / 25) * 100) * 0.10;
  const satScore   = (totals.saturated_fat_g <= 30
    ? 100
    : Math.max(0, 100 - (totals.saturated_fat_g - 30) * 5)) * 0.05;

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
  importWeeklyGoals: (confirmed: boolean) => Promise<void>;
  mealPlanStatus: LoadStatus;
  refreshMealPlan: (expectedId?: string) => Promise<void>;
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
  date: localTodayISO(),
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
  importWeeklyGoals: async () => {},
  mealPlanStatus: 'idle',
  refreshMealPlan: async () => {},
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

  const [mealPlanStatus, setMealPlanStatus] = useState<LoadStatus>('idle');

  // Hybrid target state buckets
  const [savedTargets, setSavedTargets] = useState<SavedNutritionTargetSet | null>(null);
  const [savedTargetsStatus, setSavedTargetsStatus] = useState<LoadStatus>('idle');
  const [draftTargets, setDraftTargets] = useState<DraftNutritionTargetSet | null>(null);
  const [suggestedTargets, setSuggestedTargets] = useState<NutritionTargetSuggestResponse | null>(null);
  const [suggestionStatus, setSuggestionStatus] = useState<LoadStatus>('idle');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [legacyImport, setLegacyImport] = useState<NutritionTargetSaveRequest | null>(null);

  const loadedDay = useRef(date);
  const refreshSequence = useRef(0);
  const planSequence = useRef(0);
  // Target intents invalidate only target reads, not food/plan refreshes.
  const targetRevision = useRef(0);
  // One lane per owner covers network commits AND their storage cleanup.
  // A rejected operation releases the lane but still rejects its own caller.
  const targetMutations = useRef(new Map<string, Promise<void>>());
  const enqueueTargetMutation = useCallback((owner: string, work: () => Promise<void>) => {
    const previous = targetMutations.current.get(owner) ?? Promise.resolve();
    const result = previous.then(work);
    const tail = result.then(() => {}, () => {});
    targetMutations.current.set(owner, tail);
    void tail.then(() => {
      if (targetMutations.current.get(owner) === tail) targetMutations.current.delete(owner);
    });
    return result;
  }, []);
  const activeUser = useRef(userId);
  useEffect(() => { activeUser.current = userId; }, [userId]);
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
    if (!isMounted.current || activeUser.current !== userId) return;
    setDraftTargets(draft);
    await AsyncStorage.setItem(draftKey(), JSON.stringify(draft));
  }, [userId, draftKey]);

  const clearDraft = useCallback(async () => {
    if (!isMounted.current || activeUser.current !== userId) return;
    setDraftTargets(null);
    await AsyncStorage.removeItem(draftKey());
  }, [userId, draftKey]);

  // ---------- Migration: detect ant2 local targets ----------
  const detectLegacyImport = useCallback(async (hasSavedSet: boolean) => {
    const revision = targetRevision.current;
    const isCurrent = () => isMounted.current && activeUser.current === userId
      && revision === targetRevision.current;
    if (hasSavedSet) { if (isCurrent()) setLegacyImport(null); return; }
    const dismissed = await AsyncStorage.getItem(LEGACY_IMPORT_DISMISSED_KEY);
    if (!isCurrent()) return;
    if (dismissed === userId) { setLegacyImport(null); return; }
    const legacy = parseJson<Partial<NutritionTargets>>(await AsyncStorage.getItem(LEGACY_LOCAL_TARGETS_KEY));
    const req = buildImportSaveRequest(legacy);
    if (isCurrent()) setLegacyImport(req);
  }, [userId]);

  // ---------- Core refresh ----------
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const planRequest = ++planSequence.current;
    let targetRequest = targetRevision.current;
    const targetReadBlocked = userId ? targetMutations.current.has(userId) : false;
    const currentDate = todayIso();
    const isCurrent = () => isMounted.current && sequence === refreshSequence.current
      && activeUser.current === userId && currentDate === todayIso();
    const isTargetCurrent = () => isCurrent() && !targetReadBlocked && targetRequest === targetRevision.current;
    if (!userId) {
      if (isCurrent()) {
        setError(null);
        setEntries([]); setTotals(null); setTargets(null); setMealPlan({ plan: null, meals: [] }); setRecentFoods([]);
        setSavedTargets(null); setSavedTargetsStatus('idle'); setSuggestedTargets(null); setLegacyImport(null);
        setLoading(false);
      }
      return;
    }
    if (isCurrent()) {
      setLoading(true);
      setError(null);
      if (loadedDay.current !== currentDate) {
        setEntries([]);
        setTotals(null);
        loadedDay.current = currentDate;
      }
      setDate(currentDate);
      if (!targetReadBlocked) setSavedTargetsStatus('loading');
      setMealPlanStatus('loading');
    }
    try {
      const [dayRes, legacyTgtRes, setRes, planRes, recentRes] = await Promise.allSettled([
        fetchFoodLogDay(currentDate),
        fetchNutritionTargets(),
        fetchNutritionTargetSet(),
        fetchMealPlan(),
        fetchRecentFoods(),
      ]);
      if (!isCurrent()) return;

      if (dayRes.status === 'fulfilled') {
        setEntries(dayRes.value.entries ?? []);
        setTotals(dayRes.value.totals ?? null);
      } else {
        setEntries([]);
        setTotals(null);
      }

      // Keep target cancellation local: an accepted save must not discard
      // unrelated food, recent-food, or meal-plan results from this refresh.
      let resolvedSet: SavedNutritionTargetSet | null = null;
      await (async () => {
        if (!isTargetCurrent()) return;
        if (setRes.status === 'fulfilled') {
          resolvedSet = setRes.value.target_set ?? null;

          // Flush any queued offline save now that the server is reachable.
          const pk = pendingKey();
          if (pk) {
            const pending = parseJson<NutritionTargetSaveRequest>(await AsyncStorage.getItem(pk));
            if (!isTargetCurrent()) return;
            if (pending) {
              await enqueueTargetMutation(userId, async () => {
                // Recheck at dispatch: a queued snapshot is not a new intent.
                if (!isTargetCurrent()) return;
                setSyncStatus('pending');
                try {
                  const flushed = await saveNutritionTargetSet(pending);
                  if (!isTargetCurrent()) return;
                  targetRequest = ++targetRevision.current;
                  resolvedSet = flushed.targets;
                  await AsyncStorage.removeItem(pk);
                  if (isTargetCurrent()) setSyncStatus('synced');
                } catch (e) {
                  if (!isTargetCurrent()) return;
                  const retry = isRetryableNutritionError(e);
                  if (!retry) await AsyncStorage.removeItem(pk);
                  if (isTargetCurrent()) setSyncStatus(retry ? 'pending' : 'failed');
                }
              });
            }
          }

          if (!isTargetCurrent()) return;
          setSavedTargetsStatus('ready');
          const ck = cacheKey();
          if (ck) {
            if (resolvedSet) await AsyncStorage.setItem(ck, JSON.stringify(resolvedSet));
            else await AsyncStorage.removeItem(ck);
          }
        } else {
          // Offline hydration is also a read: never replace a newer save.
          const ck = cacheKey();
          resolvedSet = ck ? parseJson<SavedNutritionTargetSet>(await AsyncStorage.getItem(ck)) : null;
          if (!isTargetCurrent()) return;
          setSavedTargetsStatus(resolvedSet ? 'ready' : 'error');
        }
        if (isTargetCurrent()) setSavedTargets(resolvedSet);
      })();
      if (!isCurrent()) return;

      // Legacy big-row targets for dashboard/grading: prefer hybrid set bridge.
      const legacyRow = legacyTgtRes.status === 'fulfilled' ? legacyTgtRes.value.targets : null;
      setTargets(legacyRow);

      if (planRequest === planSequence.current) {
        if (planRes.status === 'fulfilled') {
          setMealPlan({ plan: planRes.value.plan, meals: planRes.value.meals });
          setMealPlanStatus('ready');
        } else {
          setMealPlanStatus('error');
        }
      }
      if (recentRes.status === 'fulfilled') {
        setRecentFoods(recentRes.value.foods ?? []);
      } else {
        setRecentFoods([]);
      }

      if (isTargetCurrent()) await detectLegacyImport(Boolean(resolvedSet));

      if (!isCurrent()) return;
      const failures = [dayRes, setRes, planRes, recentRes].filter((res) => res.status === 'rejected');
      if (failures.length > 0) {
        setError(failures.length === 1
          ? 'Some nutrition data could not be refreshed. Pull to retry or try again in a moment.'
          : 'Nutrition data loaded partially. Pull to retry or try again in a moment.');
      }
    } catch (e) {
      console.warn('[NutritionContext] refresh error', e);
      if (isCurrent()) {
        setEntries([]);
        setTotals(null);
        setTargets(null);
        if (isTargetCurrent()) {
          setSavedTargets(null);
          setSavedTargetsStatus('error');
        }
        setMealPlanStatus('error');
        setRecentFoods([]);
        setError('Nutrition data could not be loaded. Please try again.');
      }
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [userId, cacheKey, pendingKey, detectLegacyImport, enqueueTargetMutation]);

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
    setTargets(null); setSavedTargets(null); setDraftTargets(null);
    setMealPlan({ plan: null, meals: [] }); setMealPlanStatus('idle');
    setSuggestedTargets(null);
    setSuggestionStatus('idle');
    setSyncStatus('synced');
  }, [userId]);

  // Initial load + on auth change
  useEffect(() => { refresh(); }, [refresh]);

  // Live-today provider: catch active midnight as well as foreground changes.
  useEffect(() => watchNutritionDay({
    readToday: todayIso,
    onChange: () => { void refresh(); },
    subscribeActive: (check) => {
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') check();
      });
      return () => sub.remove();
    },
  }), [refresh]);

  // ---------- Target actions ----------
  const requestSuggestion = useCallback(async (req: NutritionTargetSuggestRequest) => {
    setSuggestionStatus('loading');
    try {
      const res = await suggestNutritionTargets(req);
      if (isMounted.current && activeUser.current === userId) { setSuggestedTargets(res); setSuggestionStatus('ready'); }
      return res;
    } catch (e) {
      if (isMounted.current && activeUser.current === userId) setSuggestionStatus('error');
      throw e;
    }
  }, [userId]);

  const clearSuggestion = useCallback(() => {
    setSuggestedTargets(null);
    setSuggestionStatus('idle');
  }, []);

  const commitTargets = useCallback(async (request: NutritionTargetSaveRequest | (() => Promise<NutritionTargetSaveRequest>)) => {
    if (!userId) throw new Error('You must be signed in to save targets.');
    const isOwner = () => isMounted.current && activeUser.current === userId;
    if (!isOwner()) throw new Error('Account changed; local goals retained.');
    const revision = ++targetRevision.current;
    const isCurrent = () => isOwner() && revision === targetRevision.current;
    setSyncStatus('pending');
    return enqueueTargetMutation(userId, async () => {
      if (!isOwner()) throw new Error('Account changed; local goals retained.');
      let req: NutritionTargetSaveRequest | undefined;
      try {
        req = typeof request === 'function' ? await request() : request;
        if (!isOwner()) throw new Error('Account changed; local goals retained.');
        const res = await saveNutritionTargetSet(req);
        if (!isOwner()) throw new Error('Account changed; local goals retained.');
        if (!isCurrent()) return; // Actual success, superseded locally by a newer intent.
        const saved = res.targets;
        if (isMounted.current) {
          setSavedTargets(saved);
          setSavedTargetsStatus('ready');
          setSyncStatus('synced');
          setSuggestedTargets(null);
          setSuggestionStatus('idle');
          setLegacyImport(null);
        }
        const ck = cacheKey();
        if (ck) await AsyncStorage.setItem(ck, JSON.stringify(saved));
        // These callbacks capture this save's owner namespace. Storage cleanup may
        // finish after a switch, but must never call shared-state clearDraft then.
        const pk = pendingKey();
        if (pk) await AsyncStorage.removeItem(pk);
        await AsyncStorage.removeItem(draftKey());
        if (!isOwner()) throw new Error('Account changed; local goals retained.');
        if (isCurrent()) setDraftTargets(null);
      } catch (e) {
        if (!isCurrent()) throw e;
        // Preparation can fail before an import has a request to retry. Do not
        // leave an older offline intent behind for a later refresh to commit.
        const retry = req !== undefined && isRetryableNutritionError(e);
        const pk = pendingKey();
        if (pk && retry) await AsyncStorage.setItem(pk, JSON.stringify(req));
        if (pk && !retry) await AsyncStorage.removeItem(pk);
        if (isCurrent()) setSyncStatus(retry ? 'pending' : 'failed');
        throw e;
      }
    });
  }, [userId, cacheKey, pendingKey, draftKey, enqueueTargetMutation]);

  const saveTargets = useCallback((req: NutritionTargetSaveRequest) => commitTargets(req), [commitTargets]);

  const importLegacyTargets = useCallback(async () => {
    if (!legacyImport) return;
    await saveTargets(legacyImport);
    if (!isMounted.current || activeUser.current !== userId) return;
    // On success, remove the old un-namespaced local key.
    await AsyncStorage.removeItem(LEGACY_LOCAL_TARGETS_KEY);
    if (isMounted.current && activeUser.current === userId) setLegacyImport(null);
  }, [userId, legacyImport, saveTargets]);

  const dismissLegacyImport = useCallback(async () => {
    if (!isMounted.current || activeUser.current !== userId) return;
    if (userId) await AsyncStorage.setItem(LEGACY_IMPORT_DISMISSED_KEY, userId);
    if (isMounted.current && activeUser.current === userId) setLegacyImport(null);
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
    dayOfWeekFromIso(date),
    profile?.training_days_per_week,
    profile?.training_days,
  );

  const todayTarget = useMemo<ResolvedNutritionTarget>(
    () => resolveApprovedClientTarget({
      date,
      savedTargets,
      isTrainingDay: trainingToday,
      suggestedTargets,
      draftTargets,
      weeklyGoals,
      legacyTargets: targets,
    }),
    [date, savedTargets, trainingToday, suggestedTargets, draftTargets, weeklyGoals, targets],
  );

  const grade = useMemo(() => computeGrade(totals, todayTarget.target), [totals, todayTarget]);
  const importWeeklyGoals = useCallback(async (confirmed: boolean) => {
    if (!confirmed) throw new Error('Confirm importing device goals first.');
    // Reserve intent order before fetching the merge base, within the same lane.
    await commitTargets(async () => {
      const current = await fetchNutritionTargetSet();
      if (!isMounted.current || activeUser.current !== userId) throw new Error('Account changed; local goals retained.');
      return buildWeeklyImportSaveRequest(weeklyGoals, current.target_set ?? null, true);
    });
    // Retain device data, including edits made during upload.
  }, [userId, weeklyGoals, commitTargets]);
  const refreshMealPlan = useCallback(async (expectedId?: string) => {
    const sequence = ++planSequence.current;
    setMealPlanStatus('loading');
    try {
      const result = await fetchMealPlan();
      if (activeUser.current !== userId || !isMounted.current) throw new Error('Account changed.');
      if (sequence !== planSequence.current) {
        if (expectedId) throw new Error('Plan refresh superseded. Retry loading the plan.');
        return;
      }
      if (expectedId && (result.plan?.id !== expectedId || result.plan.status !== 'active' || !result.meals.length)) throw new Error('Plan readback is not ready. Retry loading the plan.');
      setMealPlan(result); setMealPlanStatus('ready');
    } catch (e) {
      if (activeUser.current === userId && isMounted.current && sequence === planSequence.current) setMealPlanStatus('error');
      throw e;
    }
  }, [userId]);

  const value = useMemo<NutritionContextValue>(() => ({
    importWeeklyGoals, mealPlanStatus, refreshMealPlan,
    loading, error, date, entries, totals, targets, mealPlan, grade, refresh, logFood, deleteEntry, updateEntry, recentFoods, weeklyGoals, saveWeeklyGoals,
    savedTargets, savedTargetsStatus, draftTargets, suggestedTargets, suggestionStatus, syncStatus, todayTarget, legacyImport,
    requestSuggestion, clearSuggestion, saveTargets, saveDraft, clearDraft, importLegacyTargets, dismissLegacyImport,
  }), [
    importWeeklyGoals, mealPlanStatus, refreshMealPlan,
    loading, error, date, entries, totals, targets, mealPlan, grade, refresh, logFood, deleteEntry, updateEntry, recentFoods, weeklyGoals, saveWeeklyGoals,
    savedTargets, savedTargetsStatus, draftTargets, suggestedTargets, suggestionStatus, syncStatus, todayTarget, legacyImport,
    requestSuggestion, clearSuggestion, saveTargets, saveDraft, clearDraft, importLegacyTargets, dismissLegacyImport,
  ]);

  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
}
