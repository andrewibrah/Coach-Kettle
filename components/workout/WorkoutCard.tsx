import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/useThemeColor";
import { LogRow } from "@/types/workout";
import { useCallback, useEffect, useRef } from "react";
import { LayoutChangeEvent, StyleSheet, TextInput, View, Keyboard, Pressable } from "react-native";

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  type SharedValue
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const CARD_MARGIN_BOTTOM = 12;

type Props = {
    row: LogRow;
    rowIndex: number;
    rowHeight: number;
    activeDragIndex: SharedValue<number>;
    dragTranslationY: SharedValue<number>;
    measuredRowHeight: SharedValue<number>;
    onReorderRow: (from: number, to: number) => void;
    onDragStart: () => void;
    onDragEnd: () => void;
    onDoubleTap: () => void;
    onIncrementSet: (rowId: string) => void;
    onBeginEditCell?: (rowId: string, field: "exercise" | "set" | "weightLbs" | "reps" | "notes", value: string) => void;
    editingField?: "exercise" | "set" | "weightLbs" | "reps" | "notes";
    editValue?: string;
    onChangeEditValue?: (val: string) => void;
    onCommitEditCell?: () => void;
};

export function WorkoutCard({
    row,
    rowIndex,
    rowHeight,
    activeDragIndex,
    dragTranslationY,
    measuredRowHeight,
    onReorderRow,
    onDragStart,
    onDragEnd,
    onDoubleTap,
    onIncrementSet,
    onBeginEditCell,
    editingField,
    editValue,
    onChangeEditValue,
    onCommitEditCell
}: Props) {
    const isSyncing = row.status === 'syncing';
    const inputRef = useRef<TextInput>(null);
    const cardBg = useThemeColor({}, 'cardBackground');
    const borderColor = useThemeColor({}, 'border');
    const inputTextColor = useThemeColor({}, 'text');
    const inputBg = useThemeColor({}, 'inputBackground');
    const inputPlaceholderColor = useThemeColor({}, 'placeholder');
    const labelColor = useThemeColor({}, 'placeholder');
    const dividerColor = useThemeColor({}, 'border');
    const noteColor = useThemeColor({}, 'placeholder');
    const setLabelColor = useThemeColor({}, 'placeholder');
    const setLabelBg = useThemeColor({}, 'secondaryBackground');

    useEffect(() => {
        if (editingField && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingField]);

    const triggerStartHaptic = useCallback(() => {
        Keyboard.dismiss();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, []);

    // Measure actual card height for accurate displacement math
    const onCardLayout = useCallback((e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        if (h > 0) {
            const totalHeight = h + CARD_MARGIN_BOTTOM;
            // Only update if significantly different to avoid churn
            if (Math.abs(totalHeight - measuredRowHeight.value) > 4) {
                measuredRowHeight.value = totalHeight;
            }
        }
    }, [measuredRowHeight]);

    // Double-tap detection: opens row actions menu
    const lastTapRef = useRef<number>(0);
    const handlePress = useCallback(() => {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
            // Double-tap detected — open row actions menu
            lastTapRef.current = 0;
            onDoubleTap();
        } else {
            lastTapRef.current = now;
        }
    }, [onDoubleTap]);

    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const isDragging = useSharedValue(false);

    const longPressPan = Gesture.Pan()
        .activateAfterLongPress(300)
        .failOffsetX([-10, 10])
        .enabled(!isSyncing && !editingField)
        .onStart(() => {
            isDragging.value = true;
            scale.value = withSpring(1.03);
            activeDragIndex.value = rowIndex;
            dragTranslationY.value = 0;
            runOnJS(triggerStartHaptic)();
            runOnJS(onDragStart)();
        })
        .onUpdate((e) => {
            translateY.value = e.translationY;
            dragTranslationY.value = e.translationY;
        })
        .onEnd((e) => {
            // Calculate target using measured height (falls back to prop)
            const h = measuredRowHeight.value > 0 ? measuredRowHeight.value : rowHeight;
            const movedSlots = Math.round(e.translationY / h);
            if (movedSlots !== 0) {
                runOnJS(onReorderRow)(rowIndex, rowIndex + movedSlots);
            }
        })
        .onFinalize(() => {
            // Immediate reset — no springs, no setTimeout, no race conditions
            translateY.value = 0;
            scale.value = 1;
            isDragging.value = false;
            activeDragIndex.value = -1;
            dragTranslationY.value = 0;
            runOnJS(onDragEnd)();
        });

    const tap = Gesture.Tap()
        .maxDuration(250)
        .enabled(!isSyncing && !editingField)
        .onEnd(() => {
            runOnJS(handlePress)();
        });

    const gesture = Gesture.Exclusive(longPressPan, tap);

    const animatedStyle = useAnimatedStyle(() => {
        // Use measured height (reactive shared value) with fallback
        const h = measuredRowHeight.value > 0 ? measuredRowHeight.value : rowHeight;

        // No drag active — return to rest state
        if (activeDragIndex.value === -1) {
            return {
                transform: [
                    { translateY: translateY.value },
                    { scale: scale.value },
                ],
                zIndex: isDragging.value ? 99 : 0,
                elevation: isDragging.value ? 8 : 0,
                shadowOpacity: isDragging.value ? 0.25 : 0,
            };
        }

        // This card IS the dragged card
        if (activeDragIndex.value === rowIndex) {
            return {
                transform: [
                    { translateY: translateY.value },
                    { scale: scale.value },
                ],
                zIndex: 99,
                elevation: 8,
                shadowOpacity: 0.25,
            };
        }

        // This card is NOT dragged — calculate displacement
        let targetY = 0;
        const movedSlots = Math.round(dragTranslationY.value / h);

        if (movedSlots > 0 && activeDragIndex.value < rowIndex && rowIndex <= activeDragIndex.value + movedSlots) {
            // Dragging DOWN past this card → shift this card UP
            targetY = -h;
        } else if (movedSlots < 0 && activeDragIndex.value > rowIndex && rowIndex >= activeDragIndex.value + movedSlots) {
            // Dragging UP past this card → shift this card DOWN
            targetY = h;
        }

        return {
            transform: [
                { translateY: withSpring(targetY, { damping: 20, stiffness: 200 }) },
                { scale: 1 },
            ],
            zIndex: 0,
            elevation: 0,
            shadowOpacity: 0,
        };
    });

    const renderInput = (placeholder: string, keyboardType: "default" | "numeric" = "default") => (
        <TextInput
            ref={inputRef}
            style={[
                styles.input,
                {
                    color: inputTextColor,
                    backgroundColor: inputBg,
                    minWidth: 40,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 6,
                }
            ]}
            value={editValue}
            onChangeText={onChangeEditValue}
            onBlur={onCommitEditCell}
            onSubmitEditing={onCommitEditCell}
            placeholder={placeholder}
            placeholderTextColor={inputPlaceholderColor}
            keyboardType={keyboardType}
            returnKeyType="done"
        />
    );

    return (
        <GestureDetector gesture={gesture}>
            <Animated.View
                onLayout={onCardLayout}
                style={[
                    styles.card,
                    { backgroundColor: cardBg, borderColor },
                    isSyncing && styles.syncingRow,
                    animatedStyle,
                ]}
            >
            <View style={styles.header}>
                <ThemedText type="defaultSemiBold" style={[styles.exercise, isSyncing && { color: labelColor }]}>
                    {row.exercise}
                </ThemedText>
                <Pressable
                    onPress={() => !isSyncing && onIncrementSet(row.id)}
                    onLongPress={() => !isSyncing && onBeginEditCell?.(row.id, "set", row.set.toString())}
                    hitSlop={10}
                    disabled={isSyncing}
                >
                    {editingField === "set" ? renderInput("Set", "numeric") : (
                        <ThemedText style={[styles.set, { color: setLabelColor, backgroundColor: setLabelBg }, isSyncing && { color: labelColor }]}>Set {row.set}</ThemedText>
                    )}
                </Pressable>
            </View>

            <View style={[styles.details, { marginBottom: (row.notes || editingField === "notes") ? 12 : 0 }]}>
                {row.isCardio ? (
                    // Cardio display: duration, distance, calories, heart rate, level
                    <View style={styles.cardioDetails}>
                        {row.durationMins != null && (
                            <View style={styles.cardioItem}>
                                <ThemedText style={styles.detailValue}>
                                    {row.durationMins}
                                    <ThemedText style={[styles.detailLabel, { color: labelColor }]}> min</ThemedText>
                                </ThemedText>
                            </View>
                        )}
                        {row.distance != null && (
                            <View style={styles.cardioItem}>
                                <ThemedText style={styles.detailValue}>
                                    {row.distance}
                                    <ThemedText style={[styles.detailLabel, { color: labelColor }]}> {row.distanceUnit || 'mi'}</ThemedText>
                                </ThemedText>
                            </View>
                        )}
                        {row.calories != null && (
                            <View style={styles.cardioItem}>
                                <ThemedText style={styles.detailValue}>
                                    {row.calories}
                                    <ThemedText style={[styles.detailLabel, { color: labelColor }]}> cal</ThemedText>
                                </ThemedText>
                            </View>
                        )}
                        {row.heartRate != null && (
                            <View style={styles.cardioItem}>
                                <ThemedText style={styles.detailValue}>
                                    {row.heartRate}
                                    <ThemedText style={[styles.detailLabel, { color: labelColor }]}> bpm</ThemedText>
                                </ThemedText>
                            </View>
                        )}
                        {row.level != null && (
                            <View style={styles.cardioItem}>
                                <ThemedText style={styles.detailValue}>
                                    Lvl {row.level}
                                </ThemedText>
                            </View>
                        )}
                    </View>
                ) : (
                    // Standard weight/reps display
                    <>
                        {/* Weight */}
                        <View style={styles.detailItem}>
                            {editingField === "weightLbs" ? (
                                renderInput("Lbs", "numeric")
                            ) : (
                                <Pressable onPress={() => onBeginEditCell?.(row.id, "weightLbs", row.weightLbs)}>
                                    <ThemedText style={styles.detailValue}>
                                        {row.weightLbs && row.weightLbs !== "0" ? row.weightLbs : "—"}
                                        <ThemedText style={[styles.detailLabel, { color: labelColor }]}> lbs</ThemedText>
                                    </ThemedText>
                                </Pressable>
                            )}
                        </View>

                        <View style={[styles.divider, { backgroundColor: dividerColor }]} />

                        {/* Reps */}
                        <View style={styles.detailItem}>
                            {editingField === "reps" ? (
                                renderInput("Reps", "numeric")
                            ) : (
                                <Pressable onPress={() => onBeginEditCell?.(row.id, "reps", row.reps)}>
                                    <ThemedText style={styles.detailValue}>
                                        {row.reps || "—"}
                                        <ThemedText style={[styles.detailLabel, { color: labelColor }]}> reps</ThemedText>
                                    </ThemedText>
                                </Pressable>
                            )}
                        </View>
                    </>
                )}
            </View>

            {/* Notes */}
            {(row.notes || editingField === "notes") ? (
                <View style={styles.notes}>
                    {editingField === "notes" ? (
                        renderInput("Add a note...")
                    ) : (
                        <Pressable onPress={() => onBeginEditCell?.(row.id, "notes", row.notes)}>
                            <ThemedText style={[styles.noteText, { color: noteColor }]}>{row.notes}</ThemedText>
                        </Pressable>
                    )}
                </View>
            ) : null}
        </Animated.View>
    </GestureDetector>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },

    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    exercise: {
        fontSize: 17,
        flex: 1,
        marginRight: 8,
    },
    set: {
        fontSize: 13,
        fontWeight: "600",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        overflow: "hidden",
    },
    details: {
        flexDirection: "row",
        alignItems: "center",
    },
    cardioDetails: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 12,
    },
    cardioItem: {
        flexDirection: "row",
        alignItems: "baseline",
    },
    detailItem: {
        flexDirection: "row",
        alignItems: "baseline",
    },
    detailValue: {
        fontSize: 20,
        fontWeight: "700",
    },
    detailLabel: {
        fontSize: 14,
        fontWeight: "400",
    },
    divider: {
        width: 1,
        height: 16,
        marginHorizontal: 16,
    },
    notes: {
        marginTop: 8,
        // Removed divider for cleaner look
    },
    noteText: {
        fontSize: 14,
        fontStyle: "italic",
    },
    input: {
        fontSize: 16,
        padding: 0,
    },
    syncingRow: {
        opacity: 0.5,
    },
});
