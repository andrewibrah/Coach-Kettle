import { RefObject, useCallback } from "react";
import { Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { Swipeable } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { WorkoutCard } from "@/components/workout/WorkoutCard";
import type { LogRow } from "@/types/workout";

type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

type Props = {
  rows: LogRow[];
  compact: boolean;
  scrollRef: RefObject<FlatList<LogRow> | null>;
  editingCell: { rowId: string; field: EditableField } | null;
  editValue: string;
  onBeginEditCell: (rowId: string, field: EditableField, currentValue: string) => void;
  onChangeEditValue: (value: string) => void;
  onCommitEditCell: () => void;
  onDeleteRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
  onReorderRows: (reordered: LogRow[]) => void;
  onIncrementSet: (rowId: string) => void;
  onEditSet: (rowId: string) => void;
};

export function WorkoutTable({
  rows,
  compact,
  scrollRef,
  editingCell,
  editValue,
  onBeginEditCell,
  onChangeEditValue,
  onCommitEditCell,
  onDeleteRow,
  onDuplicateRow,
  onReorderRows,
  onIncrementSet,
  onEditSet,
}: Props) {
  const openRowMenu = useCallback(
    (rowId: string) => {
      const actions: { text: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[] = [
        { text: "Edit Set", onPress: () => onEditSet(rowId) },
        { text: "Add Note", onPress: () => onBeginEditCell(rowId, "notes", rows.find(r => r.id === rowId)?.notes || "") },
        { text: "Duplicate", onPress: () => onDuplicateRow(rowId) },
        { text: "Delete", onPress: () => onDeleteRow(rowId), style: "destructive" },
        { text: "Cancel", style: "cancel" },
      ];

      Alert.alert("Row actions", "Double-tap for menu, hold to drag.", actions);
    },
    [rows, onEditSet, onBeginEditCell, onDuplicateRow, onDeleteRow]
  );

  const keyExtractor = useCallback((item: LogRow) => item.id, []);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<LogRow>) => {
      const isSyncing = item.status === "syncing";

      const renderRightActions = () => {
        if (isSyncing) return null;
        return (
          <View style={styles.swipeActions}>
            <Pressable
              onPress={() => onDuplicateRow(item.id)}
              style={({ pressed }) => [styles.swipeButton, styles.swipeDuplicate, pressed && styles.swipePressed]}
            >
              <ThemedText style={styles.swipeText}>Duplicate</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onDeleteRow(item.id)}
              style={({ pressed }) => [styles.swipeButton, styles.swipeDelete, pressed && styles.swipePressed]}
            >
              <ThemedText style={styles.swipeText}>Delete</ThemedText>
            </Pressable>
          </View>
        );
      };

      return (
        <View style={isSyncing ? styles.syncingWrap : undefined}>
          <Swipeable
            renderRightActions={renderRightActions}
            overshootRight={false}
            enabled={!isSyncing && !isActive}
          >
            <WorkoutCard
              row={item}
              onPress={() => {}}
              onDoubleTap={() => openRowMenu(item.id)}
              drag={drag}
              isActive={isActive}
              onIncrementSet={onIncrementSet}
              onBeginEditCell={(rowId, field, value) => onBeginEditCell(rowId, field as any, value)}
              editingField={editingCell?.rowId === item.id ? (editingCell.field as any) : undefined}
              editValue={editValue}
              onChangeEditValue={onChangeEditValue}
              onCommitEditCell={onCommitEditCell}
            />
          </Swipeable>
        </View>
      );
    },
    [
      editingCell,
      editValue,
      onBeginEditCell,
      onChangeEditValue,
      onCommitEditCell,
      onDeleteRow,
      onDuplicateRow,
      onIncrementSet,
      openRowMenu,
    ]
  );

  const ListEmpty = useCallback(
    () => (
      <View style={styles.emptyState}>
        <ThemedText style={styles.emptyText}>Add your first set below.</ThemedText>
      </View>
    ),
    []
  );

  return (
    <ThemedView style={styles.tableWrap}>
      <DraggableFlatList
        ref={scrollRef as any}
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onDragEnd={({ data }) => onReorderRows(data)}
        ListEmptyComponent={ListEmpty}
        style={styles.tableBody}
        contentContainerStyle={styles.tableBodyContent}
        keyboardShouldPersistTaps="handled"
        activationDistance={10}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tableWrap: {
    flex: 1,
  },
  tableBody: {
    flex: 1,
  },
  tableBodyContent: {
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  emptyState: {
    padding: 16,
    alignItems: "center",
    marginTop: 20,
  },
  emptyText: {
    opacity: 0.7,
    fontSize: 16,
  },
  swipeActions: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 12,
    marginLeft: 8,
  },
  swipeButton: {
    justifyContent: "center",
    paddingHorizontal: 14,
    minWidth: 80,
    borderRadius: 16,
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
  syncingWrap: {
    opacity: 0.5,
  },
});
