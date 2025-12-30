import { RefObject, useRef } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { LogRow } from "@/types/workout";

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
  editingCell,
  editValue,
  onBeginEditCell,
  onChangeEditValue,
  onCommitEditCell,
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

  const lastTapRef = useRef<Record<string, number>>({});

  const handleCellPress = (rowId: string, field: EditableField, value: string) => {
    if (editingCell && (editingCell.rowId !== rowId || editingCell.field !== field)) {
      onCommitEditCell();
    }
    const key = `${rowId}-${field}`;
    const now = Date.now();
    const last = lastTapRef.current[key] ?? 0;
    if (now - last < 300) {
      onBeginEditCell(rowId, field, value);
    }
    lastTapRef.current[key] = now;
  };

  const renderCell = (row: LogRow, field: EditableField, text: string, style: object, textAlign?: "center") => {
    const isEditing = editingCell?.rowId === row.id && editingCell.field === field;

    if (isEditing) {
      return (
        <TextInput
          style={[
            styles.cell,
            style,
            styles.input,
            textAlign ? { textAlign } : null,
          ]}
          value={editValue}
          onChangeText={onChangeEditValue}
          autoFocus
          onBlur={onCommitEditCell}
          onSubmitEditing={onCommitEditCell}
          blurOnSubmit
          keyboardType={field === "set" || field === "reps" ? "number-pad" : field === "weightLbs" ? "decimal-pad" : "default"}
          placeholder={field === "notes" ? "Notes" : field === "exercise" ? "Exercise" : field === "set" ? "Set" : field === "weightLbs" ? "Weight" : "Reps"}
        />
      );
    }

    return (
      <Pressable
        style={[styles.cell, style]}
        accessibilityRole="button"
        onPress={() => handleCellPress(row.id, field, text)}
        hitSlop={6}
      >
        <ThemedText style={[textAlign ? { textAlign } : null]} numberOfLines={field === "notes" ? 2 : 1}>
          {text || (field === "notes" ? "" : "—")}
        </ThemedText>
      </Pressable>
    );
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
      <View style={[styles.row, styles.headerRow, isDark && styles.headerRowDark]}>
        <ThemedText
          style={[
            styles.cell,
            styles.exerciseCol,
            styles.headerCell,
            isDark ? styles.headerCellDark : styles.headerCellLight,
          ]}
        >
          {compact ? "Ex" : "Exercise"}
        </ThemedText>
        <ThemedText
          style={[
            styles.cell,
            styles.setCol,
            styles.headerCell,
            isDark ? styles.headerCellDark : styles.headerCellLight,
          ]}
        >
          {compact ? "Set" : "Set"}
        </ThemedText>
        <ThemedText
          style={[
            styles.cell,
            styles.weightCol,
            styles.headerCell,
            isDark ? styles.headerCellDark : styles.headerCellLight,
          ]}
        >
          {compact ? "Wt" : "Weight (lbs)"}
        </ThemedText>
        <ThemedText
          style={[
            styles.cell,
            styles.repsCol,
            styles.headerCell,
            isDark ? styles.headerCellDark : styles.headerCellLight,
          ]}
        >
          {compact ? "Reps" : "Reps"}
        </ThemedText>
        <ThemedText
          style={[
            styles.cell,
            styles.notesCol,
            styles.headerCell,
            isDark ? styles.headerCellDark : styles.headerCellLight,
          ]}
        >
          {compact ? "Note" : "Notes"}
        </ThemedText>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.tableBody}
        contentContainerStyle={styles.tableBodyContent}
        keyboardShouldPersistTaps="handled"
        onTouchStart={onCommitEditCell}
        onScrollBeginDrag={onCommitEditCell}
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
                <Pressable
                  style={[styles.row, idx % 2 === 0 ? styles.evenRow : styles.oddRow]}
                  onLongPress={() => openRowMenu(r.id, moveAvail.up, moveAvail.down)}
                >
                  {renderCell(r, "exercise", r.exercise, styles.exerciseCol)}
                  {renderCell(r, "set", String(r.set), styles.setCol, "center")}
                  {renderCell(r, "weightLbs", r.weightLbs, styles.weightCol, "center")}
                  {renderCell(r, "reps", r.reps, styles.repsCol, "center")}
                  {renderCell(r, "notes", r.notes, styles.notesCol)}
                </Pressable>
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
    paddingVertical: 8,
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
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    backgroundColor: "#FFFFFF",
  },
  swipeActions: {
    flexDirection: "row",
    height: "100%",
    alignItems: "stretch",
  },
  swipeButton: {
    justifyContent: "center",
    paddingHorizontal: 14,
    minWidth: 92,
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
