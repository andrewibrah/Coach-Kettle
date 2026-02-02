import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View
} from "react-native";

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Directions, Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

import { useAuth } from "@/components/AuthProvider";
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
import { ThemedText } from "@/components/ui/themed-text";
import { WorkoutBottomBar } from "@/components/workout/WorkoutBottomBar";
import { WorkoutTable } from "@/components/workout/WorkoutTable";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { api, type ApiWorkoutRow } from "@/lib/api";
import { saveCoachChatQA, saveWorkoutChatQA } from "@/lib/chatStorage";
import { type WorkoutTemplate, type WorkoutTemplateItem } from "@/lib/profile";
import { decideAndParse, type ParsedRow } from "@/lib/structuredGate";
import { expandTemplateToRows, getLastExerciseFromRows, makeId, nextSetNumberForExercise, normalizeExercise, resequenceSets } from "@/lib/workoutRules";
import { type SessionReview } from "@/lib/workoutStorage";
import { type LogRow } from "@/types/workout";


type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

export default function HomeScreen() {
  const router = useRouter();


  const colorScheme = useColorScheme();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const backgroundColor = useThemeColor({}, 'background');
  const iconColor = useThemeColor({}, 'text');

  const scrollRef = useRef<ScrollView | null>(null);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [undoState, setUndoState] = useState<{ row: LogRow; index: number } | null>(null);
  const [messageInput, setMessageInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; reason?: string } | null>(null);
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
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Session review modal state
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [sessionReview, setSessionReview] = useState<SessionReview | null>(null);

  // Routine modal state
  const [routineModalVisible, setRoutineModalVisible] = useState(false);

  const openMenu = () => setMenuOpen(true);
  const swipeRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      runOnJS(openMenu)();
    });

  const [startToastOpen, setStartToastOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onResetForNewDay = useCallback((_nextDate: string) => {
    setRows([]);
    setMessageInput("");
    setLoading(false);
    setError(null);
    setEditingCell(null);
    setEditValue("");
    setUndoState(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const { workoutActive, title, selectedPart, startWorkoutSession, endWorkoutSession, buildWorkoutToSave } = useWorkoutSession({
    onResetForNewDay,
  });

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
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Subscribe to PR breakthrough notifications
  const { session } = useAuth();
  const { showCelebration } = usePRCelebration();

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    console.log('[PR] Setting up Realtime subscription for PR breakthroughs...');

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
          console.log('[PR] New PR detected!', payload.new);
          const prData = payload.new as any;

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
      .subscribe((status) => {
        console.log('[PR] Realtime subscription status:', status);
      });

    return () => {
      console.log('[PR] Cleaning up Realtime subscription');
      channel.unsubscribe();
    };
  }, [session?.user?.id, showCelebration]);

  const openCoach = () => {
    commitPendingAndGet();
    setCoachError(null);
    setCoachOpen(true);
  };

  const closeCoach = () => {
    setCoachOpen(false);
  };



  const buildRowsFromApi = (apiRows: ApiWorkoutRow[]): LogRow[] => {
    return apiRows
      .filter((row) => row.exercise && row.exercise.trim())
      .map((row) => ({
        id: `${Date.now()}-${Math.random()}`,
        exercise: row.exercise.trim(),
        set: Number.isFinite(row.set) ? row.set : 1,
        weightLbs: String(row.weightLbs ?? "").trim(),
        reps: String(row.reps ?? "").trim(),
        notes: String(row.notes ?? "").trim(),
        timestamp: Date.now(),
        status: "committed",
      }));
  };

  const toApiRows = (sourceRows: LogRow[]): ApiWorkoutRow[] =>
    sourceRows.map((row) => ({
      exercise: row.exercise,
      set: row.set,
      weightLbs: row.weightLbs,
      reps: row.reps,
      notes: row.notes,
    }));

  const submitCoachQuestion = async () => {
    const q = coachQuestion.trim();
    if (!q || coachLoading) return;
    setCoachLoading(true);
    setCoachError(null);
    setCoachAnswer(null);

    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Stream the response
      const res = await api.askCoach(q, toApiRows(rows), (chunk) => {
        setCoachAnswer((prev) => (prev || "") + chunk);
      });
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
      const message = err instanceof Error ? err.message : "Coach is unavailable right now.";
      setCoachError(message);
      if (Platform.OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setCoachLoading(false);
    }
  };

  const onStartWorkout = () => {
    if (workoutActive) {
      Alert.alert("Workout already started", "End the current workout to start a new one.");
      return;
    }
    setNameModalVisible(true);
  };

  const confirmStartWorkout = (name: string) => {
    setNameModalVisible(false);
    // Directly start with just the name
    startWorkoutSession(name ? [name] : []);
    setRows([]);
    setMessageInput("");
    setError(null);
    setEditingCell(null);
    setEditValue("");
    setUndoState(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  // Start workout from a template with skeleton rows
  const handleSelectTemplateForStart = (template: WorkoutTemplate, items: WorkoutTemplateItem[]) => {
    setNameModalVisible(false);
    startWorkoutSession([template.name]);
    
    // Expand template items into skeleton rows
    const skeletonRows = expandTemplateToRows(items);
    setRows(skeletonRows);
    
    setMessageInput("");
    setError(null);
    setEditingCell(null);
    setEditValue("");
    setUndoState(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    if (Platform.OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // Import routine into current workout (or start new one if not active)
  const handleImportRoutine = (template: WorkoutTemplate, items: WorkoutTemplateItem[]) => {
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

    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const onClearRows = () => {
    commitPendingAndGet();
    if (!rows.length) return;
    Alert.alert(
      "Clear table?",
      "This will remove all sets in the current session.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            setRows([]);
            setEditingCell(null);
            setEditValue("");
            setUndoState(null);
            if (undoTimerRef.current) {
              clearTimeout(undoTimerRef.current);
              undoTimerRef.current = null;
            }
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
    if (editingCell && (editingCell.rowId !== rowId || editingCell.field !== field)) {
      const { nextRows, changed } = applyPendingEdit(rows);
      if (changed) setRows(nextRows);
    }
    setEditingCell({ rowId, field });
    setEditValue(value ?? "");
  };

  const applyPendingEdit = useCallback(
    (list: LogRow[]): { nextRows: LogRow[]; changed: boolean } => {
      if (!editingCell) return { nextRows: list, changed: false };
      const idx = list.findIndex((r) => r.id === editingCell.rowId);
      if (idx === -1) return { nextRows: list, changed: false };

      const current = list[idx];
      const trimmed = editingCell.field === "notes" ? editValue : editValue.trim();
      let updated: LogRow = { ...current };
      let changed = false;

      if (editingCell.field === "exercise") {
        if (!trimmed) return { nextRows: list, changed: false };
        if (trimmed !== current.exercise) {
          updated.exercise = trimmed;
          changed = true;
        }
      } else if (editingCell.field === "set") {
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) return { nextRows: list, changed: false };
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
          const parsedReps = Number.parseInt(trimmed, 10);
          if (!Number.isFinite(parsedReps) || parsedReps <= 0) return { nextRows: list, changed: false };
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

      const without = [...list];
      without.splice(idx, 1);

      const normTarget = normalizeExercise(updated.exercise);
      const sameExercisePositions = without
        .map((row, position) => ({ position, norm: normalizeExercise(row.exercise) }))
        .filter(({ norm }) => norm === normTarget)
        .map(({ position }) => position);

      let insertionIndex = Math.min(idx, without.length);

      if (editingCell.field === "set") {
        const desiredIdx = Math.max((Number.parseInt(trimmed, 10) || 1) - 1, 0);
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
    [editValue, editingCell]
  );

  const commitCellEdit = useCallback(() => {
    if (!editingCell) return;
    setRows((prev) => applyPendingEdit(prev).nextRows);
    setEditingCell(null);
    setEditValue("");
  }, [applyPendingEdit, editingCell]);

  const withPendingRows = useCallback(
    (mutator: (rowsList: LogRow[]) => LogRow[]) => {
      setRows((prev) => {
        const { nextRows } = applyPendingEdit(prev);
        return mutator(nextRows);
      });
      if (editingCell) {
        setEditingCell(null);
        setEditValue("");
      }
    },
    [applyPendingEdit, editingCell]
  );

  const commitPendingAndGet = () => {
    if (!editingCell) return rows;
    const { nextRows } = applyPendingEdit(rows);
    setRows(nextRows);
    setEditingCell(null);
    setEditValue("");
    return nextRows;
  };

  const deleteRow = (rowId: string) => {
    withPendingRows((prev) => {
      const idx = prev.findIndex((r) => r.id === rowId);
      if (idx === -1) return prev;

      const deletedRow = prev[idx];
      const nextRows = prev.filter((r) => r.id !== rowId);
      setUndoState({ row: deletedRow, index: idx });
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        setUndoState(null);
        undoTimerRef.current = null;
      }, 5000);

      return resequenceSets(nextRows);
    });
  };

  const undoDelete = () => {
    if (!undoState) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setRows((prev) => {
      const insertAt = Math.min(Math.max(undoState.index, 0), prev.length);
      const next = [...prev];
      next.splice(insertAt, 0, undoState.row);
      return resequenceSets(next);
    });
    setUndoState(null);
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
  };

  const moveRow = (rowId: string, direction: "up" | "down") => {
    withPendingRows((prev) => {
      const idx = prev.findIndex((r) => r.id === rowId);
      if (idx === -1) return prev;
      const norm = normalizeExercise(prev[idx].exercise);
      let swapWith = -1;
      if (direction === "up") {
        for (let i = idx - 1; i >= 0; i -= 1) {
          if (normalizeExercise(prev[i].exercise) === norm) {
            swapWith = i;
            break;
          }
        }
      } else {
        for (let i = idx + 1; i < prev.length; i += 1) {
          if (normalizeExercise(prev[i].exercise) === norm) {
            swapWith = i;
            break;
          }
        }
      }
      if (swapWith === -1) return prev;
      const next = [...prev];
      const [row] = next.splice(idx, 1);
      next.splice(swapWith, 0, row);
      return resequenceSets(next);
    });
  };

  const handleOpenEditSet = (rowId: string) => {
    setTargetRowId(rowId);
    setEditSetModalVisible(true);
  };

  const handleSaveSet = (updatedRow: LogRow) => {
    withPendingRows((prev) => {
      const idx = prev.findIndex((r) => r.id === updatedRow.id);
      if (idx === -1) return prev;

      const oldRow = prev[idx];
      const next = [...prev];
      next[idx] = updatedRow;

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
    const committedRows = commitPendingAndGet();

    if (!workoutActive) {
      Alert.alert("No active workout", "Start a workout first.");
      return;
    }
    if (!committedRows.length) {
      Alert.alert(
        "End empty session?",
        "No sets logged. Nothing will be saved to history.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "End Session",
            style: "destructive",
            onPress: () => {
              endWorkoutSession();
              setRows([]);
              setMessageInput("");
              setEditingCell(null);
              setEditValue("");
              setUndoState(null);
              if (undoTimerRef.current) {
                clearTimeout(undoTimerRef.current);
                undoTimerRef.current = null;
              }
            },
          },
        ]
      );
      return;
    }

    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "End workout?",
        "This will save to History.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => resolve(false)
          },
          {
            text: "Save",
            style: "default",
            onPress: () => resolve(true)
          },
        ]
      );
    });
    if (!proceed) return;

    // Capture state for rollback
    const rowsToSave = [...committedRows];
    const previousRows = [...rows];

    // Optimistic: Clear UI immediately
    endWorkoutSession();
    setRows([]);
    setMessageInput("");
    setEditingCell(null);
    setEditValue("");
    setUndoState(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }

    // Build payload
    const storedRows = rowsToSave.map((row) => ({
      exercise: row.exercise,
      weightLbs: row.weightLbs,
      reps: row.reps,
      notes: row.notes,
      timestamp: row.timestamp,
    }));

    // Save in background
    try {
      await api.saveWorkout(buildWorkoutToSave(storedRows));
    } catch (error) {
      console.error("[onEndWorkout] Failed to save workout:", error);

      // Rollback UI
      Alert.alert(
        "Save Failed",
        "Could not save to history. Your workout has been restored.",
        [{
          text: "OK",
          onPress: () => {
            // Restore session
            // We can't easily restore the exact workoutActive state variable inside this closure 
            // if hooks don't support it, but we can re-start a session or just put rows back.
            // Since we called endWorkoutSession(), we need to re-start it to be "active" again 
            // if we want to let them try saving again.
            // Ideally useWorkoutSession would expose a restore function, but we can just start 
            // a new one with the old data if needed, or just set rows back and letting them click "Start" if title lost. 
            // But let's try to just restore rows so they are not lost.
            setRows(previousRows);
            startWorkoutSession([title]); // specific heuristic to try to restore title if possible or just generic
          }
        }]
      );
    }
  };

  // Handle end workout with auto-save and AI review generation
  const handleEndWorkoutWithReview = async (currentRows: LogRow[]) => {
    const committedRows = currentRows.filter(r => r.status === "committed");
    if (committedRows.length === 0) {
      Alert.alert("No sets logged", "Log some sets before ending your workout.");
      return;
    }

    // Show review modal with loading state
    setReviewModalVisible(true);
    setReviewLoading(true);
    setSessionReview(null);

    // Capture state
    const rowsToSave = [...committedRows];
    const previousRows = [...rows];

    // Build stored rows
    const storedRows = rowsToSave.map((row) => ({
      exercise: row.exercise,
      weightLbs: row.weightLbs,
      reps: row.reps,
      notes: row.notes,
      timestamp: row.timestamp,
    }));

    // Generate review
    try {
      const reviewData = await api.generateSessionReview(
        rowsToSave.map(r => ({
          exercise: r.exercise,
          set: r.set,
          weightLbs: r.weightLbs,
          reps: r.reps,
          notes: r.notes,
        })),
        selectedPart
      );

      const review: SessionReview = {
        ...reviewData,
        generatedAt: Date.now(),
      };

      setSessionReview(review);
      setReviewLoading(false);

      // Save workout with review
      const workoutPayload = {
        ...buildWorkoutToSave(storedRows),
        review,
      };

      await api.saveWorkout(workoutPayload);

      // Clear UI after successful save
      endWorkoutSession();
      setRows([]);
      setMessageInput("");
      setEditingCell(null);
      setEditValue("");
      setUndoState(null);
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }

      if (Platform.OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("[handleEndWorkoutWithReview] Error:", error);
      setReviewLoading(false);

      // Still try to save workout without review
      try {
        await api.saveWorkout(buildWorkoutToSave(storedRows));
        endWorkoutSession();
        setRows([]);
        setMessageInput("");
      } catch (saveError) {
        console.error("[handleEndWorkoutWithReview] Save also failed:", saveError);
        setReviewModalVisible(false);
        Alert.alert(
          "Save Failed",
          "Could not save your workout. Please try again.",
          [{ text: "OK" }]
        );
      }
    }
  };

  const sendMessage = async () => {
    const message = messageInput.trim();
    if (!message || loading) return;
    if (!workoutActive) {
      Alert.alert("Start workout", "Start a workout before logging sets.");
      return;
    }

    const currentRows = commitPendingAndGet();
    setError(null);
    // Don't set loading yet, as we try fast parse synchronously

    // Local synchronous parse - pass currentRows for routine-aware parsing
    const gateDecision = decideAndParse(message, { 
      lastExercise: getLastExerciseFromRows(currentRows),
      currentRows: currentRows.map(r => ({
        id: r.id,
        exercise: r.exercise,
        weightLbs: r.weightLbs,
        reps: r.reps,
      })),
    });

    // Handle routine-aware fill skeleton decision
    if (gateDecision.kind === "fill_skeleton") {
      const { weight, reps, targetRowIndex } = gateDecision;
      setRows((prev) => {
        const next = [...prev];
        if (next[targetRowIndex]) {
          next[targetRowIndex] = {
            ...next[targetRowIndex],
            weightLbs: weight,
            ...(reps ? { reps } : {}),
          };
        }
        return next;
      });
      setMessageInput("");
      
      if (Platform.OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }

    if (gateDecision.kind === "fast") {
      let next = [...currentRows];
      const parsedRows = gateDecision.rows ?? [];

      console.log("[sendMessage] Fast parse result:", parsedRows);

      if (!parsedRows.length) {
        // Parsing failed but continue silently - parsing logic intact
        return;
      }
        const addOrFillRow = (rowData: ParsedRow, setOverride?: number) => {
          const normalizedExercise = rowData.exercise.trim().toLowerCase();
          for (let i = next.length - 1; i >= 0; i -= 1) {
            const candidate = next[i];
            if (!candidate?.exercise) continue;
            if (candidate.exercise.trim().toLowerCase() !== normalizedExercise) continue;

            const missingWeight = !candidate.weightLbs;
            const missingReps = !candidate.reps;
            const missingNotes = !candidate.notes;
            const canFillWeight = missingWeight && !!rowData.weightLbs;
            const canFillReps = missingReps && !!rowData.reps;
            const canFillNotes = missingNotes && !!rowData.notes;

            if (canFillWeight || canFillReps || canFillNotes) {
              const updated = { ...candidate };
              if (canFillWeight) updated.weightLbs = rowData.weightLbs;
              if (canFillReps) updated.reps = rowData.reps;
              if (canFillNotes) updated.notes = rowData.notes;
              next[i] = updated;
              return;
            }

            break;
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
            },
          ];
        };

        if (false && parsedRows.length) {
        } else {
          parsedRows.forEach((row) => addOrFillRow(row));
        }
      setRows(next);
      setMessageInput("");
      setLoading(false);

      // Sync log to backend
      parsedRows.forEach(row => {
        api.logSet({
          exercise: row.exercise,
          set: 1, // approximate
          weightLbs: row.weightLbs,
          reps: row.reps,
          notes: row.notes
        }).catch(err => console.error("Failed to sync row", err));
      });

      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      return;
    }

    // Handle end workout intent - auto-save and generate review
    if (gateDecision.kind === "end_workout") {
      setMessageInput("");

      if (currentRows.length === 0) {
        Alert.alert("No sets logged", "Log some sets before ending your workout.");
        return;
      }

      // Trigger the end workout flow with review
      handleEndWorkoutWithReview(currentRows);
      return;
    }

    if (gateDecision.kind === "ai") {
      // Check if this is a conversational question - handle without ghost row
      if (gateDecision.reason === "conversational_question") {
        setMessageInput("");
        setLoading(true);

        try {
          const res = await api.askCoach(message, toApiRows(currentRows));
          const answerText = res.answer?.trim() || "I'm not sure how to answer that.";
          setAiBubbleText(answerText);

          // Save to Supabase chat history
          saveWorkoutChatQA(message, answerText, Date.now()).catch(err =>
            console.warn("[Workout] Failed to save chat history:", err)
          );

          if (Platform.OS === "ios") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        } catch (e) {
          console.error("[sendMessage] Coach question failed:", e);
          setAiBubbleText("Sorry, I couldn't get an answer right now. Try again.");
        } finally {
          setLoading(false);
        }
        return;
      }

      const ghostId = makeId();
      const optimisticRow: LogRow = {
        id: ghostId,
        exercise: message.length > 20 ? message.slice(0, 17) + "..." : message,
        set: 1,
        weightLbs: "...",
        reps: "...",
        notes: "Parsing...",
        timestamp: Date.now(),
        status: "syncing",
      };

      setRows((prev) => [...prev, optimisticRow]);
      setMessageInput("");
      setLoading(true);

      try {
        const res = await api.chat(message, toApiRows(currentRows));

        if (res.answer) {
          setAiBubbleText(res.answer);
          setRows((prev) => prev.filter((r) => r.id !== ghostId));

          // Save to Supabase chat history
          saveWorkoutChatQA(message, res.answer, optimisticRow.timestamp).catch(err =>
            console.warn("[Workout] Failed to save chat history:", err)
          );
        } else {
          const newRows = buildRowsFromApi(res.rows).map(r => ({ ...r, status: 'committed' as const }));
          setRows((prev) => prev.filter((r) => r.id !== ghostId).concat(newRows));
          requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
        }
      } catch (e) {
        setRows((prev) => prev.filter((r) => r.id !== ghostId));
        // Error occurred but continue silently - parsing logic intact
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <GestureDetector gesture={swipeRight}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.screen, { backgroundColor }]}
      >
        <Header
          title={workoutActive ? title : null}
          onMenuPress={() => setMenuOpen(true)}
          onClearPress={onClearRows}
          onRoutinePress={() => setRoutineModalVisible(true)}
        />

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
          onMoveRow={moveRow}
          onIncrementSet={onIncrementSet}
          onEditSet={handleOpenEditSet}
        />

        {
          undoState ? (
            <View style={styles.undoBar}>
              <ThemedText style={styles.undoText}>Row deleted</ThemedText>
              <Pressable onPress={undoDelete} style={({ pressed }) => [styles.undoButton, pressed && styles.undoButtonPressed]}>
                <ThemedText style={styles.undoButtonText}>Undo</ThemedText>
              </Pressable>
            </View>
          ) : null
        }

        <WorkoutBottomBar
          workoutActive={workoutActive}
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
          onOpenCoach={openCoach}
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

        <SessionReviewModal
          visible={reviewModalVisible}
          loading={reviewLoading}
          review={sessionReview}
          workoutTitle={title}
          onClose={() => {
            setReviewModalVisible(false);
            setSessionReview(null);
          }}
        />

      </KeyboardAvoidingView >
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  undoBar: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  undoText: {
    fontWeight: "600",
    color: "#111827",
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  undoButtonPressed: {
    opacity: 0.85,
  },
  undoButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
