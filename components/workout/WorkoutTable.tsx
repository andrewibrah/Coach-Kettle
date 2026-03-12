import { RefObject, useCallback, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { FlatList, Swipeable } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { WorkoutCard } from "@/components/workout/WorkoutCard";
import type { LogRow } from "@/types/workout";
import Animated, { useSharedValue, useAnimatedStyle } from "react-native-reanimated";

type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

/** Cell wrapper that elevates the actively-dragged item above all siblings. */
const CellWrapper = ({ children, index, activeDragIndex, style, onLayout }: {
  children: React.ReactNode;
  index: number;
  activeDragIndex: { value: number };
  style?: any;
  onLayout?: (e: any) => void;
}) => {
  const animatedStyle = useAnimatedStyle(() => ({
    zIndex: activeDragIndex.value === index ? 999 : 0,
    elevation: activeDragIndex.value === index ? 999 : 0,
  }));
  return (
    <Animated.View
      style={[style, animatedStyle, { overflow: 'visible' as const }]}
      onLayout={onLayout}
    >
      {children}
    </Animated.View>
  );
};

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
  onReorderRow: (fromIndex: number, toIndex: number) => void;
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
  onReorderRow,
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

      Alert.alert("Row actions", "Double-tap for menu, swipe left for actions.", actions);
    },
    [rows, onEditSet, onBeginEditCell, onDuplicateRow, onDeleteRow]
  );

  const keyExtractor = useCallback((item: LogRow) => item.id, []);

  const ListEmpty = useCallback(
    () => (
      <View style={styles.emptyState}>
        <ThemedText style={styles.emptyText}>Add your first set below.</ThemedText>
      </View>
    ),
    []
  );

  // Create a stable extraData value that changes when rows content changes
  // This ensures FlatList properly re-renders on data updates
  // Include full row data hash to catch skeleton fill updates
  const extraData = useMemo(
    () => ({
      rowCount: rows.length,
      // Include weight/reps in hash so skeleton fills trigger re-render
      rowHash: rows.map((r) => `${r.id}:${r.weightLbs}:${r.reps}:${r.notes}`).join("|"),
      editingCell,
      editValue,
    }),
    [rows, editingCell, editValue]
  );

  // ── Drag shared values ──
  const activeDragIndex = useSharedValue(-1);
  const dragTranslationY = useSharedValue(0);
  // Dynamic row height — measured via onLayout in WorkoutCard, default ~100px
  const measuredRowHeight = useSharedValue(100);

  // ── Scroll lock during drag ──
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const onDragStart = useCallback(() => setScrollEnabled(false), []);
  const onDragEnd = useCallback(() => setScrollEnabled(true), []);

  const CellRendererComponent = useCallback(
    (props: any) => (
      <CellWrapper
        index={props.index}
        activeDragIndex={activeDragIndex}
        style={props.style}
        onLayout={props.onLayout}
      >
        {props.children}
      </CellWrapper>
    ),
    [activeDragIndex]
  );

  // Swipeable container override — RNGH hardcodes overflow:'hidden' internally
  const swipeableContainerStyle = useMemo(() => ({ overflow: 'visible' as const }), []);

  const renderItem = useCallback(
    ({ item, index }: { item: LogRow; index: number }) => {
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
        <Swipeable
          renderRightActions={renderRightActions}
          overshootRight={false}
          enabled={!isSyncing}
          containerStyle={swipeableContainerStyle}
        >
          <WorkoutCard
            row={item}
            rowIndex={index}
            rowHeight={100}
            activeDragIndex={activeDragIndex}
            dragTranslationY={dragTranslationY}
            measuredRowHeight={measuredRowHeight}
            onReorderRow={onReorderRow}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDoubleTap={() => openRowMenu(item.id)}
            onIncrementSet={onIncrementSet}
            onBeginEditCell={(rowId, field, value) => onBeginEditCell(rowId, field as any, value)}
            editingField={editingCell?.rowId === item.id ? (editingCell.field as any) : undefined}
            editValue={editValue}
            onChangeEditValue={onChangeEditValue}
            onCommitEditCell={onCommitEditCell}
          />
        </Swipeable>
      );
    },
    [openRowMenu, onDuplicateRow, onDeleteRow, onIncrementSet, onBeginEditCell, editingCell, editValue, onChangeEditValue, onCommitEditCell, onReorderRow, activeDragIndex, dragTranslationY, measuredRowHeight, onDragStart, onDragEnd, swipeableContainerStyle]
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const fallbackOffset = Math.max(0, info.index * info.averageItemLength);
      scrollRef.current?.scrollToOffset({ offset: fallbackOffset, animated: true });
    },
    [scrollRef]
  );

  return (
    <ThemedView style={styles.tableWrap}>
      <FlatList
        ref={scrollRef as any}
        data={rows}
        extraData={extraData}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        CellRendererComponent={CellRendererComponent}
        removeClippedSubviews={false}
        scrollEnabled={scrollEnabled}
        ListEmptyComponent={ListEmpty}
        style={styles.tableBody}
        contentContainerStyle={styles.tableBodyContent}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={handleScrollToIndexFailed}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tableWrap: {
    flex: 1,
    overflow: 'visible',
  },
  tableBody: {
    flex: 1,
    overflow: 'visible',
  },
  tableBodyContent: {
    paddingBottom: 6,
    paddingHorizontal: 16,
    overflow: 'visible',
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
