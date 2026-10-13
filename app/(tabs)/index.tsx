import { useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";

import * as Haptics from "expo-haptics";
import { Tabs, useRouter } from "expo-router";
import { Directions, FlatList, Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { useAuth } from "@/contexts/AuthProvider";
import { usePRCelebration } from "@/contexts/PRCelebrationContext";
import { supabase } from "@/lib/supabase";

import { CoachModal } from "@/components/modals/CoachModal";
import { EditSetModal } from "@/components/modals/EditSetModal";
import { MenuModal } from "@/components/modals/MenuModal";
import { RoutineModal } from "@/components/modals/RoutineModal";
import { SessionReviewModal } from "@/components/modals/SessionReviewModal";
import { WorkoutNameModal } from "@/components/modals/WorkoutNameModal";
import { AiResponseBubble } from "@/components/ui/AiResponseBubble";
import { Header } from "@/components/ui/Header";
import { BottomTabBarHeightContext } from "expo-router/js-tabs";
import { WorkoutBottomBar } from "@/components/workout/WorkoutBottomBar";
import { WorkoutTable } from "@/components/workout/WorkoutTable";
import { useSharedRestTimer } from "@/contexts/RestTimerContext";
import { useNotifications } from "@/contexts/NotificationsProvider";
import { decideRestTimerAction, isCompoundExercise, suggestRestSeconds } from "@/lib/restTimer";
import { StartRestPrompt, type RestPromptInfo } from "@/components/workout/StartRestPrompt";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { api, type ApiWorkoutRow, type LogSetPR } from "@/lib/api";
import { FeatureGateError } from "@/lib/entitlements";
import { showAiLimitAlert } from "@/lib/upgradePrompt";
import { saveCoachChatQA, saveWorkoutChatQA } from "@/lib/chatStorage";
import { type WorkoutTemplate, type WorkoutTemplateItem } from "@/lib/profile";
import { firePRCelebration } from "@/lib/notifications";
import { decideAndParse, type ParsedRow } from "@/lib/structuredGate";
import { expandTemplateToRows, getLastExerciseFromRows, makeId, makeRestRow, nextSetNumberForExercise, normalizeExercise, resequenceSets } from "@/lib/workoutRules";
import { saveWorkout as saveWorkoutLocalFirst, type SessionReview } from "@/lib/workoutStorage";
import { type LogRow } from "@/types/workout";
import { clearWorkoutDraft, getWorkoutDraft, getWorkoutDraftGeneration, saveWorkoutDraft } from "@/lib/workoutDraft";
import { TutorialModal } from "@/components/tutorial/TutorialModal";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { isTutorialShown } from "@/lib/tutorialState";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { useCoaching } from "@/contexts/CoachingContext";
import { useNutrition } from "@/contexts/NutritionContext";
import { useProgram } from "@/contexts/ProgramContext";
import { useProfile } from "@/contexts/ProfileContext";
import { resolveTrainingDays } from "@/lib/trainingSchedule";
import { resolveProgramDayStatus, resolveScheduledDayIndex, resolveHomeStartDecision, resolveProgramDayItems } from "@/lib/programSchedule";
import { formatProgramDayLabel } from "@/lib/programFormat";


import { createSessionOwnership, settleOptionalReview, type EndOwnership, type SavePhase } from '@/lib/sessionOwnership';
import { performedRows, isPendingSet, isPerformedRow, resolveEditedPerformance } from '@/lib/performedSets';
import { serializeWorkoutRows } from '@/lib/workoutSerialization';
import { numericText, validateWorkoutRow } from '@/lib/workoutValidation';
import { createSubmitGuard } from '@/lib/submitGuard';
import { sessionOperations } from '@/lib/sessionOperationDelivery';

type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

// ── Pure module-level helpers (no component state dependencies) ───────────────
function buildRowsFromApi(apiRows: ApiWorkoutRow[]): LogRow[] {
  if (!Array.isArray(apiRows) || apiRows.some(row => validateWorkoutRow(row))) throw new Error('Invalid parsed set values.');
  const builtRows = apiRows
    .filter((row) => row.exercise && row.exercise.trim())
    .map((row) => ({
      ...(row.performance === undefined ? {} : { performance: row.performance }),
      ...(row.setKind === undefined ? {} : { setKind: row.setKind }),
      ...(row.plannedTarget === undefined ? {} : { plannedTarget: { ...row.plannedTarget } }),
      ...(row.isCardio === undefined ? {} : { isCardio: row.isCardio }),
      ...(row.durationMins === undefined ? {} : { durationMins: row.durationMins }),
      ...(row.distance === undefined ? {} : { distance: row.distance }),
      ...(row.distanceUnit === undefined ? {} : { distanceUnit: row.distanceUnit }),
      ...(row.heartRate === undefined ? {} : { heartRate: row.heartRate }),
      ...(row.calories === undefined ? {} : { calories: row.calories }),
      ...(row.level === undefined ? {} : { level: row.level }),
      id: row.id || `${Date.now()}-${Math.random()}`,
      exercise: row.exercise.trim(),
      set: Number.isFinite(row.set) ? row.set : 1,
      weightLbs: row.isCardio ? String(row.weightLbs ?? '').trim() : numericText(row.weightLbs),
      reps: row.isCardio ? String(row.reps ?? '').trim() : numericText(row.reps),
      notes: String(row.notes ?? "").trim(),
      timestamp: Number.isFinite(row.timestamp) ? row.timestamp! : Date.now(),
      status: "committed" as const,
    }));
  // A parse response may contain only a load. Keep it visible/editable, but
  // never promote absent reps (or a prescribed target) into performance.
  return builtRows.map(row => ({
    ...row,
    performance: isPerformedRow(row) ? "performed" : "planned",
  }));
}

const toApiRows = (sourceRows: LogRow[]): ApiWorkoutRow[] =>
  serializeWorkoutRows(sourceRows);

export default function HomeScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const sessionProvenanceRef = useRef<{ ownerId: string; generation: number } | null>(null);
  const recoveryOwnerRef = useRef<{ ownerId: string; generation: number } | null>(null);
  const canUseSession = useCallback(() => !!session?.user?.id && sessionProvenanceRef.current?.ownerId === session.user.id &&
    sessionProvenanceRef.current.generation === getWorkoutDraftGeneration(), [session?.user?.id]);
  const canStartSession = useCallback(() => !!session?.user?.id && recoveryOwnerRef.current?.ownerId === session.user.id &&
    recoveryOwnerRef.current.generation === getWorkoutDraftGeneration(), [session?.user?.id]);
  // The owner's own End cleanup advances the draft generation. Callers re-stamp
  // only after verifying no auth fence intervened, so only auth revokes access.
  const restampOwner = (ownerId: string | undefined, generation: number, sessionContinues: boolean) => {
    if (!ownerId) return;
    recoveryOwnerRef.current = { ownerId, generation };
    sessionProvenanceRef.current = sessionContinues ? { ownerId, generation } : null;
  };


  const { width } = useWindowDimensions();
  const compact = width < 380;
  // Height of the bottom tab bar this screen sits above (undefined outside a tab
  // navigator). Used as the keyboard-avoidance offset.
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const backgroundColor = useThemeColor({}, 'background');
  const successColor = useThemeColor({}, 'success');
  const onTint = useThemeColor({}, 'tintForeground');

  const scrollRef = useRef<FlatList<LogRow> | null>(null);

  // ── Post-render scroll system ──────────────────────────────────────────────
  // Queue a scroll target BEFORE setRows, execute it AFTER React commits the
  // new rows via useEffect. This guarantees FlatList knows about new items.
  const pendingScrollRef = useRef<'bottom' | number | null>(null);

  const scrollToBottom = useCallback(() => {
    pendingScrollRef.current = 'bottom';
  }, []);

  const scrollToRowIndex = useCallback((index: number, _rowCount?: number) => {
    pendingScrollRef.current = index;
  }, []);

  const [rows, setRowsState] = useState<LogRow[]>([]);
  const draftRowsRef = useRef(rows);
  draftRowsRef.current = rows;
  // Synchronous row identity for End and request fences before React rerenders.
  const setRows = useCallback((value: LogRow[] | ((prev: LogRow[]) => LogRow[])) => {
    const next = typeof value === 'function' ? value(draftRowsRef.current) : value;
    draftRowsRef.current = next;
    setRowsState(next);
  }, []);

  // Execute queued scrolls AFTER React commits the new rows to the FlatList.
  useEffect(() => {
    const target = pendingScrollRef.current;
    if (target === null) return;
    pendingScrollRef.current = null;
    // Double-rAF: first frame lets React commit, second frame lets FlatList lay out
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (target === 'bottom') {
          scrollRef.current?.scrollToEnd({ animated: true });
        } else {
          const clampedIndex = Math.max(0, Math.min(target, rows.length - 1));
          try {
            scrollRef.current?.scrollToIndex({
              index: clampedIndex,
              animated: true,
              viewPosition: 0.6,
            });
          } catch {
            scrollRef.current?.scrollToEnd({ animated: true });
          }
        }
      });
    });
  }, [rows]);  

  const [editingCell, setEditingCell] = useState<{ rowId: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [messageInput, setMessageInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [aiBubbleText, setAiBubbleText] = useState<string | null>(null);

  const [coachOpen, setCoachOpen] = useState(false);
  const [coachQuestion, setCoachQuestion] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachAnswer, setCoachAnswer] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [editSetModalVisible, setEditSetModalVisible] = useState(false);
  const [targetRowId, setTargetRowId] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);

  const ownership = useRef(createSessionOwnership('initial')).current;
  const [savePhase, setSavePhase] = useState<SavePhase>('idle');
  const finalizing = savePhase === 'confirming' || savePhase === 'saving';
  // Session ownership: mount/unmount
  useEffect(() => {
    ownership.mount();
    return () => ownership.dispose();
  }, [ownership]);

  // Session review modal state
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [sessionReview, setSessionReview] = useState<SessionReview | null>(null);

  // Ref to preserve workoutId across endWorkoutSession (which clears it)
  const savedWorkoutIdRef = useRef<string | null>(null);

  // Routine modal state
  const [routineModalVisible, setRoutineModalVisible] = useState(false);

  // Tutorial modal state
  const [tutorialVisible, setTutorialVisible] = useState(false);

  const [draftChecked, setDraftChecked] = useState(false);

  const openMenu = () => setMenuOpen(true);

  const swipeRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      runOnJS(openMenu)();
    });

  const { toast: inlineToast, showToast, hideToast } = useToast();
  const [startToastOpen, setStartToastOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftRestoredToast, setDraftRestoredToast] = useState(false);
  const draftToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onResetForNewDay = useCallback((_nextDate: string) => {
    if (!draftChecked || !canStartSession()) return;
    setRows([]);
    setMessageInput("");
    setLoading(false);
    setEditingCell(null);
    setEditValue("");
    // Inactive date rollover is not explicit abandonment. Never delete recovery.
  }, [draftChecked, setRows, canStartSession]);

  const {
    workoutActive,
    workoutId,
    workoutCreatedAt,
    workoutDateISO,
    bodyParts,
    title,
    selectedPart,
    startWorkoutSession: beginWorkoutSession,
    restoreWorkoutSession,
    endWorkoutSession,
    buildWorkoutToSave,
  } = useWorkoutSession({ onResetForNewDay, recoveryResolved: draftChecked });
  const startWorkoutSession = (parts: string[]) => {
    if (!draftChecked || !canStartSession()) return;
    sessionProvenanceRef.current = { ownerId: session!.user.id, generation: getWorkoutDraftGeneration() };
    beginWorkoutSession(parts);
  };
  // Post-End presentation (review close/reflection) belongs to the recovery owner.
  const ownsPresentation = () => workoutActive ? canUseSession() : canStartSession();

  // ── Dashboard data (all pre-loaded by root providers — zero extra API calls) ──
  const { program, currentWeek, loading: programLoading } = useProgram();
  const { today: coachToday } = useCoaching();
  const { totals: nutritionTotals, targets: nutritionTargets } = useNutrition();
  const { profile } = useProfile();

  const showStartToast = useCallback(() => {
    setStartToastOpen(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setStartToastOpen(false);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (draftToastTimerRef.current) clearTimeout(draftToastTimerRef.current);
    };
  }, []);

  // ── Draft persistence: restore on mount ──
  useEffect(() => {
    let disposed = false;
    const ownerId = session?.user?.id;
    const generation = getWorkoutDraftGeneration();
    recoveryOwnerRef.current = null;
    sessionProvenanceRef.current = null;
    setDraftChecked(false);
    setRows([]);
    endWorkoutSession();
    setMessageInput(''); setEditingCell(null); setEditValue(''); setLoading(false);
    setCoachAnswer(null); setCoachOpen(false); setReviewModalVisible(false);
    setNameModalVisible(false); setRoutineModalVisible(false);
    if (!ownerId) return () => { disposed = true; };
    let resolved = false;

    getWorkoutDraft().then((draft) => {
      if (disposed || generation !== getWorkoutDraftGeneration()) return;
      if (!draft) { resolved = true; return; }
      if (draft.ownerId !== ownerId) {
        showToast(draft.ownerId ? 'A saved session belongs to another account. It was kept; sign in to its original account to recover. Start and import are blocked.' : 'This older saved session has no verified owner. It was kept unchanged; recovery, Start and import are blocked until ownership can be established safely.', 'info');
        return;
      }
      sessionProvenanceRef.current = { ownerId, generation };
      resolved = true;
      {
        // Drafts are in-progress sessions, including overnight/uncertain legacy
        // sessions. No approved abandoned-session TTL: preserve, never expire.
        const interrupted = draft.rows.some((row) => row.status === 'syncing');
        setRows(draft.rows.map((row) => row.status === 'syncing' ? {
          ...row, status: 'committed' as const, performance: 'planned' as const,
          weightLbs: '', reps: '',
          notes: `Parsing interrupted — edit or delete this incomplete row.${row.pendingInput ? ` Original input: ${row.pendingInput}` : ' Original input unavailable in this older draft.'}`,
        } : row));
        if (interrupted) showToast('Parsing was interrupted. Incomplete rows can be edited or deleted; no request was retried.', 'info');
        restoreWorkoutSession(
          draft.bodyParts,
          draft.workoutId,
          draft.createdAt,
          draft.dateISO
        );
        setDraftRestoredToast(true);
        draftToastTimerRef.current = setTimeout(() => {
          setDraftRestoredToast(false);
          draftToastTimerRef.current = null;
        }, 3000);
      }
    }).then(() => {
      if (!disposed && resolved && generation === getWorkoutDraftGeneration()) {
        recoveryOwnerRef.current = { ownerId, generation };
        setDraftChecked(true);
      }
    }).catch(() => {
      if (!disposed) showToast('Unable to restore the saved session. Recovery data was kept; restart to retry before starting a new workout.', 'info');
    });
    return () => { disposed = true; };
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftGenerationRef = useRef({ workoutId, generation: getWorkoutDraftGeneration() });
  if (draftGenerationRef.current.workoutId !== workoutId) {
    draftGenerationRef.current = { workoutId, generation: getWorkoutDraftGeneration() };
  }
  const draftGeneration = draftGenerationRef.current.generation;
  const persistDraftRows = useCallback((nextRows: LogRow[]) => {
    draftRowsRef.current = nextRows;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = null;
    if (!canUseSession() || !draftChecked || !workoutActive || !workoutId || !workoutDateISO) return;
    // Empty is an active session snapshot, not absence of a session.
    saveWorkoutDraft({
      ownerId: sessionProvenanceRef.current!.ownerId, workoutId, dateISO: workoutDateISO, bodyParts,
      createdAt: workoutCreatedAt ?? Date.now(), rows: nextRows, updatedAt: Date.now(),
    }, draftGeneration).catch(() => showToast('Session changes could not be saved on this device. Keep the app open and retry.', 'info'));
  }, [draftChecked, workoutActive, workoutId, workoutDateISO, bodyParts, workoutCreatedAt, draftGeneration, showToast, canUseSession]);

  // ── Draft persistence: debounced autosave on row changes ──
  useEffect(() => {
    if (!draftChecked || !workoutActive || !workoutId || !workoutDateISO) return;
    const timer = setTimeout(() => {
      persistDraftRows(rows);
    }, 500);
    draftSaveTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [rows, draftChecked, workoutActive, workoutId, workoutDateISO, persistDraftRows]);

  // ── Draft persistence: immediate save on app background ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        // Fire-and-forget — save immediately before iOS kills the process
        persistDraftRows(draftRowsRef.current);
      }
    });
    return () => sub.remove();
  }, [rows, persistDraftRows]);

  // Subscribe to PR breakthrough notifications
  const sessionOwnerKey = `${session?.user?.id ?? 'anonymous'}:${workoutId ?? savedWorkoutIdRef.current ?? 'inactive'}`;
  // Synchronous render fence: a passive effect alone permits a late callback gap.
  ownership.setOwner(sessionOwnerKey);
  const renderOwner = ownership.capture();

  const queueAbandon = async () => {
    const owner = sessionProvenanceRef.current?.ownerId;
    if (!canUseSession() || !owner || !workoutId || !workoutDateISO) throw new Error('Session provenance required');
    await sessionOperations.abandon(owner, workoutId, workoutDateISO);
    sessionOperations.flush(owner).catch(() => showToast('Abandon reconciliation is pending; the durable operation was kept.', 'info'));
  };
  useEffect(() => {
    const owner = session?.user?.id;
    if (!owner) return;
    const retry = () => sessionOperations.flush(owner).catch(() => showToast('Session operation recovery could not be read; stored data was kept.', 'info'));
    retry();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') retry(); });
    return () => sub.remove();
  }, [session?.user?.id, showToast]);
  const { showCelebration } = usePRCelebration();
  const lastCelebratedRef = useRef<string>('');
  const { state: restTimerState, start: startRestTimer, registerRestEntrySink } = useSharedRestTimer();
  const { prefs: notificationPrefs } = useNotifications();
  const [restPrompt, setRestPrompt] = useState<RestPromptInfo | null>(null);

  // Gate for both "set logged" call sites (#3): auto-start immediately when
  // the user has opted in, otherwise surface a dismissible prompt instead of
  // silently starting a timer for them. Suppressed entirely while a timer is
  // already running/paused/done so the prompt and the live indicator never
  // compete (#8).
  const triggerRestTimer = useCallback((hints: { exercise: string; repsLastSet?: number; isCompound: boolean }) => {
    if (decideRestTimerAction(notificationPrefs?.auto_start_rest_timer === true) === 'start') {
      startRestTimer(hints).catch((err) => console.warn('[restTimer] start failed', err));
      return;
    }
    if (restTimerState.kind !== 'idle') return;
    setRestPrompt({
      exercise: hints.exercise,
      suggestedSec: suggestRestSeconds(hints),
      at: Date.now(),
    });
  }, [notificationPrefs?.auto_start_rest_timer, restTimerState.kind, startRestTimer]);

  // Primary celebration path: the log-set response tells us deterministically
  // whether the set was a PR (server-computed, no realtime/race dependency).
  const celebratePR = useCallback((pr: LogSetPR) => {
    const dedupKey = `${pr.liftName}-${pr.weight}-${pr.reps}`;
    if (lastCelebratedRef.current === dedupKey) return;
    lastCelebratedRef.current = dedupKey;
    showCelebration({
      liftName: pr.liftName,
      weight: pr.weight,
      reps: pr.reps,
      newE1rm: pr.newE1rm,
      previousE1rm: pr.previousE1rm ?? undefined,
    });
    firePRCelebration(pr.liftName, pr.weight, pr.reps).catch(() => undefined);
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  }, [showCelebration]);

  const queueLiveRows = useCallback(async (changed: LogRow[], operation: 'put' | 'drop' | 'revise' = 'put') => {
    const owner = sessionProvenanceRef.current?.ownerId;
    if (!canUseSession() || !owner || !workoutId || !workoutDateISO) throw new Error('Session provenance required');
    const effectOwner = ownership.capture();
    const effectGeneration = getWorkoutDraftGeneration();
    await sessionOperations.rows(owner, workoutId, workoutDateISO, changed, operation);
    // Durable intent precedes HTTP; background/foreground and mount retry it.
    sessionOperations.flush(owner, receipt => {
      if (ownership.isCurrent(effectOwner) && getWorkoutDraftGeneration() === effectGeneration && receipt.pr) celebratePR(receipt.pr);
    }).catch(() => { if (ownership.isCurrent(effectOwner)) showToast('Remote session reconciliation is pending; recovery was kept.', 'info'); });
  }, [canUseSession, workoutId, workoutDateISO, ownership, celebratePR, showToast]);

  // When a rest timer is started (e.g. from the Timer tab), drop a clear marker
  // into the active workout log between sets — appended, never overwriting input.
  useEffect(() => {
    const restOwner = ownership.capture();
    return registerRestEntrySink(({ durationSec }) => {
      if (!workoutActive || !canUseSession() || ownership.busy || !ownership.isSession(restOwner)) return;
      setRows((prev) => [...prev, makeRestRow(durationSec)]);
      scrollToBottom();
    });
  }, [registerRestEntrySink, workoutActive, scrollToBottom, ownership, setRows, sessionOwnerKey, canUseSession]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || !workoutActive) return;
    const prOwner = ownership.capture();

    const channel = supabase
      .channel('pr_breakthroughs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pr_history',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (ownership.busy || !ownership.isSession(prOwner)) return;
          const prData = payload.new as any;

          // Deduplicate against client-side PR check
          const dedupKey = `${prData.lift_name}-${prData.weight_lbs}-${prData.reps}`;
          if (lastCelebratedRef.current === dedupKey) return;
          lastCelebratedRef.current = dedupKey;

          // Show celebration
          showCelebration({
            liftName: prData.lift_name,
            weight: prData.weight_lbs,
            reps: prData.reps,
            newE1rm: prData.estimated_1rm,
            previousE1rm: prData.previous_1rm,
          });

          // Haptic feedback
          if (Platform.OS === 'ios') {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      )
      .subscribe((status, err) => {
        // Backup path only (log-set response is primary) — but never fail silently.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[pr] realtime channel unavailable:', status, err?.message);
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [session?.user?.id, showCelebration, workoutActive, sessionOwnerKey, ownership]);

  useEffect(() => {
    (async () => {
      const shown = await isTutorialShown();
      if (!shown && rows.length === 0 && !workoutActive) setTutorialVisible(true);
    })();
  }, [rows.length, workoutActive]);

  // openCoach is a plain function (commitPendingAndGet is defined below — useCallback
  // would create a forward-reference TypeScript error)
  const openCoach = () => {
    if (!canUseSession() || ownership.busy) return;
    if (!commitPendingAndGet()) return;
    setCoachError(null);
    setCoachOpen(true);
  };

  const closeCoach = useCallback(() => {
    setCoachOpen(false);
  }, []);

  const submitCoachQuestion = async (chatHistory?: { role: string; content: string }[]) => {
    const q = coachQuestion.trim();
    if (!canUseSession() || !q || coachLoading || ownership.busy || !ownership.isSession(renderOwner)) return;
    const request = ownership.beginRequest('coach');
    if (!request) return;
    const requestDraftGeneration = getWorkoutDraftGeneration();
    const ownsRequest = () => ownership.isCurrentRequest(request) && getWorkoutDraftGeneration() === requestDraftGeneration;
    setCoachLoading(true);
    setCoachError(null);
    setCoachAnswer(null);

    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Build recent conversation context (last 10 messages for token efficiency)
    const recentHistory = (chatHistory || [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      // Stream the response
      const res = await api.askCoach(q, toApiRows(rows), (chunk) => {
        if (ownsRequest()) setCoachAnswer((prev) => (prev || "") + chunk);
      }, recentHistory);
      if (!ownsRequest()) return;
      const answerText = res.answer?.trim() || "Coach had no response.";
      setCoachAnswer(answerText);

      // Save to Supabase chat history
      saveCoachChatQA(q, answerText, Date.now()).catch(err =>
        console.warn("[Coach] Failed to save chat history:", err)
      );

      if (Platform.OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      if (!ownsRequest()) return;
      if (err instanceof FeatureGateError && err.code === "AI_LIMIT_REACHED") {
        setCoachError("You've hit today's free message limit.");
        showAiLimitAlert();
      } else {
        const message = err instanceof Error ? err.message : "Coach is unavailable right now.";
        setCoachError(message);
      }
      if (Platform.OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      if (ownership.finishRequest(request) && getWorkoutDraftGeneration() === requestDraftGeneration) setCoachLoading(false);
    }
  };

  const onStartWorkout = () => {
    // Guard: wait for draft restore to resolve before allowing a new session.
    // Tapping before restore completes could orphan an in-progress draft.
    if (!draftChecked || !canStartSession()) return;
    if (workoutActive) {
      showToast('End the current workout before starting a new one.', 'info');
      return;
    }
    setNameModalVisible(true);
  };

  // QA-06: Home program-card "Start" — on a scheduled training day, resolve
  // and start that day's assigned rows directly instead of the generic
  // blank-naming flow. Same draftChecked/active-session guards as
  // onStartWorkout; falls back to it for rest days, no program, or when the
  // scheduled day can't be resolved.
  const handleStartFromHome = () => {
    if (!draftChecked || !canStartSession()) return;
    if (workoutActive) {
      showToast('End the current workout before starting a new one.', 'info');
      return;
    }
    // Inline-edit guard (no-op here since no session is active yet, but
    // kept for parity with every other mutation entry point).
    if (!commitPendingAndGet()) return;

    if (program && currentWeek && 'days' in currentWeek && currentWeek.days) {
      const trainingWeekdays = resolveTrainingDays(program.days_per_week, profile?.training_days);
      const dow = new Date().getDay();
      const status = resolveProgramDayStatus({
        dow,
        trainingWeekdays,
        currentWeek: program.current_week,
        weeksTotal: program.weeks_total,
        isTodayCompleted: false,
      });
      const dayIndex = resolveScheduledDayIndex(dow, trainingWeekdays, currentWeek.days.length);
      const decision = resolveHomeStartDecision({
        hasProgram: true,
        status,
        hasActiveWorkoutSession: workoutActive,
        dayIndex,
      });

      if (decision.kind === 'start_program_day') {
        const day = currentWeek.days.find((d) => d.day_index === decision.dayIndex);
        const items = resolveProgramDayItems(currentWeek.days, decision.dayIndex);
        if (day && items) {
          invalidateResponses();
          startWorkoutSession([formatProgramDayLabel(day)]);
          const skeletonRows = expandTemplateToRows(
            items.map((item) => ({
              lift_name: item.liftName,
              target_sets: item.targetSets,
              target_reps: item.targetReps,
            }))
          );
          setRows(skeletonRows);
          setMessageInput("");
          setEditingCell(null);
          setEditValue("");

          if (Platform.OS === "ios") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
          return;
        }
      }
    }

    // Rest day / no program / unresolvable day -> generic blank-naming flow.
    setNameModalVisible(true);
  };

  const confirmStartWorkout = (name: string) => {
    if (!draftChecked || !canStartSession()) return;
    if (workoutActive) {
      showToast('End the current workout before starting a new one.', 'info');
      return;
    }
    setNameModalVisible(false);
    // Directly start with just the name
    invalidateResponses();
    startWorkoutSession(name ? [name] : []);
    setRows([]);
    setMessageInput("");
    setEditingCell(null);
    setEditValue("");
  };

  // Start workout from a template with skeleton rows
  const handleSelectTemplateForStart = (template: WorkoutTemplate, items: WorkoutTemplateItem[]) => {
    if (!draftChecked || !canStartSession()) return;
    if (workoutActive) {
      showToast('End the current workout before starting a new one.', 'info');
      return;
    }
    setNameModalVisible(false);
    invalidateResponses();
    startWorkoutSession([template.name]);

    // Expand template items into skeleton rows
    const skeletonRows = expandTemplateToRows(items);
    setRows(skeletonRows);

    setMessageInput("");
    setEditingCell(null);
    setEditValue("");

    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // Import routine into current workout (or start new one if not active)
  const handleImportRoutine = (template: WorkoutTemplate, items: WorkoutTemplateItem[]) => {
    if (!draftChecked || !canStartSession() || (workoutActive && !canUseSession()) || ownership.busy) return;
    invalidateResponses();
    setRoutineModalVisible(false);

    // Expand template items into skeleton rows
    const skeletonRows = expandTemplateToRows(items);

    if (!workoutActive) {
      // Start workout with template name
      startWorkoutSession([template.name]);
      setRows(skeletonRows);
    } else {
      // Append to current rows
      setRows((prev) => [...prev, ...skeletonRows]);
    }

    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    scrollToBottom();
  };

  const invalidateResponses = useCallback(() => {
    ownership.invalidateRequests();
    // A request invalidation is not a completed set. Retain exact input as an
    // editable interruption, consistent with P1 process-death recovery.
    setRows(prev => prev.map(row => row.status === 'syncing' ? {
      ...row, status: 'committed' as const, performance: 'planned' as const,
      weightLbs: '', reps: '',
      notes: `Parsing interrupted — edit or delete this incomplete row.${row.pendingInput ? ` Original input: ${row.pendingInput}` : ' Original input unavailable.'}`,
    } : row));
    setLoading(false); setCoachLoading(false);
    setAiBubbleText(null); setCoachAnswer(null); setCoachError(null);
    setCoachOpen(false); setRestPrompt(null);
  }, [ownership, setRows]);

  const presentationOwnerRef = useRef(sessionOwnerKey);
  // Session ownership: presentation reset
  useEffect(() => {
    if (presentationOwnerRef.current === sessionOwnerKey) return;
    presentationOwnerRef.current = sessionOwnerKey;
    // The render fence already invalidated old requests. Reset presentation,
    // not ownership again, so this effect cannot revoke a new request token.
    setLoading(false); setCoachLoading(false);
    setAiBubbleText(null); setCoachAnswer(null); setCoachError(null);
    setCoachOpen(false); setRestPrompt(null);
    setReviewModalVisible(false); setSessionReview(null); setReviewLoading(false);
    setSavePhase('idle');
  }, [sessionOwnerKey]);

  const onClearRows = () => {
    if (!canUseSession() || ownership.busy) return;
    if (!draftRowsRef.current.length) { invalidateResponses(); return; }
    const clearOwner = ownership.capture();
    Alert.alert(
      "Clear table?",
      "This will remove all sets in the current session.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            if (!canUseSession() || ownership.busy || !ownership.isCurrent(clearOwner)) return;
            const clearing = draftRowsRef.current.slice();
            invalidateResponses();
            const afterInvalidation = ownership.capture();
            try {
              await queueLiveRows(clearing, 'drop');
            } catch {
              if (ownership.isCurrent(afterInvalidation)) showToast('Clear could not be saved on this device. Your rows were kept; retry Clear.', 'info');
              return;
            }
            if (!canUseSession() || !ownership.isSession(afterInvalidation)) return;
            const clearedIds = new Set(clearing.map(row => row.id));
            const remaining = draftRowsRef.current.filter(row => !clearedIds.has(row.id));
            persistDraftRows(remaining);
            setRows(remaining);
            setEditingCell(null);
            setEditValue("");
          },
        },
      ]
    );
  };

  const onIncrementSet = (rowId: string) => {
    withPendingRows((prev) => {
      const idx = prev.findIndex((r) => r.id === rowId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], set: updated[idx].set + 1 };
      return updated;
    });
  };

  const beginCellEdit = (rowId: string, field: EditableField, value: string) => {
    if (!canUseSession() || ownership.busy) return;
    invalidateResponses();
    if (editingCell && (editingCell.rowId !== rowId || editingCell.field !== field)) {
      const { nextRows, changed, invalid } = applyPendingEdit(rows);
      if (invalid) return;
      if (changed) {
        const updates = nextRows.filter(row => isPerformedRow(row) && JSON.stringify(row) !== JSON.stringify(rows.find(old => old.id === row.id)));
        const retractions = nextRows.filter(row => !isPerformedRow(row) && isPerformedRow(rows.find(old => old.id === row.id) ?? row));
        if (updates.length) queueLiveRows(updates).catch(() => showToast('Live changes could not be queued on this device. Keep the session open and retry.', 'info'));
        if (retractions.length) queueLiveRows(retractions, 'revise').catch(() => showToast('Live corrections could not be queued on this device. Keep the session open and retry.', 'info'));
        setRows(nextRows);
      }
    }
    // Direct scroll (not deferred) — rows aren't changing, just editing focus
    const rowIndex = rows.findIndex((r) => r.id === rowId);
    if (rowIndex !== -1) {
      requestAnimationFrame(() => {
        try {
          scrollRef.current?.scrollToIndex({
            index: rowIndex,
            animated: true,
            viewPosition: 0.6,
          });
        } catch {
          scrollRef.current?.scrollToEnd({ animated: true });
        }
      });
    }
    setEditingCell({ rowId, field });
    setEditValue(value ?? "");
  };

  const applyPendingEdit = useCallback(
    (list: LogRow[]): { nextRows: LogRow[]; changed: boolean; invalid?: boolean } => {
      if (!editingCell) return { nextRows: list, changed: false };
      const idx = list.findIndex((r) => r.id === editingCell.rowId);
      if (idx === -1) return { nextRows: list, changed: false };

      const current = list[idx];
      const trimmed = editingCell.field === "notes" ? editValue : editValue.trim();
      const candidate = { ...current, [editingCell.field]: trimmed };
      const error = validateWorkoutRow(candidate);
      if (error) {
        showToast(error, 'info');
        return { nextRows: list, changed: false, invalid: true };
      }
      let updated: LogRow = { ...current };
      let changed = false;

      if (editingCell.field === "exercise") {
        if (!trimmed) return { nextRows: list, changed: false };
        if (trimmed !== current.exercise) {
          updated.exercise = trimmed;
          changed = true;
        }
      } else if (editingCell.field === "set") {
        const parsed = Number(trimmed);
        if (parsed !== current.set) {
          updated.set = parsed;
          changed = true;
        }
      } else if (editingCell.field === "weightLbs") {
        if (trimmed !== current.weightLbs) {
          updated.weightLbs = trimmed;
          changed = true;
        }
      } else if (editingCell.field === "reps") {
        if (!trimmed) {
          if (current.reps) {
            updated.reps = "";
            changed = true;
          }
        } else {
          const parsedReps = Number(trimmed);
          const asString = String(parsedReps);
          if (asString !== current.reps) {
            updated.reps = asString;
            changed = true;
          }
        }
      } else if (editingCell.field === "notes") {
        if (editValue !== current.notes) {
          updated.notes = editValue;
          changed = true;
        }
      }

      if (!changed) return { nextRows: list, changed: false };
      if (editingCell.field === "weightLbs" || editingCell.field === "reps") {
        updated = resolveEditedPerformance(current, updated, editingCell.field === "reps");
      }

      const without = [...list];
      without.splice(idx, 1);

      const normTarget = normalizeExercise(updated.exercise);
      const sameExercisePositions = without
        .map((row, position) => ({ position, norm: normalizeExercise(row.exercise) }))
        .filter(({ norm }) => norm === normTarget)
        .map(({ position }) => position);

      let insertionIndex = Math.min(idx, without.length);

      if (editingCell.field === "set") {
        const desiredIdx = Math.max(Number(trimmed) - 1, 0);
        insertionIndex = sameExercisePositions.length
          ? Math.min(sameExercisePositions[0] + desiredIdx, without.length)
          : Math.min(idx, without.length);
      } else if (normalizeExercise(current.exercise) !== normTarget) {
        insertionIndex = sameExercisePositions.length
          ? sameExercisePositions[sameExercisePositions.length - 1] + 1
          : Math.min(idx, without.length);
      }

      const nextRows = [...without];
      nextRows.splice(insertionIndex, 0, updated);

      return { nextRows: resequenceSets(nextRows), changed: true };
    },
    [editValue, editingCell, showToast]
  );

  const commitCellEdit = useCallback(() => {
    if (!canUseSession() || ownership.busy) return;
    if (!editingCell) return;
    const previous = draftRowsRef.current;
    const result = applyPendingEdit(previous);
    if (result.invalid) return;
    const updates = result.nextRows.filter(row => isPerformedRow(row) &&
      JSON.stringify(row) !== JSON.stringify(previous.find(old => old.id === row.id)));
    const retractions = result.nextRows.filter(row => !isPerformedRow(row) &&
      isPerformedRow(previous.find(old => old.id === row.id) ?? row));
    if (updates.length) queueLiveRows(updates).catch(() => showToast('Live changes could not be queued on this device. Keep the session open and retry.', 'info'));
    if (retractions.length) queueLiveRows(retractions, 'revise').catch(() => showToast('Live corrections could not be queued on this device. Keep the session open and retry.', 'info'));
    setRows(result.nextRows);
    setEditingCell(null);
    setEditValue("");
  }, [applyPendingEdit, editingCell, ownership, setRows, queueLiveRows, showToast, canUseSession]);

  const withPendingRows = useCallback(
    (mutator: (rowsList: LogRow[]) => LogRow[]) => {
      if (!canUseSession() || ownership.busy) return;
      if (applyPendingEdit(draftRowsRef.current).invalid) return;
      invalidateResponses();
      setRows((prev) => {
        const { nextRows } = applyPendingEdit(prev);
        const changed = mutator(nextRows);
        const updates = changed.filter(row => isPerformedRow(row) &&
          JSON.stringify(row) !== JSON.stringify(prev.find(old => old.id === row.id)));
        const retractions = changed.filter(row => !isPerformedRow(row) &&
          isPerformedRow(prev.find(old => old.id === row.id) ?? row));
        if (updates.length) queueLiveRows(updates).catch(() => showToast('Live changes could not be queued on this device. Keep the session open and retry.', 'info'));
        if (retractions.length) queueLiveRows(retractions, 'revise').catch(() => showToast('Live corrections could not be queued on this device. Keep the session open and retry.', 'info'));
        return changed;
      });
      if (editingCell) {
        setEditingCell(null);
        setEditValue("");
      }
    },
    [applyPendingEdit, editingCell, invalidateResponses, ownership, setRows, queueLiveRows, showToast, canUseSession]
  );

  const commitPendingAndGet = (deliver = true) => {
    if (workoutActive && !canUseSession()) return null;
    if (!editingCell) return draftRowsRef.current;
    const previous = draftRowsRef.current;
    const { nextRows, invalid } = applyPendingEdit(previous);
    if (invalid) return null;
    if (deliver) {
      const updates = nextRows.filter(row => isPerformedRow(row) && JSON.stringify(row) !== JSON.stringify(previous.find(old => old.id === row.id)));
      const retractions = nextRows.filter(row => !isPerformedRow(row) && isPerformedRow(previous.find(old => old.id === row.id) ?? row));
      if (updates.length) queueLiveRows(updates).catch(() => showToast('Live changes could not be queued on this device. Keep the session open and retry.', 'info'));
      if (retractions.length) queueLiveRows(retractions, 'revise').catch(() => showToast('Live corrections could not be queued on this device. Keep the session open and retry.', 'info'));
    }
    setRows(nextRows);
    setEditingCell(null);
    setEditValue("");
    return nextRows;
  };

  const deleteRow = async (rowId: string) => {
    if (!canUseSession() || ownership.busy || applyPendingEdit(draftRowsRef.current).invalid) return;
    const removed = draftRowsRef.current.find(row => row.id === rowId);
    if (!removed) return;
    invalidateResponses();
    const deletionOwner = ownership.capture();
    const deletionGeneration = getWorkoutDraftGeneration();
    try { await queueLiveRows([removed], 'drop'); }
    catch {
      if (ownership.isCurrent(deletionOwner)) showToast('Deletion could not be saved on this device. Your row was kept; retry delete.', 'info');
      return;
    }
    if (!ownership.isSession(deletionOwner) || getWorkoutDraftGeneration() !== deletionGeneration) return;
    const previous = draftRowsRef.current;
    const nextRows = resequenceSets(previous.filter(row => row.id !== rowId));
    const updates = nextRows.filter(row => isPerformedRow(row) && JSON.stringify(row) !== JSON.stringify(previous.find(old => old.id === row.id)));
    if (updates.length) queueLiveRows(updates).catch(() => {
      if (ownership.isCurrent(deletionOwner)) showToast('Live numbering changes could not be queued on this device. Recovery was kept.', 'info');
    });
    persistDraftRows(nextRows);
    setRows(nextRows);
    setEditingCell(null); setEditValue('');
  };

  const duplicateRow = (rowId: string) => {
    withPendingRows((prev) => {
      const idx = prev.findIndex((r) => r.id === rowId);
      if (idx === -1) return prev;
      const source = prev[idx];
      const dupe: LogRow = {
        ...source,
        id: makeId(),
        set: source.set + 1,
        timestamp: Date.now(),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, dupe);
      return resequenceSets(next);
    });
    scrollToBottom();
  };

  const handleReorderRow = useCallback((fromIndex: number, toIndex: number) => {
    if (!canUseSession() || ownership.busy) return;
    invalidateResponses();
    setRows(prev => {
      const clamped = Math.max(0, Math.min(toIndex, prev.length - 1));
      if (fromIndex === clamped) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(clamped, 0, moved);
      const changed = resequenceSets(next);
      const updates = changed.filter(row => isPerformedRow(row) &&
        JSON.stringify(row) !== JSON.stringify(prev.find(old => old.id === row.id)));
      if (updates.length) queueLiveRows(updates).catch(() => showToast('Live changes could not be queued on this device. Keep the session open and retry.', 'info'));
      return changed;
    });
  }, [invalidateResponses, ownership, setRows, queueLiveRows, showToast, canUseSession]);

  const handleOpenEditSet = (rowId: string) => {
    if (!canUseSession() || ownership.busy) return;
    setTargetRowId(rowId);
    setEditSetModalVisible(true);
  };

  const handleSaveSet = (updatedRow: LogRow) => {
    const error = validateWorkoutRow(updatedRow);
    if (error) { showToast(error, 'info'); return; }
    withPendingRows((prev) => {
      const idx = prev.findIndex((r) => r.id === updatedRow.id);
      if (idx === -1) return prev;

      const oldRow = prev[idx];
      const next = [...prev];
      next[idx] = resolveEditedPerformance(oldRow, updatedRow, updatedRow.reps !== oldRow.reps);

      // If exercise name changed, re-sequence
      if (normalizeExercise(oldRow.exercise) !== normalizeExercise(updatedRow.exercise)) {
        // Remove and re-insert logic handled by simple sort? 
        // Or re-use applyPendingEdit logic? 
        // Simplest is to just let re-sequencing happen.
        // But resequenceSets mainly handles set numbers.
        // If name changes, it should conceptually move to that exercise's group.

        // Let's rely on a simpler approach: Just update and maybe re-sort/re-sequence if needed.
        // Our table handles grouping by visual order essentially.
        // If I change "Bench" to "Squat", it should ideally jump to Squat group or start one.
        // For now, let's just update and resequence.
      }
      return resequenceSets(next);
    });
  };

  const onEndWorkout = async () => {
    if (!ownership.isSession(renderOwner) || getWorkoutDraftGeneration() !== draftGeneration) return;
    if (!workoutActive) { showToast('Start a workout first.', 'info'); return; }
    if (!canUseSession() || ownership.busy) return;
    // Confirmation must not dispatch mutations; the confirmed final snapshot owns them.
    const committedRows = commitPendingAndGet(false);
    if (!committedRows) return;
    const token = ownership.beginEnd(committedRows);
    if (!token) return;
    invalidateResponses();
    setSavePhase('confirming');
    const empty = performedRows(token.rows).length === 0;
    const proceed = await new Promise<boolean>(resolve => Alert.alert(
      empty ? 'End empty session?' : 'End workout?',
      empty ? 'No sets logged. Nothing will be saved to history.' : 'This will save and generate your workout review.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: empty ? 'End Session' : 'Save', style: empty ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ));
    if (!ownership.isCurrentEnd(token) || getWorkoutDraftGeneration() !== draftGeneration) { ownership.releaseEnd(token); return; }
    if (!proceed) { ownership.releaseEnd(token); setSavePhase('idle'); return; }
    if (!empty) { await handleEndWorkoutWithReview(token.rows, token); return; }
    setSavePhase('saving');
    let cleanupGeneration: number | null = null;
    const endOwner = sessionProvenanceRef.current?.ownerId;
    try {
      await queueAbandon();
      if (!ownership.isCurrentEnd(token) || getWorkoutDraftGeneration() !== draftGeneration) return;
      const cleanup = clearWorkoutDraft(endOwner, draftGeneration);
      cleanupGeneration = getWorkoutDraftGeneration();
      await cleanup;
      if (!ownership.isCurrentEnd(token) || getWorkoutDraftGeneration() !== cleanupGeneration) return;
      restampOwner(endOwner, cleanupGeneration, false);
      endWorkoutSession(); setRows([]); setMessageInput(''); setEditingCell(null); setEditValue('');
      ownership.releaseEnd(token); setSavePhase('idle');
    } catch {
      if (!ownership.isCurrentEnd(token) || getWorkoutDraftGeneration() !== (cleanupGeneration ?? draftGeneration)) return;
      draftGenerationRef.current = { workoutId, generation: getWorkoutDraftGeneration() };
      restampOwner(endOwner, getWorkoutDraftGeneration(), true);
      ownership.releaseEnd(token); setSavePhase('failed');
      showToast('Session could not be ended. Recovery data was kept; retry End.', 'info');
    } finally {
      ownership.releaseEnd(token);
    }
  };

  // Finalization owns a deep snapshot, not the mutable render's row objects.
  const handleEndWorkoutWithReview = async (currentRows: LogRow[], reserved?: EndOwnership) => {
    if (!canUseSession()) return;
    const token = reserved ?? ownership.beginEnd(currentRows);
    if (!token || !ownership.isCurrentEnd(token)) return;
    const committedRows = performedRows(token.rows);
    if (!committedRows.length) {
      ownership.releaseEnd(token);
      setSavePhase('idle');
      showToast('Log some sets before ending your workout.', 'info');
      return;
    }
    invalidateResponses();
    savedWorkoutIdRef.current = workoutId ?? null;
    setSavePhase('saving');
    setReviewModalVisible(true);
    setReviewLoading(true);
    setSessionReview(null);
    const ownsSave = () => ownership.isCurrentEnd(token) && getWorkoutDraftGeneration() === draftGeneration;
    const storedRows = serializeWorkoutRows(committedRows);
    // Strength rating/progression is optional and inapplicable to cardio-only
    // sessions. Keep all performed evidence durable, not just reviewable sets.
    const strengthRows = committedRows.filter(r => !r.isCardio && r.setKind !== 'cardio');
    const reviewPromise = strengthRows.length
      ? settleOptionalReview(api.generateSessionReview(strengthRows.map(r => ({
        id: r.id, timestamp: r.timestamp, performance: r.performance,
        isCardio: r.isCardio, setKind: r.setKind, plannedTarget: r.plannedTarget,
        exercise: r.exercise, set: r.set, weightLbs: r.weightLbs, reps: r.reps, notes: r.notes,
      })), selectedPart)
        .then(data => ({ ...data, generatedAt: Date.now() })))
      : Promise.resolve(null);
    let cleanupGeneration: number | null = null;
    const endOwner = sessionProvenanceRef.current?.ownerId;
    try {
      // Local history must be written before waiting for optional AI review.
      const { synced } = await saveWorkoutLocalFirst(buildWorkoutToSave(storedRows), { review: reviewPromise, isCurrent: ownsSave });
      if (!ownsSave()) return;
      const cleanup = clearWorkoutDraft(endOwner, draftGeneration);
      cleanupGeneration = getWorkoutDraftGeneration();
      await cleanup;
      if (!ownership.isCurrentEnd(token) || getWorkoutDraftGeneration() !== cleanupGeneration) return;
      const review = await reviewPromise;
      if (!ownership.isCurrentEnd(token) || getWorkoutDraftGeneration() !== cleanupGeneration) return;
      restampOwner(endOwner, cleanupGeneration, false);
      setSessionReview(review);
      setReviewLoading(false);
      setSavePhase('saved');
      endWorkoutSession();
      setRows([]);
      setMessageInput('');
      setEditingCell(null);
      setEditValue('');
      ownership.releaseEnd(token);
      if (!synced) showToast('Saved on this device — will sync when back online.', 'info');
    } catch (error) {
      if (!ownership.isCurrentEnd(token) || getWorkoutDraftGeneration() !== (cleanupGeneration ?? draftGeneration)) return;
      if (cleanupGeneration !== null) {
        draftGenerationRef.current = { workoutId, generation: cleanupGeneration };
        restampOwner(endOwner, cleanupGeneration, true);
      }
      console.error('[handleEndWorkoutWithReview] Save failed:', error);
      setReviewLoading(false);
      setSavePhase('failed');
      showToast('Workout could not be finished on this device. Your session was kept. Retry End to save it.', 'info');
      ownership.releaseEnd(token);
    } finally {
      // Identity-based release cannot unlock a newer owner's End token.
      ownership.releaseEnd(token);
    }
  };

  // One guard per rendered composer callback. A newer render/session does not
  // inherit an old provider's latch; ownership still fences its late result.
  const submissionGuard = createSubmitGuard({ once: true });
  const sendMessage = async () => {
    await submissionGuard.run(async () => {
    const message = messageInput.trim();
    if (!canUseSession() || !message || loading || ownership.busy || !ownership.isSession(renderOwner)) return;
    if (!workoutActive) {
      showToast('Start a workout before logging sets.', 'info');
      return;
    }

    const currentRows = commitPendingAndGet();
    if (!currentRows) return;
    const effectOwner = ownership.capture();
    const effectsDraftGeneration = getWorkoutDraftGeneration();
    const logPerformedRows = (changedRows: LogRow[]) => {
      // Each actual changed row (fill or append) logs once.
      const eligible = performedRows(changedRows).filter(row => !validateWorkoutRow(row, true) &&
        (row.isCardio || Number(row.reps) > 0));
      if (eligible.length) queueLiveRows(eligible)
        .catch(() => { if (ownership.isCurrent(effectOwner) && getWorkoutDraftGeneration() === effectsDraftGeneration) showToast('Live changes could not be queued on this device. Keep the session open and retry.', 'info'); });

      // Start rest timer for the last logged non-cardio set
      const lastWorking = [...eligible].reverse().find((r) => !r.isCardio);
      if (lastWorking && lastWorking.weightLbs && lastWorking.reps) {
        const reps = Number(lastWorking.reps);
        triggerRestTimer({
          exercise: lastWorking.exercise,
          repsLastSet: Number.isFinite(reps) ? reps : undefined,
          isCompound: isCompoundExercise(lastWorking.exercise),
        });
      }

    };
    // Don't set loading yet, as we try fast parse synchronously

    // Local synchronous parse - pass currentRows for routine-aware parsing
    const gateDecision = decideAndParse(messageInput, {
      lastExercise: getLastExerciseFromRows(currentRows),
      currentRows: currentRows.map(r => ({
        id: r.id,
        performance: r.performance,
        status: r.status,
        setKind: r.setKind,
        isRest: r.isRest,
        isCardio: r.isCardio,
        exercise: r.exercise,
        weightLbs: r.weightLbs,
        reps: r.reps,
      })),
    });

    if (gateDecision.kind === "validation") {
      // Keep the composer untouched; malformed sets must not reach AI or writes.
      showToast(gateDecision.clarification, 'info');
      return;
    }

    // One fill transition and the same effects as explicit-name fills/appends.
    if (gateDecision.kind === "fill_skeleton" || gateDecision.kind === "fill_skeleton_batch") {
      const updates = gateDecision.kind === "fill_skeleton" ? [gateDecision] : gateDecision.updates;
      const next = [...currentRows];
      const changedRows: LogRow[] = [];
      updates.forEach(({ targetRowIndex, weight, reps }) => {
        const candidate = next[targetRowIndex];
        if (!candidate || !isPendingSet(candidate)) return;
        const updated = resolveEditedPerformance(candidate, {
          ...candidate,
          weightLbs: weight,
          reps: reps ?? candidate.reps,
          setKind: candidate.setKind ?? 'work',
          status: 'committed',
          timestamp: Date.now(),
        }, reps !== undefined);
        next[targetRowIndex] = updated;
        changedRows.push(updated);
      });
      setRows(next);
      setMessageInput("");
      logPerformedRows(changedRows);
      const lastIndex = updates[updates.length - 1]?.targetRowIndex ?? 0;
      scrollToRowIndex(Math.min(lastIndex + 1, next.length - 1), next.length);
      return;
    }

    if (gateDecision.kind === "fast") {
      let next = [...currentRows];
      const parsedRows = gateDecision.rows ?? [];

      if (!parsedRows.length) {
        // Parsing failed but continue silently - parsing logic intact
        return;
      }
      const changedRows: LogRow[] = [];
      const addOrFillRow = (rowData: ParsedRow, setOverride?: number) => {
        const normalizedExercise = rowData.exercise.trim().toLowerCase();
        for (let i = 0; i < next.length; i += 1) {
          const candidate = next[i];
          if (!candidate?.exercise || candidate.isRest || candidate.isCardio || rowData.isCardio) continue;
          if (candidate.exercise.trim().toLowerCase() !== normalizedExercise) continue;
          if (rowData.kind === 'warmup' || candidate.setKind === 'warmup') continue;
          if (!isPendingSet(candidate)) continue;
          const updated = resolveEditedPerformance(candidate, {
            ...candidate,
            setKind: rowData.setKind ?? (rowData.kind === 'dropset' ? 'drop' : rowData.kind === 'superset' ? 'superset' : 'work'),
            weightLbs: rowData.weightLbs,
            reps: rowData.reps,
            timestamp: Date.now(),
            status: 'committed',
            notes: rowData.notes ? (candidate.notes ? `${candidate.notes}\n${rowData.notes}` : rowData.notes) : candidate.notes,
          }, true);
          next[i] = updated;
          changedRows.push(updated);
          return;
        }

        const setVal =
          typeof setOverride === "number"
            ? setOverride
            : rowData.kind === "warmup"
              ? 0
              : nextSetNumberForExercise(next, rowData.exercise);

        next = [
          ...next,
          {
            id: makeId(),
            exercise: rowData.exercise,
            set: setVal,
            weightLbs: rowData.weightLbs,
            reps: rowData.reps,
            notes: rowData.notes,
            timestamp: Date.now(),
            status: "committed",
            performance: "performed",
            setKind: rowData.setKind ?? (rowData.kind === "warmup" ? "warmup" : rowData.kind === "dropset" ? "drop" : rowData.kind === "superset" ? "superset" : rowData.isCardio ? "cardio" : "work"),
            // Cardio fields
            isCardio: rowData.isCardio,
            durationMins: rowData.durationMins,
            distance: rowData.distance,
            distanceUnit: rowData.distanceUnit,
            heartRate: rowData.heartRate,
            calories: rowData.calories,
            level: rowData.level,
          },
        ];
      };

      parsedRows.forEach((row) => {
        const beforeLength = next.length;
        addOrFillRow(row);
        if (next.length > beforeLength) changedRows.push(next[next.length - 1]);
      });
      setRows(next);
      setMessageInput("");
      setLoading(false);

      logPerformedRows(changedRows);

      scrollToBottom();
      return;
    }

    // Handle end workout intent - auto-save and generate review
    if (gateDecision.kind === "end_workout") {
      setMessageInput("");


      // Trigger the end workout flow with review
      await onEndWorkout();
      return;
    }

    if (gateDecision.kind === "ai") {
      // For questions we skip the ghost row (no workout data expected).
      // For parse attempts we show a ghost row while the AI responds.
      const request = ownership.beginRequest('workout');
      if (!request) return;
      const requestDraftGeneration = getWorkoutDraftGeneration();
      const ownsRequest = () => ownership.isCurrentRequest(request) && getWorkoutDraftGeneration() === requestDraftGeneration;
      const isQuestion = gateDecision.reason === "conversational_question";
      const ghostId = isQuestion ? null : makeId();

      setMessageInput("");
      setLoading(true);

      if (ghostId) {
        const optimisticRow: LogRow = {
          id: ghostId,
          exercise: message.length > 20 ? message.slice(0, 17) + "..." : message,
          set: 1,
          weightLbs: "...",
          reps: "...",
          notes: "Parsing...",
          timestamp: Date.now(),
          status: "syncing",
          pendingInput: messageInput,
        };
        setRows((prev) => [...prev, optimisticRow]);
      }

      try {
        const lastExercise = getLastExerciseFromRows(currentRows);
        const res = await api.chat(message, toApiRows(currentRows), lastExercise);
        if (!ownsRequest()) return;
        if (ghostId && !draftRowsRef.current.some(r => r.id === ghostId && r.status === 'syncing')) return;

        if (res.answer) {
          // AI answered a question or couldn't parse — show the response bubble
          setAiBubbleText(res.answer);
          if (ghostId) setRows((prev) => prev.filter((r) => r.id !== ghostId));

          saveWorkoutChatQA(message, res.answer, Date.now()).catch((err) =>
            console.warn("[Workout] Failed to save chat history:", err)
          );
        } else if (!isQuestion && res.rows && res.rows.length > 0) {
          if (!Array.isArray(res.rows) || res.rows.some(row => validateWorkoutRow(row))) {
            if (ghostId) setRows((prev) => prev.filter(r => r.id !== ghostId));
            setMessageInput(messageInput);
            showToast('Parsed set values are invalid. Your input has been kept for correction.', 'info');
            return;
          }
          // Conversational intent is answer-only, even if the model returns sets.
          // AI parsed workout rows — add them to the session
          const newRows = buildRowsFromApi(res.rows).map((r) => ({
            ...r,
            status: "committed" as const,
          }));
          setRows((prev) =>
            ghostId
              ? prev.filter((r) => r.id !== ghostId).concat(newRows)
              : prev.concat(newRows)
          );
          // Share performed-only live logging and one rest effect with fast/fill.
          logPerformedRows(newRows);
          scrollToBottom();
        } else {
          // Empty response — remove ghost row silently
          if (ghostId) setRows((prev) => prev.filter((r) => r.id !== ghostId));
        }
      } catch (e) {
        if (!ownsRequest()) return;
        setMessageInput(messageInput);
        console.warn('[workout] sendMessage failed', e);
        if (ghostId) setRows((prev) => prev.filter((r) => r.id !== ghostId));
        if (e instanceof FeatureGateError && e.code === 'AI_LIMIT_REACHED') {
          showAiLimitAlert();
        }
      } finally {
        if (ownership.finishRequest(request) && getWorkoutDraftGeneration() === requestDraftGeneration) setLoading(false);
      }
    }
    });
  };

  return (
    <GestureDetector gesture={swipeRight}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // The screen sits above the tab bar, so the keyboard overlap is smaller
        // than the raw keyboard height by exactly the tab bar's height. Without
        // this offset the composer is pushed up by that much dead space.
        keyboardVerticalOffset={tabBarHeight ?? 0}
        style={[styles.screen, { backgroundColor }]}
      >
        {/* Green dot on tab icon while a workout is in progress */}
        <Tabs.Screen
          options={{
            tabBarBadge: workoutActive ? ' ' : undefined,
            tabBarBadgeStyle: { backgroundColor: successColor, borderColor: 'transparent', minWidth: 10, height: 10, borderRadius: 5 },
          }}
        />

        <Header
          title={workoutActive ? title : null}
          onMenuPress={() => setMenuOpen(true)}
          onClearPress={onClearRows}
          onRoutinePress={() => setRoutineModalVisible(true)}
        />

        {/* Content fills all space above the input bar, so the input + Start/Send
            buttons stay anchored directly above the footer on every screen size. */}
        <View style={styles.contentArea}>
          {workoutActive ? (
            <WorkoutTable
              rows={rows}
              compact={compact}
              scrollRef={scrollRef}
              editingCell={editingCell}
              editValue={editValue}
              onBeginEditCell={beginCellEdit}
              onChangeEditValue={setEditValue}
              onCommitEditCell={commitCellEdit}
              onDeleteRow={deleteRow}
              onDuplicateRow={duplicateRow}
              onReorderRow={handleReorderRow}
              onIncrementSet={onIncrementSet}
              onEditSet={handleOpenEditSet}
            />
          ) : (
            <HomeDashboard
              program={program}
              currentWeek={currentWeek}
              programLoading={programLoading}
              coachToday={coachToday}
              totals={nutritionTotals}
              targets={nutritionTargets}
              onStartWorkout={handleStartFromHome}
              onNavigateProgram={() => router.push('/program')}
              onNavigateCoach={() => router.push('/coach')}
              onNavigateNutrition={() => router.push('/nutrition')}
            />
          )}
        </View>

        <WorkoutBottomBar
          workoutActive={workoutActive}
          finalizing={finalizing}
          loading={loading}
          messageInput={messageInput}
          setMessageInput={setMessageInput}
          sendMessage={sendMessage}
          onStartWorkout={onStartWorkout}
          onEndWorkout={onEndWorkout}
          onClearRows={onClearRows}
          goToHistory={() => router.push("/history")}
          hasRows={rows.length > 0}
          startToastOpen={startToastOpen}
          showStartToast={showStartToast}
        />

        {inlineToast && <Toast message={inlineToast.message} type={inlineToast.type} onDismiss={hideToast} />}

        {restPrompt && restTimerState.kind === 'idle' && (
          <StartRestPrompt
            prompt={restPrompt}
            onStart={() => {
              startRestTimer({
                exercise: restPrompt.exercise,
                prescribedRestSec: restPrompt.suggestedSec,
              }).catch((err: unknown) => console.warn('[restTimer] start failed', err));
              setRestPrompt(null);
            }}
            onDismiss={() => setRestPrompt(null)}
          />
        )}

        {draftRestoredToast && (
          <View style={styles.draftRestoredToast} pointerEvents="none">
            <View style={[styles.draftRestoredBadge, { backgroundColor: successColor }]}>
              <Text style={[styles.draftRestoredText, { color: onTint }]}>Session resumed</Text>
            </View>
          </View>
        )}

        {aiBubbleText && (
          <AiResponseBubble
            text={aiBubbleText}
            onDismiss={() => setAiBubbleText(null)}
          />
        )}

        <CoachModal
          visible={coachOpen}
          question={coachQuestion}
          onChangeQuestion={setCoachQuestion}
          loading={coachLoading}
          answer={coachAnswer}
          error={coachError}
          onSubmit={submitCoachQuestion}
          onClose={closeCoach}
        />

        <EditSetModal
          visible={editSetModalVisible}
          row={rows.find((r) => r.id === targetRowId) ?? null}
          onClose={() => setEditSetModalVisible(false)}
          onSave={handleSaveSet}
        />

        <MenuModal
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          onNavigateHistory={() => router.push("/history")}
          onNavigateChats={() => router.push("/chats")}
          onNavigateSettings={() => router.push("/settings")}
          onNavigateTemplates={() => router.push("/settings/templates")}
          onOpenCoach={openCoach}
          onNavigateNutrition={() => router.push("/nutrition")}
          onNavigateCoachReport={() => router.push("/coach")}
          onNavigateProgress={() => router.push("/progress")}
          onNavigateProgram={() => router.push("/program")}
          onNavigateExerciseLibrary={() => router.push("/exercise-library")}
          onOpenHelp={() => setTutorialVisible(true)}
        />

        <WorkoutNameModal
          visible={nameModalVisible}
          userId={session?.user?.id}
          onClose={() => setNameModalVisible(false)}
          onConfirm={confirmStartWorkout}
          onSelectTemplate={handleSelectTemplateForStart}
        />

        <RoutineModal
          visible={routineModalVisible}
          userId={session?.user?.id || ""}
          onClose={() => setRoutineModalVisible(false)}
          onSelectTemplate={handleImportRoutine}
        />

        <TutorialModal
          visible={tutorialVisible}
          onDismiss={() => setTutorialVisible(false)}
        />

        <SessionReviewModal
          visible={reviewModalVisible}
          savePhase={savePhase}
          onRetry={() => { void onEndWorkout(); }}
          loading={reviewLoading}
          review={sessionReview}
          workoutTitle={title}
          workoutId={savedWorkoutIdRef.current}
          userId={session?.user?.id}
          onClose={() => {
            if (!ownsPresentation() || ownership.busy) return;
            setReviewModalVisible(false);
            setSessionReview(null);
            savedWorkoutIdRef.current = null;
          }}
          onSaveReflection={(text) => {
            if (!ownsPresentation()) return;
            const wId = savedWorkoutIdRef.current;
            if (wId && text) {
              api.updateWorkoutMeta(wId, { reflection: text }).catch((err) =>
                console.error("[SessionReview] Failed to save reflection:", err)
              );
            }
          }}
        />
      </KeyboardAvoidingView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  draftRestoredToast: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  draftRestoredBadge: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  draftRestoredText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
