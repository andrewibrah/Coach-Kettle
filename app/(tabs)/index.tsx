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

import { CoachModal } from "@/components/modals/CoachModal";
import { MenuModal } from "@/components/modals/MenuModal";
import { WorkoutNameModal } from "@/components/modals/WorkoutNameModal";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { WorkoutBottomBar } from "@/components/workout/WorkoutBottomBar";
import { WorkoutTable } from "@/components/workout/WorkoutTable";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import { api, type ApiWorkoutRow } from "@/lib/api";
import { decideAndParse } from "@/lib/structuredGate";
import { getLastExerciseFromRows, makeId, nextSetNumberForExercise } from "@/lib/workoutRules";
import { type LogRow } from "@/types/workout";
import { useThemeColor } from "../../hooks/use-theme-color";

type ParsedRow = {
  exercise: string;
  weightLbs: string;
  reps: string;
  notes: string;
  kind?: string;
};

type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const backgroundColor = useThemeColor({}, 'background');

  const scrollRef = useRef<ScrollView | null>(null);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [undoState, setUndoState] = useState<{ row: LogRow; index: number } | null>(null);
  const [messageInput, setMessageInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; reason?: string } | null>(null);

  const [startToastOpen, setStartToastOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachQuestion, setCoachQuestion] = useState("");
  const [coachAnswer, setCoachAnswer] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const { workoutActive, title, startWorkoutSession, endWorkoutSession, buildWorkoutToSave } = useWorkoutSession({
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
      const res = await api.askCoach(q, toApiRows(rows));
      setCoachAnswer(res.answer?.trim() || "Coach had no response.");
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
    startWorkoutSession([name]);
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

  const normalizeExercise = (value: string) => value.trim().toLowerCase();

  const resequenceSets = (list: LogRow[]) => {
    const counters: Record<string, number> = {};
    return list.map((row) => {
      const norm = normalizeExercise(row.exercise);
      const nextSet = (counters[norm] || 0) + 1;
      counters[norm] = nextSet;
      return { ...row, set: nextSet };
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

  const onEndWorkout = async () => {
    console.log("[onEndWorkout] Called");
    const committedRows = commitPendingAndGet();
    console.log("[onEndWorkout] Committed rows count:", committedRows.length);
    if (!workoutActive) {
      console.log("[onEndWorkout] No active workout, showing alert");
      Alert.alert("No active workout", "Start a workout first.");
      return;
    }
    if (!committedRows.length) {
      console.log("[onEndWorkout] No rows, showing empty session alert");
      Alert.alert(
        "End empty session?",
        "No sets logged. Nothing will be saved to history.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "End Session",
            style: "destructive",
            onPress: () => {
              console.log("[onEndWorkout] User pressed 'End Session' for empty workout");
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

    console.log("[onEndWorkout] Has rows, showing save confirmation alert");
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "End workout?",
        "This will save to History.",
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              console.log("[onEndWorkout] User pressed Cancel");
              resolve(false);
            }
          },
          {
            text: "Save",
            style: "default",
            onPress: () => {
              console.log("[onEndWorkout] User pressed Save");
              resolve(true);
            }
          },
        ]
      );
    });
    if (!proceed) {
      console.log("[onEndWorkout] User cancelled, not proceeding");
      return;
    }

    console.log("[onEndWorkout] Building stored rows");
    const storedRows = committedRows.map((row) => ({
      exercise: row.exercise,
      weightLbs: row.weightLbs,
      reps: row.reps,
      notes: row.notes,
      timestamp: row.timestamp,
    }));

    try {
      console.log("[onEndWorkout] Attempting to save workout via API");
      await api.saveWorkout(buildWorkoutToSave(storedRows));
      console.log("[onEndWorkout] Workout saved successfully");
    } catch (error) {
      console.error("[onEndWorkout] Failed to save workout:", error);
      Alert.alert(
        "Save Failed",
        "Could not save to history. The session will still end. Check that the backend is running.",
        [{ text: "OK" }]
      );
    }

    console.log("[onEndWorkout] About to call endWorkoutSession()");
    endWorkoutSession();
    console.log("[onEndWorkout] endWorkoutSession() called, workoutActive should now be false");

    // Check workoutActive value after state update
    setTimeout(() => {
      console.log("[onEndWorkout] workoutActive value after timeout:", workoutActive);
    }, 100);

    setRows([]);
    setMessageInput("");
    setEditingCell(null);
    setEditValue("");
    setUndoState(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    console.log("[onEndWorkout] All state reset complete");
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

    // Local synchronous parse
    const gateDecision = decideAndParse(message, { lastExercise: getLastExerciseFromRows(currentRows) });

    if (gateDecision.kind === "ai" && gateDecision.userHint) {
      setError({ message: gateDecision.userHint });
      setLoading(false);
    }

    if (gateDecision.kind === "fast") {
      let next = [...currentRows];
      const parsedRows = gateDecision.rows ?? [];

      console.log("[sendMessage] Fast parse result:", parsedRows);

      if (!parsedRows.length) {
        setError({ message: "Could not parse details", reason: "Try format: Squat 100 10" });
        return;
      }

      if (parsedRows.length) {
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
            },
          ];
        };

        if (false && parsedRows.length) {
        } else {
          parsedRows.forEach((row) => addOrFillRow(row));
        }
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

    if (gateDecision.kind === "ai") {
      setError({
        message: "Need clarification",
        reason: gateDecision.userHint,
      });
      // No loading set, instant feedback
      return;
    }

    // Fallback to AI Chat if local parse failed but no specific error reason
    setLoading(true);
    try {
      const contextRows: ApiWorkoutRow[] = toApiRows(currentRows);
      const res = await api.chat(message, contextRows);
      const newRows = buildRowsFromApi(res.rows);

      if (!newRows.length) {
        setError({ message: "No rows returned", reason: "Try Exercise Weight Reps format." });
        setLoading(false);
        return;
      }

      // Sync new rows from AI to backend
      newRows.forEach(row => {
        api.logSet({
          exercise: row.exercise,
          set: row.set,
          weightLbs: row.weightLbs,
          reps: row.reps,
          notes: row.notes
        }).catch(err => console.error("Failed to sync row", err));
      });

      setRows((prev) => [...prev, ...newRows]);
      setMessageInput("");
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError({ message: "Failed to reach API", reason: "Check connection and retry." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { backgroundColor }]}
    >
      <ThemedView style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable onPress={() => setMenuOpen(true)} style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}>
            <IconSymbol name="line.3.horizontal" size={24} color={isDark ? "#FFF" : "#000"} />
          </Pressable>

          <Pressable onPress={onClearRows} style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}>
            <IconSymbol name="trash" size={24} color={isDark ? "#FFF" : "#000"} />
          </Pressable>
        </View>
      </ThemedView>

      <WorkoutTable
        rows={rows}
        compact={compact}
        isDark={isDark}
        scrollRef={scrollRef}
        editingCell={editingCell}
        editValue={editValue}
        onBeginEditCell={beginCellEdit}
        onChangeEditValue={setEditValue}
        onCommitEditCell={commitCellEdit}
        onDeleteRow={deleteRow}
        onDuplicateRow={duplicateRow}
        onMoveRow={moveRow}
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
        error={error?.message ?? null}
        aiReason={error?.reason}
      />

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

      <MenuModal
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigateHistory={() => router.push("/history")}
        onOpenCoach={openCoach}
      />

      <WorkoutNameModal
        visible={nameModalVisible}
        onClose={() => setNameModalVisible(false)}
        onConfirm={confirmStartWorkout}
      />
    </KeyboardAvoidingView >
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 12,
  },
  header: {
    marginBottom: 10,
  },

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuButton: {
    padding: 8,
    marginTop: 40,
  },
  menuButtonPressed: {
    opacity: 0.7,
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
