import { RefObject } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { LogRow } from "@/types/workout";

type Props = {
  rows: LogRow[];
  compact: boolean;
  isDark: boolean;
  scrollRef: RefObject<ScrollView | null>;
};

export function WorkoutTable({ rows, compact, isDark, scrollRef }: Props) {
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
});
