import { BlurView } from "expo-blur";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export function DeleteWorkoutModal({ visible, onClose, onConfirm }: Props) {
    const insets = useSafeAreaInsets();

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill}>
                <View style={styles.container}>
                    <View style={styles.card}>
                        <Text style={styles.title}>Delete Workout?</Text>
                        <Text style={styles.message}>
                            This action cannot be undone. Are you sure you want to remove this workout from your history?
                        </Text>

                        <View style={styles.buttonRow}>
                            <Pressable onPress={onClose} style={styles.cancelButton}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </Pressable>

                            <Pressable onPress={onConfirm} style={styles.deleteButton}>
                                <Text style={styles.deleteText}>Delete</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    card: {
        width: "100%",
        maxWidth: 320,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 24,
        gap: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    title: {
        fontSize: 20,
        fontWeight: "700",
        color: "#111827",
        textAlign: "center",
    },
    message: {
        fontSize: 15,
        color: "#6B7280",
        textAlign: "center",
        lineHeight: 22,
    },
    buttonRow: {
        flexDirection: "row",
        gap: 12,
        marginTop: 8,
    },
    cancelButton: {
        flex: 1,
        padding: 12,
        alignItems: "center",
        borderRadius: 14,
        backgroundColor: "#F3F4F6",
    },
    cancelText: {
        color: "#374151",
        fontWeight: "600",
        fontSize: 16,
    },
    deleteButton: {
        flex: 1,
        padding: 12,
        alignItems: "center",
        borderRadius: 14,
        backgroundColor: "#EF4444",
    },
    deleteText: {
        color: "#FFFFFF",
        fontWeight: "600",
        fontSize: 16,
    },
});
