import { RefObject } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { LogRow } from "@/types/workout";

type EditDraft = {
  exercise: string;
  set: string;
  weightLbs: string;
  reps: string;
  notes: string;
};

type MoveDirection = "up" | "down";

type Props = {
  rows: LogRow[];
  compact: boolean;
  isDark: boolean;
  scrollRef: RefObject<ScrollView | null>;
  editingRowId: string | null;
  editDraft: EditDraft | null;
  onStartEdit: (rowId: string) => void;
  onChangeDraft: (field: keyof EditDraft, value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
  onMoveRow: (rowId: string, direction: MoveDirection) => void;
};

export function WorkoutTable({
  rows,
  compact,
  isDark,
  scrollRef,
  editingRowId,
  editDraft,
  onStartEdit,
  onChangeDraft,
  onSaveEdit,
  onCancelEdit,
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
        <ThemedText
          style={[
            styles.cell,
            styles.actionCol,
            styles.headerCell,
            isDark ? styles.headerCellDark : styles.headerCellLight,
          ]}
        >
          {compact ? "Act" : "Actions"}
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
          rows.map((r, idx) => {
            const isEditing = editingRowId === r.id;
            const moveAvail = moveAvailability(r, idx);

            if (isEditing && editDraft) {
              return (
                <View
                  key={r.id}
                  style={[styles.row, styles.editRow, idx % 2 === 0 ? styles.evenRow : styles.oddRow]}
                >
                  <TextInput
                    style={[styles.cell, styles.exerciseCol, styles.input]}
                    value={editDraft.exercise}
                    onChangeText={(val) => onChangeDraft("exercise", val)}
                    placeholder="Exercise"
                  />
                  <TextInput
                    style={[styles.cell, styles.setCol, styles.input]}
                    value={editDraft.set}
                    onChangeText={(val) => onChangeDraft("set", val)}
                    placeholder="Set"
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.cell, styles.weightCol, styles.input]}
                    value={editDraft.weightLbs}
                    onChangeText={(val) => onChangeDraft("weightLbs", val)}
                    placeholder="Weight"
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={[styles.cell, styles.repsCol, styles.input]}
                    value={editDraft.reps}
                    onChangeText={(val) => onChangeDraft("reps", val)}
                    placeholder="Reps"
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.cell, styles.notesCol, styles.input]}
                    value={editDraft.notes}
                    onChangeText={(val) => onChangeDraft("notes", val)}
                    placeholder="Notes"
                  />

                  <View style={[styles.cell, styles.actionCol, styles.actionButtons]}>
                    <Pressable onPress={onSaveEdit} style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}>
                      <ThemedText style={styles.actionText}>Save</ThemedText>
                    </Pressable>
                    <Pressable onPress={onCancelEdit} style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}>
                      <ThemedText style={styles.actionText}>Cancel</ThemedText>
                    </Pressable>
                  </View>
                </View>
              );
            }

            return (
              <Pressable
                key={r.id}
                style={[styles.row, idx % 2 === 0 ? styles.evenRow : styles.oddRow]}
                onPress={() => onStartEdit(r.id)}
              >
                <ThemedText style={[styles.cell, styles.exerciseCol]} numberOfLines={1}>{r.exercise}</ThemedText>
                <ThemedText style={[styles.cell, styles.setCol]}>{String(r.set)}</ThemedText>
                <ThemedText style={[styles.cell, styles.weightCol]}>{r.weightLbs || "—"}</ThemedText>
                <ThemedText style={[styles.cell, styles.repsCol]}>{r.reps || "—"}</ThemedText>
                <ThemedText style={[styles.cell, styles.notesCol]} numberOfLines={2}>{r.notes || ""}</ThemedText>
                <View style={[styles.cell, styles.actionCol, styles.actionButtons]}>
                  <Pressable
                    onPress={() => onMoveRow(r.id, "up")}
                    disabled={!moveAvail.up}
                    style={({ pressed }) => [
                      styles.actionButton,
                      !moveAvail.up && styles.actionDisabled,
                      pressed && moveAvail.up && styles.actionPressed,
                    ]}
                    accessibilityLabel="Move row up within exercise"
                  >
                    <ThemedText style={[styles.actionText, !moveAvail.up && styles.actionTextDisabled]}>Up</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => onMoveRow(r.id, "down")}
                    disabled={!moveAvail.down}
                    style={({ pressed }) => [
                      styles.actionButton,
                      !moveAvail.down && styles.actionDisabled,
                      pressed && moveAvail.down && styles.actionPressed,
                    ]}
                    accessibilityLabel="Move row down within exercise"
                  >
                    <ThemedText style={[styles.actionText, !moveAvail.down && styles.actionTextDisabled]}>Down</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => onDuplicateRow(r.id)}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
                    accessibilityLabel="Duplicate row"
                  >
                    <ThemedText style={styles.actionText}>Dup</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => onDeleteRow(r.id)}
                    style={({ pressed }) => [styles.actionButton, styles.deleteButton, pressed && styles.actionPressed]}
                    accessibilityLabel="Delete row"
                  >
                    <ThemedText style={[styles.actionText, styles.deleteText]}>Del</ThemedText>
                  </Pressable>
                </View>
              </Pressable>
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
  actionCol: {
    flex: 1.4,
    alignItems: "flex-end",
    textAlign: "right",
  },
  emptyState: {
    padding: 16,
  },
  emptyText: {
    opacity: 0.7,
  },
  editRow: {
    backgroundColor: "#F2F7FF",
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
  actionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    marginLeft: 6,
    marginBottom: 6,
  },
  actionPressed: {
    opacity: 0.85,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  actionTextDisabled: {
    color: "#9CA3AF",
  },
  deleteButton: {
    borderColor: "#FECACA",
    backgroundColor: "#FEF2F2",
  },
  deleteText: {
    color: "#B91C1C",
  },
});
