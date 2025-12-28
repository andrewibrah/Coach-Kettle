import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Button,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { api, type ApiWorkoutRow } from "@/lib/api";
import { saveWorkout, type WorkoutRow as StoredWorkoutRow } from "@/lib/workoutStorage";
import { useRouter } from "expo-router";

type BodyPart =
  | "Push"
  | "Pull"
  | "Legs"
  | "Abs"
  | "Chest"
  | "Back"
  | "Bis"
  | "Tris"
  | "Shoulders"
  | "Cardio";

type LogRow = {
  id: string;
  exercise: string;
  set: number;
  weightLbs: string; // keep as string for input friendliness; display as-is
  reps: string;
  notes: string;
};

function getTodayMMDD(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  // Session header state
  const [sessionDate, setSessionDate] = useState<string>(getTodayMMDD());
  const [bodyParts, setBodyParts] = useState<BodyPart[]>([]);

  // Table rows (in-memory only for now)
  const [rows, setRows] = useState<LogRow[]>([]);

  // Workout session lifecycle
  const [workoutActive, setWorkoutActive] = useState(false);
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [workoutCreatedAt, setWorkoutCreatedAt] = useState<number | null>(null);
  const [workoutDateISO, setWorkoutDateISO] = useState<string | null>(null);

  // Message input
  const [messageInput, setMessageInput] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Body part picker (single select on start)
  const [pickerOpen, setPickerOpen] = useState(false);
  const BODY_PARTS: BodyPart[] = useMemo(
    () => [
      "Push",
      "Pull",
      "Legs",
      "Abs",
      "Chest",
      "Back",
      "Bis",
      "Tris",
      "Shoulders",
      "Cardio",
    ],
    []
  );

  const scrollRef = useRef<ScrollView>(null);

  const title = useMemo(() => {
    const bp = bodyParts.length ? `${bodyParts.join(" + ")} ` : "";
    return `${sessionDate} ${bp}Workout`;
  }, [sessionDate, bodyParts]);

  const selectedPart = useMemo(
    () => (bodyParts.length ? bodyParts.join(" + ") : ""),
    [bodyParts]
  );

  const resetForNewDay = (nextDate: string) => {
    // Automated daily rollover:
    // - Update date
    // - Clear body part back to blank
    // - Clear current table rows
    // - Clear inputs
    setSessionDate(nextDate);
    setBodyParts([]);
    setRows([]);
    setMessageInput("");
    setLoading(false);
    setError(null);
    setWorkoutActive(false);
    setWorkoutId(null);
    setWorkoutCreatedAt(null);
    setWorkoutDateISO(null);
  };

  const ensureFreshSession = () => {
    const today = getTodayMMDD();
    if (today !== sessionDate) resetForNewDay(today);
  };

  useEffect(() => {
    // 1) If the app sits open past midnight, we still want rollover.
    //    A short interval is a low-risk approach without requiring DB/auth.
    const interval = setInterval(() => {
      ensureFreshSession();
    }, 30_000);

    // 2) If the app is backgrounded and resumed next day.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") ensureFreshSession();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDate]);

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
    setPickerOpen(true);
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

    const storedRows: StoredWorkoutRow[] = rows.map((row) => ({
      exercise: row.exercise,
      weightLbs: row.weightLbs,
      reps: row.reps,
      notes: row.notes,
    }));

    await saveWorkout({
      id: workoutId ?? makeId(),
      dateISO: workoutDateISO ?? todayISO(),
      part: selectedPart.trim() || "Workout",
      rows: storedRows,
      createdAt: workoutCreatedAt ?? Date.now(),
    });

    Alert.alert("Saved", "Workout added to History.");
    setWorkoutActive(false);
    setWorkoutId(null);
    setWorkoutCreatedAt(null);
    setWorkoutDateISO(null);
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

    setLoading(true);
    setError(null);

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

      {/* Table */}
      <ThemedView style={styles.tableWrap}>
        <View style={[styles.row, styles.headerRow, isDark && styles.headerRowDark]}>
          <ThemedText
            style={[
              styles.cell,
              styles.exerciseCol,
              styles.headerCell,
              isDark ? styles.headerCellDark : styles.headerCellLight,
            ]}
          >
            Exercise
          </ThemedText>
          <ThemedText
            style={[
              styles.cell,
              styles.setCol,
              styles.headerCell,
              isDark ? styles.headerCellDark : styles.headerCellLight,
            ]}
          >
            Set
          </ThemedText>
          <ThemedText
            style={[
              styles.cell,
              styles.weightCol,
              styles.headerCell,
              isDark ? styles.headerCellDark : styles.headerCellLight,
            ]}
          >
            Weight (lbs)
          </ThemedText>
          <ThemedText
            style={[
              styles.cell,
              styles.repsCol,
              styles.headerCell,
              isDark ? styles.headerCellDark : styles.headerCellLight,
            ]}
          >
            Reps
          </ThemedText>
          <ThemedText
            style={[
              styles.cell,
              styles.notesCol,
              styles.headerCell,
              isDark ? styles.headerCellDark : styles.headerCellLight,
            ]}
          >
            Notes
          </ThemedText>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.tableBody}
          contentContainerStyle={styles.tableBodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {rows.length === 0 ? (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyText}>
                Add your first set below.
              </ThemedText>
            </View>
          ) : (
            rows.map((r, idx) => (
              <View
                key={r.id}
                style={[styles.row, idx % 2 === 0 ? styles.evenRow : styles.oddRow]}
              >
                <ThemedText style={[styles.cell, styles.exerciseCol]}>{r.exercise}</ThemedText>
                <ThemedText style={[styles.cell, styles.setCol]}>{String(r.set)}</ThemedText>
                <ThemedText style={[styles.cell, styles.weightCol]}>{r.weightLbs || "—"}</ThemedText>
                <ThemedText style={[styles.cell, styles.repsCol]}>{r.reps || "—"}</ThemedText>
                <ThemedText style={[styles.cell, styles.notesCol]}>{r.notes || ""}</ThemedText>
              </View>
            ))
          )}
        </ScrollView>
      </ThemedView>

      {/* Message input */}
      <View style={styles.inputWrap}>
        <View style={styles.inputGrid}>
          <TextInput
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder="e.g. Leg press 4 plates 10 reps"
            style={[styles.input, styles.messageInput]}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
        </View>

        <View style={styles.actionsRow}>
          <Button
            title={loading ? "Sending..." : "Send"}
            onPress={sendMessage}
            disabled={loading || !messageInput.trim()}
          />
          <Button title="Clear" onPress={() => setRows([])} />
        </View>

        <View style={styles.sessionRow}>
          <Pressable onPress={() => router.push("/history")} style={styles.sessionButton}>
            <Text style={styles.sessionButtonText}>History</Text>
          </Pressable>
          <Pressable
            onPress={onStartWorkout}
            style={[styles.sessionButton, workoutActive && styles.sessionButtonDisabled]}
            disabled={workoutActive}
          >
            <Text style={styles.sessionButtonText}>Start workout</Text>
          </Pressable>
          <Pressable
            onPress={onEndWorkout}
            style={[styles.sessionButton, !workoutActive && styles.sessionButtonDisabled]}
            disabled={!workoutActive}
          >
            <Text style={styles.sessionButtonText}>End workout</Text>
          </Pressable>
        </View>

        {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}

        <ThemedText style={styles.hint}>
          {`Tip: include exercise, weight, reps, and notes in one message.`}
        </ThemedText>
      </View>

      {/* Body part picker modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable
            style={[styles.modalCard, isDark && styles.modalCardDark]}
            onPress={() => {}}
          >
            <ThemedText
              type="title"
              style={[
                styles.modalTitle,
                isDark ? styles.modalTextDark : styles.modalTextLight,
              ]}
            >
              What body part are you training
            </ThemedText>

            <ScrollView contentContainerStyle={styles.modalList}>
              {BODY_PARTS.map((bp) => {
                return (
                  <Pressable
                    key={bp}
                    onPress={() => {
                      setBodyParts([bp]);
                      setWorkoutActive(true);
                      setWorkoutId(makeId());
                      setWorkoutCreatedAt(Date.now());
                      setWorkoutDateISO(todayISO());
                      setRows([]);
                      setMessageInput("");
                      setError(null);
                      setPickerOpen(false);
                    }}
                    style={[styles.modalItem, isDark && styles.modalItemDark]}
                  >
                    <View style={styles.modalItemRow}>
                      <ThemedText
                        style={[
                          styles.modalItemText,
                          isDark ? styles.modalTextDark : styles.modalTextLight,
                        ]}
                      >
                        {bp}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
    height: 100,
    width: 200,
    alignSelf: "center",
    marginBottom: 8,
  },
  titleRow: {
    gap: 10,
  },
  titleText: {
    textAlign: "center",
  },
  tableWrap: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 12,
    overflow: "hidden",
  },
  tableBody: {
    flex: 1,
  },
  tableBodyContent: {
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
  },
  headerRow: {
    backgroundColor: "#F6F6F6",
    borderBottomColor: "#E6E6E6",
  },
  headerRowDark: {
    backgroundColor: "#111827",
    borderBottomColor: "#374151",
  },
  evenRow: {
    backgroundColor: "#FFFFFF",
  },
  oddRow: {
    backgroundColor: "#FAFAFA",
  },
  cell: {
    fontSize: 13,
    paddingRight: 8,
  },
  headerCell: {
    fontSize: 12,
    fontWeight: "700",
  },
  headerCellLight: {
    color: "#111827",
  },
  headerCellDark: {
    color: "#F9FAFB",
  },
  exerciseCol: {
    flex: 2.4,
  },
  setCol: {
    flex: 0.8,
    textAlign: "center",
  },
  weightCol: {
    flex: 1.2,
    textAlign: "center",
  },
  repsCol: {
    flex: 1.1,
    textAlign: "center",
  },
  notesCol: {
    flex: 1.5,
  },
  emptyState: {
    padding: 16,
  },
  emptyText: {
    opacity: 0.7,
  },

  inputWrap: {
    marginTop: 10,
    gap: 10,
  },
  inputGrid: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D6D6D6",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
  },
  messageInput: {
    flex: 1,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  sessionRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "center",
  },
  sessionButton: {
    borderWidth: 1,
    borderColor: "#D0D0D0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  sessionButtonDisabled: {
    opacity: 0.5,
  },
  sessionButtonText: {
    fontSize: 14,
  },
  errorText: {
    color: "#B00020",
  },
  hint: {
    opacity: 0.7,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    maxHeight: "70%",
  },
  modalCardDark: {
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  modalTitle: {
    marginBottom: 10,
    textAlign: "center",
  },
  modalList: {
    gap: 8,
    paddingBottom: 6,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    borderRadius: 12,
  },
  modalItemDark: {
    borderColor: "#334155",
    backgroundColor: "#111827",
  },
  modalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalItemText: {
    fontSize: 16,
  },
  modalTextLight: {
    color: "#111827",
  },
  modalTextDark: {
    color: "#F9FAFB",
  },
});
