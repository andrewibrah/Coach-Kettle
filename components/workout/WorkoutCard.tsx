import { ThemedText } from "@/components/ui/themed-text";
import { LogRow } from "@/types/workout";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
    row: LogRow;
    isDark: boolean;
    onPress: () => void;
    onLongPress: () => void;
    onIncrementSet: (rowId: string) => void;
    onBeginEditCell?: (rowId: string, field: "set", value: string) => void;
};

export function WorkoutCard({ row, isDark, onPress, onLongPress, onIncrementSet, onBeginEditCell }: Props) {
    const isSyncing = row.status === 'syncing';
    return (
        <Pressable
            style={({ pressed }) => [
                styles.card,
                isDark ? styles.cardDark : styles.cardLight,
                pressed && !isSyncing && styles.pressed,
                isSyncing && styles.syncingRow,
            ]}
            onPress={isSyncing ? undefined : onPress}
            onLongPress={isSyncing ? undefined : onLongPress}
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
                    <ThemedText style={[styles.set, isSyncing && styles.syncingText]}>Set {row.set}</ThemedText>
                </Pressable>
            </View>

            <View style={[styles.details, { marginBottom: row.notes ? 12 : 0 }]}>
                {row.weightLbs && row.weightLbs !== "0" ? (
                    <>
                        <View style={styles.detailItem}>
                            <ThemedText style={styles.detailValue}>
                                {row.weightLbs}
                                <ThemedText style={styles.detailLabel}> lbs</ThemedText>
                            </ThemedText>
                        </View>
                        <View style={styles.divider} />
                    </>
                ) : null}
                <View style={styles.detailItem}>
                    <ThemedText style={styles.detailValue}>
                        {row.reps || "—"}
                        <ThemedText style={styles.detailLabel}> reps</ThemedText>
                    </ThemedText>
                </View>
            </View>

            {row.notes ? (
                <View style={styles.notes}>
                    <ThemedText style={styles.noteText}>{row.notes}</ThemedText>
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
    cardLight: {
        backgroundColor: "#FFFFFF",
        borderColor: "#E5E7EB",
    },
    cardDark: {
        backgroundColor: "#1F2937",
        borderColor: "#374151",
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
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "rgba(156, 163, 175, 0.2)",
    },
    noteText: {
        fontSize: 14,
        fontStyle: "italic",
        color: "#4B5563",
    },
    syncingRow: {
        opacity: 0.5,
    },
    syncingText: {
        color: "#9CA3AF",
    },
});
