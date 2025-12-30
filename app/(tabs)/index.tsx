import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  Platform,
  ScrollView,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";

import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { BodyPartPickerModal } from "@/components/BodyPartPickerModal";
import { CoachModal } from "@/components/CoachModal";
import { WorkoutBottomBar } from "@/components/WorkoutBottomBar";
import { WorkoutTable } from "@/components/WorkoutTable";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { api, type ApiWorkoutRow } from "@/lib/api";
import { decideAndParse, type ParsedRow } from "@/lib/structuredGate";
import { getLastExerciseFromRows, makeId, nextSetNumberForExercise } from "@/lib/workoutRules";
import { saveWorkout, type WorkoutRow as StoredWorkoutRow } from "@/lib/workoutStorage";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import type { BodyPart, LogRow } from "@/types/workout";

const BODY_PARTS: BodyPart[] = ["Legs", "Abs", "Chest", "Back", "Bis", "Tris", "Shoulders"];
type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width } = useWindowDimensions();
  const compact = width < 380;

  const scrollRef = useRef<ScrollView | null>(null);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: EditableField } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [undoState, setUndoState] = useState<{ row: LogRow; index: number } | null>(null);
  const [messageInput, setMessageInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; reason?: string } | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftBodyParts, setDraftBodyParts] = useState<BodyPart[]>([]);

  const [startToastOpen, setStartToastOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachQuestion, setCoachQuestion] = useState("");
  const [coachAnswer, setCoachAnswer] = useState<string | null>(null);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
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
    setDraftBodyParts([]);
    setPickerOpen(true);
  };

  const startWorkoutWithParts = (parts: BodyPart[]) => {
    startWorkoutSession(parts);
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
    setPickerOpen(false);
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
    const committedRows = commitPendingAndGet();
    if (!workoutActive) {
      Alert.alert("No active workout", "Start a workout first.");
      return;
    }
    if (!committedRows.length) {
      Alert.alert("Nothing to save", "Log at least one set first.");
      return;
    }

    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "End workout?",
        "This will save to History.",
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Save", style: "default", onPress: () => resolve(true) },
        ]
      );
    });
    if (!proceed) return;

    const storedRows: StoredWorkoutRow[] = committedRows.map((row) => ({
      exercise: row.exercise,
      weightLbs: row.weightLbs,
      reps: row.reps,
      notes: row.notes,
    }));

    await saveWorkout(buildWorkoutToSave(storedRows));

    Alert.alert("Saved", "Workout added to History.");
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

    const gateDecision = decideAndParse(message, { lastExercise: getLastExerciseFromRows(currentRows) });

    if (gateDecision.kind === "ai" && gateDecision.userHint) {
      setError({ message: gateDecision.userHint });
    }

    if (gateDecision.kind === "fast") {
      let next = [...currentRows];
      const parsedRows = gateDecision.rows ?? [];
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
            },
          ];
        };

        if (gateDecision.meta?.pattern === "dropset" && parsedRows.length) {
          const baseSet = nextSetNumberForExercise(next, parsedRows[0].exercise);
          parsedRows.forEach((row, idx) => addOrFillRow(row, baseSet + (idx + 1) / 10));
        } else {
          parsedRows.forEach((row) => addOrFillRow(row));
        }
      }
      setRows(next);
      setMessageInput("");
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      return;
    }

    if (gateDecision.kind === "ai") {
      setError({
        message: "Need clarification",
        reason: gateDecision.userHint,
      });
      return;
    }

    setLoading(true);
    try {
      const contextRows: ApiWorkoutRow[] = toApiRows(currentRows);
      const res = await api.chat(message, contextRows);
      const newRows = buildRowsFromApi(res.rows);

      if (!newRows.length) {
        setError({ message: "No rows returned", reason: "Try Exercise Weight Reps format." });
        return;
      }

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
      style={styles.screen}
    >
      <ThemedView style={styles.header}>
        <Image
          source={require("@/assets/images/partial-react-logo.png")}
          style={styles.headerImage}
        />

        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.titleText}>
            {title}
          </ThemedText>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={openCoach}
            style={({ pressed }) => [styles.coachButton, pressed && styles.coachButtonPressed]}
          >
            <ThemedText style={styles.coachButtonText}>Ask Coach</ThemedText>
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

      {undoState ? (
        <View style={styles.undoBar}>
          <ThemedText style={styles.undoText}>Row deleted</ThemedText>
          <Pressable onPress={undoDelete} style={({ pressed }) => [styles.undoButton, pressed && styles.undoButtonPressed]}>
            <ThemedText style={styles.undoButtonText}>Undo</ThemedText>
          </Pressable>
        </View>
      ) : null}

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

      <BodyPartPickerModal
        visible={pickerOpen}
        isDark={isDark}
        BODY_PARTS={BODY_PARTS}
        draftBodyParts={draftBodyParts}
        setDraftBodyParts={setDraftBodyParts}
        onCancel={() => setPickerOpen(false)}
        onStart={() => startWorkoutWithParts(draftBodyParts)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 10,
  },
  headerImage: {
    height: 56,
    width: 160,
    alignSelf: "center",
    marginBottom: 6,
  },
  titleRow: {
    gap: 10,
  },
  titleText: {
    textAlign: "center",
  },
  headerActions: {
    marginTop: 6,
    alignItems: "flex-end",
  },
  coachButton: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#111827",
  },
  coachButtonPressed: {
    opacity: 0.9,
  },
  coachButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
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
