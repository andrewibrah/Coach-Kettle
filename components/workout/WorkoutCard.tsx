import { useColorScheme } from "@/hooks/use-color-scheme";
import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import { LogRow } from "@/types/workout";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

type Props = {
    row: LogRow;
    onPress: () => void;
    onLongPress: () => void;
    onIncrementSet: (rowId: string) => void;
    onBeginEditCell?: (rowId: string, field: "exercise" | "set" | "weightLbs" | "reps" | "notes", value: string) => void;
    editingField?: "exercise" | "set" | "weightLbs" | "reps" | "notes";
    editValue?: string;
    onChangeEditValue?: (val: string) => void;
    onCommitEditCell?: () => void;
};

export function WorkoutCard({
    row,
    onPress,
    onLongPress,
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

    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    // Dynamic colors
    const inputTextColor = isDark ? '#FFFFFF' : '#000000';
    const inputBg = isDark ? '#374151' : '#FFFFFF';
    const inputPlaceholderColor = isDark ? '#9CA3AF' : '#6B7280';
    const labelColor = isDark ? '#9CA3AF' : '#6B7280';
    const dividerColor = isDark ? '#374151' : '#D1D5DB';
    const noteColor = isDark ? '#9CA3AF' : '#4B5563';
    const setLabelColor = isDark ? '#9CA3AF' : '#6B7280';
    const setLabelBg = isDark ? 'rgba(156, 163, 175, 0.15)' : 'rgba(107, 114, 128, 0.1)';

    useEffect(() => {
        if (editingField && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingField]);

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
        <Pressable
            style={({ pressed }) => [
                styles.card,
                { backgroundColor: cardBg, borderColor },
                pressed && !isSyncing && !editingField && styles.pressed,
                isSyncing && styles.syncingRow,
            ]}
            onPress={isSyncing || editingField ? undefined : onPress}
            onLongPress={isSyncing || editingField ? undefined : onLongPress}
            disabled={isSyncing}
        >
            <View style={styles.header}>
                <ThemedText type="defaultSemiBold" style={[styles.exercise, isSyncing && styles.syncingText]}>
                    {row.exercise}
                </ThemedText>
                <Pressable
                    onPress={() => !isSyncing && onIncrementSet(row.id)}
                    onLongPress={() => !isSyncing && onBeginEditCell?.(row.id, "set", row.set.toString())}
                    hitSlop={10}
                    disabled={isSyncing}
                >
                    {editingField === "set" ? renderInput("Set", "numeric") : (
                        <ThemedText style={[styles.set, { color: setLabelColor, backgroundColor: setLabelBg }, isSyncing && styles.syncingText]}>Set {row.set}</ThemedText>
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
        </Pressable>
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
    pressed: {
        opacity: 0.95,
        transform: [{ scale: 0.995 }],
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
    syncingText: {
        color: "#9CA3AF",
    },
});
