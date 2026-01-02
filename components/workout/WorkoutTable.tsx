import { RefObject } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { WorkoutCard } from "@/components/workout/WorkoutCard";
import type { LogRow } from "@/types/workout";

// Keeping EditableField types if we want to re-introduce editing later, 
// though for now we are just displaying cards.
type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

type MoveDirection = "up" | "down";

type Props = {
  rows: LogRow[];
  compact: boolean;
  isDark: boolean;
  scrollRef: RefObject<ScrollView | null>;
  editingCell: { rowId: string; field: EditableField } | null;
  editValue: string;
  onBeginEditCell: (rowId: string, field: EditableField, currentValue: string) => void;
  onChangeEditValue: (value: string) => void;
  onCommitEditCell: () => void;
  onDeleteRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: MoveDirection) => void;
};

export function WorkoutTable({
  rows,
  compact,
  isDark,
  scrollRef,
  editingCell, // Unused in card view for now
  editValue, // Unused in card view for now
  onBeginEditCell, // Unused in card view for now
  onChangeEditValue, // Unused in card view for now
  onCommitEditCell, // Unused in card view for now
  onDeleteRow,
  onDuplicateRow,
  onMoveRow,
}: Props) {
  const moveAvailability = (row: LogRow, idx: number) => {
    const normalized = row.exercise.trim().toLowerCase();
    const hasSameAbove = rows.slice(0, idx).some((candidate) => candidate.exercise.trim().toLowerCase() === normalized);
    const hasSameBelow = rows.slice(idx + 1).some((candidate) => candidate.exercise.trim().toLowerCase() === normalized);
    return { up: hasSameAbove, down: hasSameBelow };
  };

  const openRowMenu = (rowId: string, canMoveUp: boolean, canMoveDown: boolean) => {
    const actions: Array<{ text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }> = [
      { text: "Duplicate", onPress: () => onDuplicateRow(rowId) },
    ];
    if (canMoveUp) actions.unshift({ text: "Move up", onPress: () => onMoveRow(rowId, "up") });
    if (canMoveDown) actions.push({ text: "Move down", onPress: () => onMoveRow(rowId, "down") });
    actions.push({ text: "Delete", onPress: () => onDeleteRow(rowId), style: "destructive" });
    actions.push({ text: "Cancel", style: "cancel" });

    Alert.alert("Row actions", "Move within exercise or duplicate/delete.", actions);
  };

  return (
    <ThemedView style={styles.tableWrap}>
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
          rows.map((r, idx) => {
            const moveAvail = moveAvailability(r, idx);
            const renderRightActions = () => (
              <View style={styles.swipeActions}>
                <Pressable
                  onPress={() => onDuplicateRow(r.id)}
                  style={({ pressed }) => [styles.swipeButton, styles.swipeDuplicate, pressed && styles.swipePressed]}
                >
                  <ThemedText style={styles.swipeText}>Duplicate</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => onDeleteRow(r.id)}
                  style={({ pressed }) => [styles.swipeButton, styles.swipeDelete, pressed && styles.swipePressed]}
                >
                  <ThemedText style={styles.swipeText}>Delete</ThemedText>
                </Pressable>
              </View>
            );
            return (
              <Swipeable key={r.id} renderRightActions={renderRightActions} overshootRight={false}>
                <WorkoutCard
                  row={r}
                  isDark={isDark}
                  onPress={() => { }}
                  onLongPress={() => openRowMenu(r.id, moveAvail.up, moveAvail.down)}
                />
              </Swipeable>
            );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tableWrap: {
    flex: 1,
    // Removed border for card list look
  },
  tableBody: {
    flex: 1,
  },
  tableBodyContent: {
    paddingBottom: 6,
    paddingHorizontal: 16, // Add little padding for cards shadow
  },
  emptyState: {
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyText: {
    opacity: 0.7,
    fontSize: 16,
  },
  swipeActions: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 12, // Match card margin
    marginLeft: 8,
  },
  swipeButton: {
    justifyContent: "center",
    paddingHorizontal: 14,
    minWidth: 80,
    borderRadius: 16, // Match card radius
    marginLeft: 8,
  },
  swipeDuplicate: {
    backgroundColor: "#16A34A",
  },
  swipeDelete: {
    backgroundColor: "#DC2626",
  },
  swipeText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  swipePressed: {
    opacity: 0.9,
  },
});
