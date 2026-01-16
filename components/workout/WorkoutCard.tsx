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
    const textColor = useThemeColor({}, 'text');
    const cardBg = useThemeColor({}, 'cardBackground');
    const borderColor = useThemeColor({}, 'border');


    useEffect(() => {
        if (editingField && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingField]);

    const renderInput = (placeholder: string, keyboardType: "default" | "numeric" = "default") => (
        <TextInput
            ref={inputRef}
            style={[styles.input, { color: textColor, minWidth: 40 }]}
            value={editValue}
            onChangeText={onChangeEditValue}
            onBlur={onCommitEditCell}
            onSubmitEditing={onCommitEditCell}
            placeholder={placeholder}
            placeholderTextColor="#9CA3AF"
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
                        <ThemedText style={[styles.set, isSyncing && styles.syncingText]}>Set {row.set}</ThemedText>
                    )}
                </Pressable>
            </View>

            <View style={[styles.details, { marginBottom: (row.notes || editingField === "notes") ? 12 : 0 }]}>
                {/* Weight */}
                <View style={styles.detailItem}>
                    {editingField === "weightLbs" ? (
                        renderInput("Lbs", "numeric")
                    ) : (
                        <Pressable onPress={() => onBeginEditCell?.(row.id, "weightLbs", row.weightLbs)}>
                            <ThemedText style={styles.detailValue}>
                                {row.weightLbs && row.weightLbs !== "0" ? row.weightLbs : "—"}
                                <ThemedText style={styles.detailLabel}> lbs</ThemedText>
                            </ThemedText>
                        </Pressable>
                    )}
                </View>

                <View style={styles.divider} />

                {/* Reps */}
                <View style={styles.detailItem}>
                    {editingField === "reps" ? (
                        renderInput("Reps", "numeric")
                    ) : (
                        <Pressable onPress={() => onBeginEditCell?.(row.id, "reps", row.reps)}>
                            <ThemedText style={styles.detailValue}>
                                {row.reps || "—"}
                                <ThemedText style={styles.detailLabel}> reps</ThemedText>
                            </ThemedText>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Notes */}
            {(row.notes || editingField === "notes") ? (
                <View style={styles.notes}>
                    {editingField === "notes" ? (
                        renderInput("Add a note...")
                    ) : (
                        <Pressable onPress={() => onBeginEditCell?.(row.id, "notes", row.notes)}>
                            <ThemedText style={styles.noteText}>{row.notes}</ThemedText>
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
        color: "#6B7280",
        fontWeight: "600",
        backgroundColor: "rgba(107, 114, 128, 0.1)",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        overflow: "hidden",
    },
    details: {
        flexDirection: "row",
        alignItems: "center",
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
        color: "#6B7280",
    },
    divider: {
        width: 1,
        height: 16,
        backgroundColor: "#D1D5DB",
        marginHorizontal: 16,
    },
    notes: {
        marginTop: 8,
        // Removed divider for cleaner look
    },
    noteText: {
        fontSize: 14,
        fontStyle: "italic",
        color: "#4B5563",
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
