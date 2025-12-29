import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";

import { useRouter } from "expo-router";

import { BodyPartPickerModal } from "@/components/BodyPartPickerModal";
import { WorkoutBottomBar } from "@/components/WorkoutBottomBar";
import { WorkoutTable } from "@/components/WorkoutTable";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { api, type ApiWorkoutRow } from "@/lib/api";
import { decideAndParse } from "@/lib/structuredGate";
import { getLastExerciseFromRows, makeId, nextSetNumberForExercise } from "@/lib/workoutRules";
import { saveWorkout, type WorkoutRow as StoredWorkoutRow } from "@/lib/workoutStorage";
import { useWorkoutSession } from "@/hooks/useWorkoutSession";
import type { BodyPart, LogRow } from "@/types/workout";

const BODY_PARTS: BodyPart[] = ["Legs", "Abs", "Chest", "Back", "Bis", "Tris", "Shoulders"];

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width } = useWindowDimensions();
  const compact = width < 380;

  const scrollRef = useRef<ScrollView | null>(null);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [messageInput, setMessageInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftBodyParts, setDraftBodyParts] = useState<BodyPart[]>([]);

  const [startToastOpen, setStartToastOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onResetForNewDay = useCallback((_nextDate: string) => {
    setRows([]);
    setMessageInput("");
    setLoading(false);
    setError(null);
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
    };
  }, []);

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
    setPickerOpen(false);
  };

  const onClearRows = () => {
    if (!rows.length) return;
    Alert.alert(
      "Clear table?",
      "This will remove all sets in the current session.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: () => setRows([]) },
      ]
    );
  };

  const onEndWorkout = async () => {
    if (!workoutActive) {
      Alert.alert("No active workout", "Start a workout first.");
      return;
    }
    if (!rows.length) {
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

    const storedRows: StoredWorkoutRow[] = rows.map((row) => ({
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
  };

  const sendMessage = async () => {
    const message = messageInput.trim();
    if (!message || loading) return;
    if (!workoutActive) {
      Alert.alert("Start workout", "Start a workout before logging sets.");
      return;
    }

    setError(null);

    const gateDecision = decideAndParse(message, { lastExercise: getLastExerciseFromRows(rows) });

    if (gateDecision.kind === "fast") {
      setRows((prev) => {
        const normalizedExercise = gateDecision.row.exercise.trim().toLowerCase();
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          const candidate = prev[i];
          if (!candidate?.exercise) continue;
          if (candidate.exercise.trim().toLowerCase() !== normalizedExercise) continue;

          const missingWeight = !candidate.weightLbs;
          const missingReps = !candidate.reps;
          const missingNotes = !candidate.notes;
          const canFillWeight = missingWeight && !!gateDecision.row.weightLbs;
          const canFillReps = missingReps && !!gateDecision.row.reps;
          const canFillNotes = missingNotes && !!gateDecision.row.notes;

          if (canFillWeight || canFillReps || canFillNotes) {
            const updated = { ...candidate };
            if (canFillWeight) updated.weightLbs = gateDecision.row.weightLbs;
            if (canFillReps) updated.reps = gateDecision.row.reps;
            if (canFillNotes) updated.notes = gateDecision.row.notes;
            const nextRows = [...prev];
            nextRows[i] = updated;
            return nextRows;
          }

          break;
        }

        const nextSet = nextSetNumberForExercise(prev, gateDecision.row.exercise);
        return [
          ...prev,
          {
            id: makeId(),
            exercise: gateDecision.row.exercise,
            set: nextSet,
            weightLbs: gateDecision.row.weightLbs,
            reps: gateDecision.row.reps,
            notes: gateDecision.row.notes,
          },
        ];
      });
      setMessageInput("");
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
      return;
    }

    setLoading(true);
    try {
      const contextRows: ApiWorkoutRow[] = rows.map((row) => ({
        exercise: row.exercise,
        set: row.set,
        weightLbs: row.weightLbs,
        reps: row.reps,
        notes: row.notes,
      }));
      const res = await api.chat(message, contextRows);
      let newRows: LogRow[] = [];
      setRows((prev) => {
        newRows = buildRowsFromApi(res.rows);
        return newRows.length ? [...prev, ...newRows] : prev;
      });

      if (newRows.length === 0) {
        setError("No rows returned");
        return;
      }

      setMessageInput("");
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError("Failed to reach API");
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
      </ThemedView>

      <WorkoutTable rows={rows} compact={compact} isDark={isDark} scrollRef={scrollRef} />

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
        error={error}
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
});
