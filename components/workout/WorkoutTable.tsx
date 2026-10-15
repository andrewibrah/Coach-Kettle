import { RefObject, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { FlatList, Swipeable } from "react-native-gesture-handler";

import { ThemedText } from "@/components/ui/themed-text";
import { ThemedView } from "@/components/ui/themed-view";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { WorkoutCard } from "@/components/workout/WorkoutCard";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useLargeTextLayout } from "@/hooks/useLargeTextLayout";
import type { LogRow } from "@/types/workout";
import { activeGroupIndex, groupSessionRows, visibleSessionItems, type SessionGroup, type SessionItem } from "@/lib/sessionGroups";
import Animated, { useSharedValue, useAnimatedStyle } from "react-native-reanimated";

type EditableField = "exercise" | "set" | "weightLbs" | "reps" | "notes";

/** Slim divider row marking a rest timer between sets. */
const RestEntryRow = ({ row, onDelete }: { row: LogRow; onDelete: (id: string) => void }) => {
  const border = useThemeColor({}, 'border');
  const placeholder = useThemeColor({}, 'placeholder');
  return (
    <Pressable onLongPress={() => onDelete(row.id)} style={styles.restRow} accessibilityRole="button" accessibilityLabel="Rest timer row" accessibilityHint="Long press to delete">
      <View style={[styles.restLine, { backgroundColor: border }]} />
      <ThemedText style={[styles.restText, { color: placeholder }]}>
        ⏱  {row.notes || 'Rest timer'}
      </ThemedText>
      <View style={[styles.restLine, { backgroundColor: border }]} />
    </Pressable>
  );
};

/** Tappable exercise header: ▾ when collapsed (tap to show sets), ▴ when open. */
const GroupHeader = ({ group, expanded, onToggle }: { group: SessionGroup; expanded: boolean; onToggle: (key: string) => void }) => {
  const iconColor = useThemeColor({}, 'icon');
  const placeholder = useThemeColor({}, 'placeholder');
  const { scaleSpace } = useLargeTextLayout();
  const name = group.exercise || 'Exercise';
  const count = `${group.setCount} ${group.setCount === 1 ? 'set' : 'sets'}`;
  return (
    <Pressable
      onPress={() => onToggle(group.key)}
      style={[styles.groupHeader, { minHeight: scaleSpace(44) }]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${count}`}
      accessibilityHint={expanded ? 'Collapse sets' : 'Expand sets'}
      accessibilityState={{ expanded }}
    >
      <IconSymbol name={expanded ? 'chevron.up' : 'chevron.down'} size={16} weight="medium" color={iconColor} />
      <ThemedText type="defaultSemiBold" style={styles.groupTitle} numberOfLines={1}>{name}</ThemedText>
      <ThemedText style={[styles.groupCount, { color: placeholder }]}>{count}</ThemedText>
    </Pressable>
  );
};

/** Scroll API the screen uses; `index` is a position in the full `rows` array. */
export type WorkoutTableHandle = {
  scrollToEnd: (params?: { animated?: boolean }) => void;
  scrollToIndex: (params: { index: number; animated?: boolean; viewPosition?: number }) => void;
};

const NO_TOGGLES: ReadonlySet<string> = new Set();

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
  scrollRef: RefObject<WorkoutTableHandle | null>;
  editingCell: { rowId: string; field: EditableField } | null;
  editValue: string;
  onBeginEditCell: (rowId: string, field: EditableField, currentValue: string) => void;
  onChangeEditValue: (value: string) => void;
  onCommitEditCell: () => void;
  onDeleteRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
  onReorderRow: (fromIndex: number, toIndex: number, rowId: string) => void;
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
  const successColor = useThemeColor({}, 'success');
  const dangerFill = useThemeColor({}, 'dangerFill');
  const { isLargeText, scaleSpace } = useLargeTextLayout();
  const listRef = useRef<FlatList<SessionItem> | null>(null);

  // ── Exercise groups: only the active exercise is open by default ──
  // Taps flip a group against that default; the flips reset when the active exercise changes.
  const groups = useMemo(() => groupSessionRows(rows), [rows]);
  const activeKey = groups[activeGroupIndex(rows, groups)]?.key ?? null;
  const [toggled, setToggled] = useState<ReadonlySet<string>>(NO_TOGGLES);
  const [toggledFor, setToggledFor] = useState(activeKey);
  if (toggledFor !== activeKey) {
    setToggledFor(activeKey);
    setToggled(NO_TOGGLES);
  }
  const toggleGroup = useCallback((key: string) => {
    setToggled(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const items = useMemo(
    () => visibleSessionItems(rows, groups, (group) => (group.key === activeKey) !== toggled.has(group.key)),
    [rows, groups, activeKey, toggled]
  );
  // Visible index range of each open group's rows, so a drag can't leave its exercise.
  const groupRange = useMemo(() => {
    const range = new Map<number, [number, number]>();
    items.forEach((item, index) => {
      if (item.kind !== 'row') return;
      const r = range.get(item.groupIndex);
      range.set(item.groupIndex, r ? [r[0], index] : [index, index]);
    });
    return range;
  }, [items]);

  useImperativeHandle(scrollRef, () => ({
    scrollToEnd: (params) => listRef.current?.scrollToEnd(params),
    scrollToIndex: ({ index, ...rest }) => {
      const id = rows[index]?.id;
      let target = items.findIndex(item => item.kind === 'row' && item.row.id === id);
      // Row hidden in a collapsed group → scroll to that group's header instead.
      if (target === -1) target = items.findIndex(item => item.kind === 'header' && index >= item.group.start && index <= item.group.end);
      if (target === -1) throw new Error('row not visible');
      listRef.current?.scrollToIndex({ index: target, ...rest });
    },
  }), [rows, items]);

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

  const keyExtractor = useCallback((item: SessionItem) => item.kind === 'header' ? `header:${item.group.key}` : item.row.id, []);

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
      items,
    }),
    [rows, editingCell, editValue, items]
  );

  // ── Drag shared values ──
  // Fallback height used only until the first onLayout measurement lands. A card
  // is roughly 100pt at the default text size and grows with Dynamic Type, so
  // the fallback has to scale too or the first drag mis-computes its target slot.
  const fallbackRowHeight = scaleSpace(100);
  const activeDragIndex = useSharedValue(-1);
  const dragTranslationY = useSharedValue(0);
  const measuredRowHeight = useSharedValue(fallbackRowHeight);

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
    ({ item: entry, index }: { item: SessionItem; index: number }) => {
      if (entry.kind === 'header') {
        return <GroupHeader group={entry.group} expanded={entry.expanded} onToggle={toggleGroup} />;
      }
      const item = entry.row;
      if (item.isRest) {
        return <RestEntryRow row={item} onDelete={onDeleteRow} />;
      }
      const isSyncing = item.status === "syncing";

      const renderRightActions = () => {
        if (isSyncing) return null;
        return (
          <View style={[styles.swipeActions, isLargeText && styles.swipeActionsStacked]}>
            <Pressable
              onPress={() => onDuplicateRow(item.id)}
              style={({ pressed }) => [styles.swipeButton, { backgroundColor: successColor, minWidth: scaleSpace(80), minHeight: scaleSpace(44) }, isLargeText && styles.swipeButtonStacked, pressed && styles.swipePressed]}
              accessibilityRole="button"
              accessibilityLabel="Duplicate set"
            >
              <ThemedText style={styles.swipeText}>Duplicate</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => onDeleteRow(item.id)}
              style={({ pressed }) => [styles.swipeButton, { backgroundColor: dangerFill, minWidth: scaleSpace(80), minHeight: scaleSpace(44) }, isLargeText && styles.swipeButtonStacked, pressed && styles.swipePressed]}
              accessibilityRole="button"
              accessibilityLabel="Delete set"
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
            rowHeight={fallbackRowHeight}
            activeDragIndex={activeDragIndex}
            dragTranslationY={dragTranslationY}
            measuredRowHeight={measuredRowHeight}
            onReorderRow={(from, to, rowId) => {
              const [lo, hi] = groupRange.get(entry.groupIndex) ?? [from, from];
              onReorderRow(from, Math.max(lo, Math.min(to, hi)), rowId);
            }}
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
    [toggleGroup, groupRange, openRowMenu, onDuplicateRow, onDeleteRow, onIncrementSet, onBeginEditCell, editingCell, editValue, onChangeEditValue, onCommitEditCell, onReorderRow, activeDragIndex, dragTranslationY, measuredRowHeight, onDragStart, onDragEnd, swipeableContainerStyle, successColor, dangerFill, isLargeText, scaleSpace, fallbackRowHeight]
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const fallbackOffset = Math.max(0, info.index * info.averageItemLength);
      listRef.current?.scrollToOffset({ offset: fallbackOffset, animated: true });
    },
    []
  );

  return (
    <ThemedView style={styles.tableWrap}>
      <FlatList
        ref={listRef}
        data={items}
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
    // The list MUST clip to its own bounds. With overflow:'visible' (the previous
    // value) FlatList rows render outside the list frame and paint on top of the
    // bottom composer and the header — reproduced at the default text size with a
    // 4-set session. Row-level overflow stays visible via CellWrapper, which is
    // what the drag-reorder shadow actually needs.
    overflow: 'hidden',
  },
  tableBody: {
    flex: 1,
    overflow: 'hidden',
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
  swipeActionsStacked: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 8,
  },
  swipeButton: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginLeft: 8,
  },
  swipeButtonStacked: {
    flex: 1,
    marginLeft: 8,
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  groupTitle: {
    flexShrink: 1,
  },
  groupCount: {
    fontSize: 13,
  },
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  restLine: {
    flex: 1,
    height: 1,
    opacity: 0.6,
  },
  restText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
