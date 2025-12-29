import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";

import { BlurView } from "expo-blur";

import { ThemedText } from "@/components/themed-text";
import { api, type ApiWorkoutRow } from "@/lib/api";
import {
  saveWorkout,
  type WorkoutRow as StoredWorkoutRow,
} from "@/lib/workoutStorage";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BodyPart =
  | "Push"
  | "Pull"
  | "Legs"
  | "Abs"
  | "Chest"
  | "Back"
  | "Biceps"
  | "Triceps"
  | "Shoulders"
  | "Cardio";

type LogRow = {
  id: string;
  exercise: string;
  set: number;
  weightLbs: string; // keep as string for input friendliness; display as-is
  reps: string;
  notes: string;
  loggedAt: number; // timestamp when this set was logged
};

function getTodayMMDD(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function todayISO() {
  // Use local date, not UTC (toISOString returns UTC which can be a day off)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  return `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

type ExerciseGroup = {
  exercise: string;
  sets: LogRow[];
  startedAt?: number; // timestamp of first set in group
};

// Group consecutive rows by exercise name
function groupByExercise(rows: LogRow[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.exercise.toLowerCase() === row.exercise.toLowerCase()) {
      last.sets.push(row);
    } else {
      groups.push({
        exercise: row.exercise,
        sets: [row],
        startedAt: row.loggedAt,
      });
    }
  }
  return groups;
}

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const insets = useSafeAreaInsets();
  const topPadding = insets?.top ?? 0;
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

  // UX toast: prompt user to start workout before logging
  const [startToastOpen, setStartToastOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStartToast = () => {
    setStartToastOpen(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setStartToastOpen(false);
      toastTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Body part picker (multi-select draft on start)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftBodyParts, setDraftBodyParts] = useState<BodyPart[]>([]);

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const BODY_PARTS: BodyPart[] = useMemo(
    () => [
      "Chest",
      "Triceps",
      "Back",
      "Biceps",
      "Shoulders",
      "Abs",
      "Legs",
      "Cardio",
    ],
    []
  );

  const scrollRef = useRef<ScrollView>(null);

  const title = useMemo(() => {
    return bodyParts.length ? bodyParts.join(" + ") : "";
  }, [bodyParts]);

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
    const now = Date.now();
    return apiRows
      .filter((row) => row.exercise && row.exercise.trim())
      .map((row, idx) => ({
        id: `${now}-${idx}-${Math.random()}`,
        exercise: row.exercise.trim(),
        set: Number.isFinite(row.set) ? row.set : 1,
        weightLbs: String(row.weightLbs ?? "").trim(),
        reps: String(row.reps ?? "").trim(),
        notes: String(row.notes ?? "").trim(),
        loggedAt: now,
      }));
  };

  const onStartWorkout = () => {
    if (workoutActive) {
      Alert.alert(
        "Workout already started",
        "End the current workout to start a new one."
      );
      return;
    }
    setDraftBodyParts([]);
    setPickerOpen(true);
  };

  const startWorkoutWithParts = (parts: BodyPart[]) => {
    setBodyParts(parts);
    setWorkoutActive(true);
    setWorkoutId(makeId());
    setWorkoutCreatedAt(Date.now());
    setWorkoutDateISO(todayISO());
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

    const proceed = await new Promise<boolean>((resolve) => {
      const message = rows.length
        ? "This will save to History."
        : "End workout without saving any sets?";
      Alert.alert("End workout?", message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: rows.length ? "Save" : "End",
          style: "default",
          onPress: () => resolve(true),
        },
      ]);
    });
    if (!proceed) return;

    // If no sets were logged, just end the workout without saving
    if (rows.length === 0) {
      Alert.alert("Workout ended", "No sets were logged.");
      setWorkoutActive(false);
      setWorkoutId(null);
      setWorkoutCreatedAt(null);
      setWorkoutDateISO(null);
      setBodyParts([]);
      setRows([]);
      setMessageInput("");
      return;
    }

    const storedRows: StoredWorkoutRow[] = rows.map((row) => ({
      exercise: row.exercise,
      weightLbs: row.weightLbs,
      reps: row.reps,
      notes: row.notes,
      loggedAt: row.loggedAt,
    }));

    const workoutSession = {
      id: workoutId ?? makeId(),
      dateISO: workoutDateISO ?? todayISO(),
      part: selectedPart.trim() || "Workout",
      rows: storedRows,
      createdAt: workoutCreatedAt ?? Date.now(),
    };

    // Save to backend database
    let backendSaved = false;
    try {
      const apiRows = rows.map((row) => ({
        exercise: row.exercise,
        set: row.set,
        weightLbs: row.weightLbs,
        reps: row.reps,
        notes: row.notes,
      }));

      await api.saveWorkout({
        ...workoutSession,
        rows: apiRows,
      });
      backendSaved = true;
      console.log("✅ Workout saved to backend database");
    } catch (error) {
      console.error("❌ Failed to save workout to backend:", error);
      // Continue to save locally even if backend fails
    }

    // Also save locally for offline access
    await saveWorkout(workoutSession);

    if (backendSaved) {
      Alert.alert("Saved", "Workout saved to database and History.");
    } else {
      Alert.alert(
        "Saved Locally",
        "Workout saved to History. Backend save failed - check connection."
      );
    }
    setWorkoutActive(false);
    setWorkoutId(null);
    setWorkoutCreatedAt(null);
    setWorkoutDateISO(null);
    setBodyParts([]);
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
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true })
      );
    } catch (e: unknown) {
      const err = e as Error;
      console.error("[sendMessage] Error:", err);
      setError(err.message || "Failed to reach API");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: Math.max(topPadding, 8) }]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [
            styles.menuButton,
            pressed && styles.menuButtonPressed,
          ]}
        >
          <Text style={styles.menuButtonText}>☰</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.titleText}>
            {title}
          </ThemedText>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Workout Cards */}
      <ScrollView
        ref={scrollRef}
        style={styles.cardList}
        contentContainerStyle={styles.cardListContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {rows.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No sets logged yet</ThemedText>
          </View>
        ) : (
          groupByExercise(rows).map((group, gIdx) => (
            <View
              key={`group_${gIdx}_${group.sets[0]?.id}`}
              style={[styles.exerciseGroup, isDark && styles.exerciseGroupDark]}
            >
              <View style={styles.exerciseGroupHeader}>
                <ThemedText style={styles.exerciseGroupName} numberOfLines={1}>
                  {group.exercise}
                </ThemedText>
                {group.startedAt && (
                  <Text
                    style={[
                      styles.exerciseTime,
                      isDark && styles.exerciseTimeDark,
                    ]}
                  >
                    {formatTime(group.startedAt)}
                  </Text>
                )}
              </View>
              <View style={styles.setsContainer}>
                {group.sets.map((r) => (
                  <View key={r.id} style={styles.setRow}>
                    <View
                      style={[
                        styles.setIndicator,
                        isDark && styles.setIndicatorDark,
                      ]}
                    >
                      <Text style={styles.setIndicatorText}>{r.set}</Text>
                    </View>
                    <View style={styles.statsRow}>
                      <Text
                        style={[
                          styles.statValue,
                          isDark && styles.statValueDark,
                        ]}
                      >
                        {r.weightLbs || "—"}
                      </Text>
                      <Text
                        style={[styles.statUnit, isDark && styles.statUnitDark]}
                      >
                        lb
                      </Text>
                      <Text
                        style={[styles.statSep, isDark && styles.statSepDark]}
                      >
                        ×
                      </Text>
                      <Text
                        style={[
                          styles.statValue,
                          isDark && styles.statValueDark,
                        ]}
                      >
                        {r.reps || "—"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomWrap}>
        <View
          style={[styles.inputRow, !workoutActive && styles.inputRowDisabled]}
        >
          {!workoutActive ? (
            <Pressable
              onPress={showStartToast}
              style={styles.inputTapCatcher}
              accessibilityRole="button"
              accessibilityLabel="Start a workout to send your first set"
            />
          ) : null}
          <TextInput
            value={messageInput}
            onChangeText={setMessageInput}
            placeholder={
              workoutActive
                ? "e.g. bench press 135 x 8"
                : "e.g. bench press 135 x 8"
            }
            style={[styles.input, styles.messageInput]}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            editable={workoutActive && !loading}
          />

          <Pressable
            onPress={sendMessage}
            disabled={!workoutActive || loading || !messageInput.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              (!workoutActive || loading || !messageInput.trim()) &&
                styles.sendButtonDisabled,
              pressed &&
                !(!workoutActive || loading || !messageInput.trim()) &&
                styles.sendButtonPressed,
            ]}
          >
            <Text style={styles.sendButtonText}>
              {loading ? "..." : "Send"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.bottomButtons}>
          <Pressable
            onPress={workoutActive ? onEndWorkout : onStartWorkout}
            style={({ pressed }) => [
              styles.pillButton,
              styles.pillPrimary,
              workoutActive && styles.pillDanger,
              pressed && styles.pillPressed,
            ]}
          >
            <Text style={[styles.pillText, styles.pillPrimaryText]}>
              {workoutActive ? "End" : "Start"}
            </Text>
          </Pressable>

          <Pressable
            onPress={onClearRows}
            disabled={!rows.length}
            style={({ pressed }) => [
              styles.pillButton,
              !rows.length && styles.pillDisabled,
              pressed && rows.length > 0 && styles.pillPressed,
            ]}
          >
            <Text style={styles.pillText}>Clear</Text>
          </Pressable>
        </View>

        {error ? (
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        ) : null}

        <ThemedText style={styles.hint}>
          {workoutActive
            ? "Tip: include exercise, weight, reps, and notes in one message."
            : "Pick a body part, then log sets fast."}
        </ThemedText>
      </View>

      {/* Body part picker modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPickerOpen(false)}
        >
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
              Select body part
            </ThemedText>

            <ScrollView
              contentContainerStyle={styles.modalList}
              showsVerticalScrollIndicator={true}
            >
              {BODY_PARTS.map((bp) => {
                const selected = draftBodyParts.includes(bp);
                return (
                  <Pressable
                    key={bp}
                    onPress={() => {
                      setDraftBodyParts((prev) =>
                        prev.includes(bp)
                          ? prev.filter((x) => x !== bp)
                          : [...prev, bp]
                      );
                    }}
                    style={[
                      styles.modalItem,
                      isDark && styles.modalItemDark,
                      selected && styles.modalItemSelected,
                      selected && isDark && styles.modalItemSelectedDark,
                    ]}
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
                      <View
                        style={[styles.checkDot, selected && styles.checkDotOn]}
                      >
                        {selected ? (
                          <Text style={styles.checkMark}>✓</Text>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setPickerOpen(false)}
                  style={({ pressed }) => [
                    styles.modalActionBtn,
                    pressed && styles.pillPressed,
                  ]}
                >
                  <Text style={styles.modalActionText}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={() => startWorkoutWithParts(draftBodyParts)}
                  disabled={draftBodyParts.length === 0}
                  style={({ pressed }) => [
                    styles.modalActionBtn,
                    styles.modalActionPrimary,
                    draftBodyParts.length === 0 && styles.modalActionDisabled,
                    pressed &&
                      draftBodyParts.length !== 0 &&
                      styles.sendButtonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.modalActionText,
                      styles.modalActionPrimaryText,
                    ]}
                  >
                    Start workout
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Menu Modal */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <BlurView intensity={80} style={styles.menuBackdrop}>
          <Pressable
            style={styles.menuBackdropPressable}
            onPress={() => setMenuOpen(false)}
          >
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push("/(tabs)/history");
              }}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text style={styles.menuItemText}>History</Text>
            </Pressable>
          </Pressable>
        </BlurView>
      </Modal>

      {/* Toast message - centered */}
      {startToastOpen ? (
        <View style={styles.toastWrap} pointerEvents="none">
          <View style={styles.toastCard}>
            <Text style={styles.toastText}>
              Start a workout to send your first set
            </Text>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingTop: 8,
    backgroundColor: "transparent",
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  menuButtonPressed: {
    backgroundColor: "#F3F4F6",
  },
  menuButtonText: {
    fontSize: 24,
    color: "#111827",
    fontWeight: "300",
  },
  headerSpacer: {
    width: 40,
  },
  titleRow: {
    flex: 1,
    alignItems: "center",
  },
  titleText: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  cardList: {
    flex: 1,
  },
  cardListContent: {
    paddingVertical: 4,
    gap: 10,
  },
  exerciseGroup: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  exerciseGroupDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  exerciseGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  exerciseGroupName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  exerciseTime: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9CA3AF",
    marginLeft: 8,
  },
  exerciseTimeDark: {
    color: "#6B7280",
  },
  setsContainer: {
    gap: 6,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  setIndicator: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  setIndicatorDark: {
    backgroundColor: "#374151",
  },
  setIndicatorText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "700",
  },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  statValueDark: {
    color: "#F9FAFB",
  },
  statUnit: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
    marginRight: 2,
  },
  statUnitDark: {
    color: "#6B7280",
  },
  statSep: {
    fontSize: 13,
    color: "#D1D5DB",
    marginHorizontal: 2,
  },
  statSepDark: {
    color: "#4B5563",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 120,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    opacity: 0.5,
    textAlign: "center",
  },

  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    fontWeight: "500",
  },
  messageInput: {
    flex: 1,
  },
  errorText: {
    color: "#B00020",
  },
  hint: {
    opacity: 0.65,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 8,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
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
    gap: 10,
    paddingBottom: 10,
  },
  modalItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 14,
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
  bottomWrap: {
    marginTop: 16,
    gap: 12,
    paddingBottom: 8,
  },
  inputRow: {
    position: "relative",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  inputTapCatcher: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  toastWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  toastCard: {
    backgroundColor: "#111827",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#111827",
  },
  toastText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  inputRowDisabled: {
    opacity: 0.7,
  },
  sendButton: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#111827",
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#111827",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  sendButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    alignItems: "center",
  },
  pillButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  pillPrimary: {
    backgroundColor: "#111827",
    borderColor: "#111827",
    shadowColor: "#111827",
    shadowOpacity: 0.2,
  },
  pillDanger: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
    shadowColor: "#DC2626",
    shadowOpacity: 0.2,
  },
  pillDisabled: {
    opacity: 0.45,
  },
  pillPressed: {
    opacity: 0.9,
  },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  pillPrimaryText: {
    color: "#FFFFFF",
  },

  checkDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkDotOn: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  checkMark: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  modalItemSelected: {
    borderColor: "#111827",
  },
  modalItemSelectedDark: {
    borderColor: "#60A5FA",
  },
  modalActions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  modalActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  modalActionPrimary: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  modalActionDisabled: {
    opacity: 0.5,
  },
  modalActionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  modalActionPrimaryText: {
    color: "#FFFFFF",
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  menuBackdropPressable: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  menuItemPressed: {
    opacity: 0.6,
  },
  menuItemText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.3,
    textShadowColor: "rgba(255, 255, 255, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
