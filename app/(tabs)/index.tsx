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
  TextInput,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { api } from "@/lib/api";

type BodyPart =
  | "Chest"
  | "Back"
  | "Legs"
  | "Shoulders"
  | "Arms"
  | "Push"
  | "Pull"
  | "Full Body"
  | "Cardio"
  | "Other";

type LogRow = {
  id: string;
  exercise: string;
  set: number;
  weightLbs: string; // keep as string for input friendliness; display as-is
  reps: string;
  notes: string;
};

const BODY_PARTS: BodyPart[] = [
  "Chest",
  "Back",
  "Legs",
  "Shoulders",
  "Arms",
  "Push",
  "Pull",
  "Full Body",
  "Cardio",
  "Other",
];

function getTodayMMDD(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

export default function HomeScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];

  // Session header state
  const [sessionDate, setSessionDate] = useState<string>(getTodayMMDD());
  const [bodyParts, setBodyParts] = useState<BodyPart[]>([]);

  // Table rows (in-memory only for now)
  const [rows, setRows] = useState<LogRow[]>([]);

  // "Chat input filler" fields
  const [exerciseInput, setExerciseInput] = useState<string>("");
  const [weightInput, setWeightInput] = useState<string>("");
  const [repsInput, setRepsInput] = useState<string>("");
  const [notesInput, setNotesInput] = useState<string>("");

  // AI chat mode
  const [chatMode, setChatMode] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Body part picker
  const [pickerOpen, setPickerOpen] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const title = useMemo(() => {
    const bp = bodyParts.length ? `${bodyParts.join(" + ")} ` : "";
    return `${sessionDate} ${bp}Workout`;
  }, [sessionDate, bodyParts]);

  const resetForNewDay = (nextDate: string) => {
    setSessionDate(nextDate);
    setBodyParts([]);
    setRows([]);
    setExerciseInput("");
    setWeightInput("");
    setRepsInput("");
    setNotesInput("");
  };

  const ensureFreshSession = () => {
    const today = getTodayMMDD();
    if (today !== sessionDate) resetForNewDay(today);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      ensureFreshSession();
    }, 30_000);

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") ensureFreshSession();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDate]);

  const nextSetNumberForExercise = (exerciseName: string): number => {
    const normalized = exerciseName.trim().toLowerCase();
    if (!normalized) return 1;
    const count = rows.reduce((acc, r) => {
      return r.exercise.trim().toLowerCase() === normalized ? acc + 1 : acc;
    }, 0);
    return count + 1;
  };

  const addRow = () => {
    const ex = exerciseInput.trim();
    if (!ex) return;

    const newRow: LogRow = {
      id: crypto.randomUUID(),
      exercise: ex,
      set: nextSetNumberForExercise(ex),
      weightLbs: weightInput.trim(),
      reps: repsInput.trim(),
      notes: notesInput.trim(),
    };

    setRows((prev) => [...prev, newRow]);

    // Keep exercise for fast repeated sets; clear the rest.
    setWeightInput("");
    setRepsInput("");
    setNotesInput("");

    // Scroll to bottom so the new row is visible.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const deleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDone = () => {
    if (rows.length === 0) return;
    // TODO: persist to Supabase once connected
    Alert.alert(
      "Workout Complete",
      `${rows.length} sets logged. Save to history?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Save & Clear",
          onPress: () => {
            // TODO: write rows + session to Supabase here
            setRows([]);
            setBodyParts([]);
            setExerciseInput("");
            setWeightInput("");
            setRepsInput("");
            setNotesInput("");
          },
        },
      ]
    );
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    if (msg.toLowerCase() === "done") {
      handleDone();
      setChatInput("");
      return;
    }

    setChatLoading(true);
    try {
      const { reply } = await api.chat(msg);
      // The AI returns structured text — for now show it as an alert.
      // TODO: parse reply into LogRow[] and append to rows automatically.
      Alert.alert("Coach Kettle", reply);
    } catch {
      Alert.alert("Error", "Could not reach AI. Check your connection.");
    } finally {
      setChatLoading(false);
      setChatInput("");
    }
  };

  const themed = useMemo(
    () =>
      StyleSheet.create({
        bodyPartPill: {
          alignSelf: "center",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.pillBorder,
        },
        tableWrap: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          overflow: "hidden",
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 10,
          paddingHorizontal: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderLight,
        },
        headerRow: {
          backgroundColor: colors.tableHeaderBg,
          borderBottomColor: colors.tableHeaderBorder,
        },
        evenRow: {
          backgroundColor: colors.tableRowEven,
        },
        oddRow: {
          backgroundColor: colors.tableRowOdd,
        },
        input: {
          borderWidth: 1,
          borderColor: colors.inputBorder,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 10,
          backgroundColor: colors.inputBackground,
          color: colors.text,
          fontSize: 14,
        },
        modalCard: {
          backgroundColor: colors.modalCardBg,
          borderRadius: 14,
          padding: 14,
          maxHeight: "70%",
        },
        modalItem: {
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: colors.modalItemBorder,
          borderRadius: 12,
        },
        modalItemSelected: {
          borderColor: colors.modalItemSelectedBorder,
          backgroundColor: colors.modalItemSelectedBg,
        },
        modalDone: {
          borderColor: colors.modalDoneBorder,
          backgroundColor: colors.modalDoneBg,
        },
        modalClear: {
          borderColor: colors.modalClearBorder,
        },
      }),
    [colors]
  );

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

          <Pressable
            onPress={() => setPickerOpen(true)}
            style={themed.bodyPartPill}
            accessibilityRole="button"
            accessibilityLabel="Select body part"
          >
            <ThemedText style={styles.bodyPartPillText}>
              {bodyParts.length ? bodyParts.join(" + ") : "Tap to set body parts"}
            </ThemedText>
          </Pressable>
        </View>
      </ThemedView>

      {/* Table */}
      <ThemedView style={themed.tableWrap}>
        <View style={[themed.row, themed.headerRow]}>
          <ThemedText style={[styles.cell, styles.exerciseCol, styles.headerCell]}>
            Exercise
          </ThemedText>
          <ThemedText style={[styles.cell, styles.setCol, styles.headerCell]}>
            Set
          </ThemedText>
          <ThemedText style={[styles.cell, styles.weightCol, styles.headerCell]}>
            Weight (lbs)
          </ThemedText>
          <ThemedText style={[styles.cell, styles.repsCol, styles.headerCell]}>
            Reps
          </ThemedText>
          <ThemedText style={[styles.cell, styles.notesCol, styles.headerCell]}>
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
              <Pressable
                key={r.id}
                onLongPress={() =>
                  Alert.alert("Delete Set", `Remove ${r.exercise} set ${r.set}?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteRow(r.id) },
                  ])
                }
                style={[themed.row, idx % 2 === 0 ? themed.evenRow : themed.oddRow]}
              >
                <ThemedText style={[styles.cell, styles.exerciseCol]}>{r.exercise}</ThemedText>
                <ThemedText style={[styles.cell, styles.setCol]}>{String(r.set)}</ThemedText>
                <ThemedText style={[styles.cell, styles.weightCol]}>{r.weightLbs || "\u2014"}</ThemedText>
                <ThemedText style={[styles.cell, styles.repsCol]}>{r.reps || "\u2014"}</ThemedText>
                <ThemedText style={[styles.cell, styles.notesCol]}>{r.notes || ""}</ThemedText>
              </Pressable>
            ))
          )}
        </ScrollView>
      </ThemedView>

      {/* Input row */}
      <View style={styles.inputWrap}>
        <View style={styles.modeToggleRow}>
          <Pressable onPress={() => setChatMode(false)}>
            <ThemedText style={[styles.modeToggle, !chatMode && styles.modeToggleActive]}>
              Fields
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => setChatMode(true)}>
            <ThemedText style={[styles.modeToggle, chatMode && styles.modeToggleActive]}>
              AI Chat
            </ThemedText>
          </Pressable>
        </View>

        {chatMode ? (
          <View style={styles.chatRow}>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder={chatLoading ? "Thinking..." : 'e.g. "bench 185 10" or "done"'}
              placeholderTextColor={colors.icon}
              style={[themed.input, styles.chatInput]}
              editable={!chatLoading}
              returnKeyType="send"
              onSubmitEditing={sendChat}
            />
            <Button title={chatLoading ? "..." : "Send"} onPress={sendChat} disabled={chatLoading} />
          </View>
        ) : (
          <>
            <View style={styles.inputGrid}>
              <TextInput
                value={exerciseInput}
                onChangeText={setExerciseInput}
                placeholder="Exercise"
                placeholderTextColor={colors.icon}
                style={[themed.input, styles.exerciseInput]}
                returnKeyType="next"
              />
              <TextInput
                value={weightInput}
                onChangeText={setWeightInput}
                placeholder="Weight"
                placeholderTextColor={colors.icon}
                style={[themed.input, styles.smallInput]}
                keyboardType={Platform.select({ ios: "numbers-and-punctuation", android: "numeric" })}
                returnKeyType="next"
              />
              <TextInput
                value={repsInput}
                onChangeText={setRepsInput}
                placeholder="Reps"
                placeholderTextColor={colors.icon}
                style={[themed.input, styles.smallInput]}
                keyboardType={Platform.select({ ios: "numbers-and-punctuation", android: "numeric" })}
                returnKeyType="next"
              />
              <TextInput
                value={notesInput}
                onChangeText={setNotesInput}
                placeholder="Notes"
                placeholderTextColor={colors.icon}
                style={[themed.input, styles.notesInput]}
                returnKeyType="done"
                onSubmitEditing={addRow}
              />
            </View>

            <View style={styles.actionsRow}>
              <Button title="Add" onPress={addRow} />
              {rows.length > 0 && <Button title="Done" onPress={handleDone} />}
              <Button title="Clear" onPress={() => setRows([])} />
            </View>
          </>
        )}

        <ThemedText style={styles.hint}>
          {chatMode
            ? 'Type naturally: "squat 225 5" or "done" to finish.'
            : "Tip: keep Exercise filled, then punch Weight/Reps for fast sets.\nLong-press a row to delete it."}
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
          <Pressable style={themed.modalCard} onPress={() => {}}>
            <ThemedText type="title" style={styles.modalTitle}>
              Select Body Part
            </ThemedText>

            <ScrollView contentContainerStyle={styles.modalList}>
              {BODY_PARTS.map((bp) => {
                const selected = bodyParts.includes(bp);
                return (
                  <Pressable
                    key={bp}
                    onPress={() => {
                      setBodyParts((prev) =>
                        prev.includes(bp) ? prev.filter((x) => x !== bp) : [...prev, bp]
                      );
                    }}
                    style={[themed.modalItem, selected && themed.modalItemSelected]}
                  >
                    <View style={styles.modalItemRow}>
                      <ThemedText style={styles.modalItemText}>{bp}</ThemedText>
                      <ThemedText style={styles.modalItemCheck}>{selected ? "\u2713" : ""}</ThemedText>
                    </View>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => {
                  setBodyParts([]);
                }}
                style={[themed.modalItem, themed.modalClear]}
              >
                <ThemedText style={styles.modalItemText}>Clear selection</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setPickerOpen(false)}
                style={[themed.modalItem, themed.modalDone]}
              >
                <ThemedText style={styles.modalItemText}>Done</ThemedText>
              </Pressable>
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
  bodyPartPillText: {
    fontSize: 14,
  },

  tableBody: {
    flex: 1,
  },
  tableBodyContent: {
    paddingBottom: 6,
  },
  cell: {
    fontSize: 13,
    paddingRight: 8,
  },
  headerCell: {
    fontSize: 12,
    opacity: 0.9,
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
  exerciseInput: {
    flex: 2.2,
  },
  smallInput: {
    flex: 1,
    textAlign: "center",
  },
  notesInput: {
    flex: 1.6,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  hint: {
    opacity: 0.7,
  },
  modeToggleRow: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
  },
  modeToggle: {
    fontSize: 14,
    opacity: 0.5,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  modeToggleActive: {
    opacity: 1,
    fontWeight: "600",
    borderBottomWidth: 2,
    borderBottomColor: "#0a7ea4",
  },
  chatRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  chatInput: {
    flex: 1,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 18,
  },
  modalTitle: {
    marginBottom: 10,
    textAlign: "center",
  },
  modalList: {
    gap: 8,
    paddingBottom: 6,
  },
  modalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalItemCheck: {
    fontSize: 18,
    opacity: 0.9,
  },
  modalItemText: {
    fontSize: 16,
  },
});
