import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/useThemeColor";
import { LogRow } from "@/types/workout";
import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";

type Props = {
    visible: boolean;
    row: LogRow | null;
    onClose: () => void;
    onSave: (updatedRow: LogRow) => void;
};

export function EditSetModal({ visible, row, onClose, onSave }: Props) {
    const [exercise, setExercise] = useState("");
    const [weight, setWeight] = useState("");
    const [reps, setReps] = useState("");
    const [notes, setNotes] = useState("");

    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const placeholderColor = useThemeColor({}, 'placeholder');
    const borderColor = useThemeColor({}, 'border');
    const inputBg = useThemeColor({}, 'inputBackground');

    useEffect(() => {
        if (visible && row) {
            setExercise(row.exercise);
            setWeight(row.weightLbs);
            setReps(row.reps);
            setNotes(row.notes);
        }
    }, [visible, row]);

    const handleSave = () => {
        if (!row) return;
        onSave({
            ...row,
            exercise: exercise.trim(),
            weightLbs: weight.trim(),
            reps: reps.trim(),
            notes: notes, // Preserve newlines if any, or trim? Usually trim is safer for display but notes might be multiline.
        });
        onClose();
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.container}
            >
                <Pressable style={styles.modalOverlay} onPress={handleSave}>
                    <Pressable style={[styles.modalContent, { backgroundColor }]} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.header}>
                            <ThemedText type="subtitle">Edit Set</ThemedText>
                            <Pressable onPress={handleSave} hitSlop={10}>
                                <ThemedText style={styles.doneButton}>Done</ThemedText>
                            </Pressable>
                        </View>

                        <View style={styles.formContext}>
                            <View style={styles.inputGroup}>
                                <ThemedText style={styles.label}>Exercise</ThemedText>
                                <TextInput
                                    style={[styles.input, { color: textColor, borderColor, backgroundColor: inputBg }]}
                                    value={exercise}
                                    onChangeText={setExercise}
                                    placeholder="Exercise Name"
                                    placeholderTextColor={placeholderColor}
                                />
                            </View>

                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                    <ThemedText style={styles.label}>Weight (lbs)</ThemedText>
                                    <TextInput
                                        style={[styles.input, { color: textColor, borderColor, backgroundColor: inputBg }]}
                                        value={weight}
                                        onChangeText={setWeight}
                                        placeholder="0"
                                        placeholderTextColor={placeholderColor}
                                        keyboardType="numeric"
                                    />
                                </View>

                                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                    <ThemedText style={styles.label}>Reps</ThemedText>
                                    <TextInput
                                        style={[styles.input, { color: textColor, borderColor, backgroundColor: inputBg }]}
                                        value={reps}
                                        onChangeText={setReps}
                                        placeholder="0"
                                        placeholderTextColor={placeholderColor}
                                        keyboardType="numeric"
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <ThemedText style={styles.label}>Notes</ThemedText>
                                <TextInput
                                    style={[styles.input, styles.textArea, { color: textColor, borderColor, backgroundColor: inputBg }]}
                                    value={notes}
                                    onChangeText={setNotes}
                                    placeholder="Add a note..."
                                    placeholderTextColor={placeholderColor}
                                    multiline
                                    textAlignVertical="top"
                                />
                            </View>
                        </View>
                    </Pressable>
                </Pressable>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    modalContent: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 5,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
    },
    formContext: {
        gap: 16,
    },
    row: {
        flexDirection: "row",
    },
    inputGroup: {
        gap: 6,
    },
    label: {
        fontSize: 14,
        fontWeight: "600",
        color: "#6B7280",
    },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        fontSize: 16,
    },
    textArea: {
        minHeight: 80,
    },
    doneButton: {
        color: "#3B82F6",
        fontSize: 16,
        fontWeight: "600",
    },
});
