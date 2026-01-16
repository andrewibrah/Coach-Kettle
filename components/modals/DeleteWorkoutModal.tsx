import { useThemeColor } from "@/hooks/use-theme-color";
import { BlurView } from "expo-blur";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export function DeleteWorkoutModal({ visible, onClose, onConfirm }: Props) {
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const cardBg = useThemeColor({}, 'cardBackground');
    const textColor = useThemeColor({}, 'text');
    const secondaryText = useThemeColor({}, 'placeholder');
    const buttonBg = useThemeColor({}, 'inputBackground');
    const danger = useThemeColor({}, 'danger');
    const buttonText = useThemeColor({}, 'text');

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
                <View style={styles.container}>
                    <View style={[styles.card, { backgroundColor: cardBg }]}>
                        <Text style={[styles.title, { color: textColor }]}>Delete Workout?</Text>
                        <Text style={[styles.message, { color: secondaryText }]}>
                            This action cannot be undone. Are you sure you want to remove this workout from your history?
                        </Text>

                        <View style={styles.buttonRow}>
                            <Pressable onPress={onClose} style={[styles.cancelButton, { backgroundColor: buttonBg }]}>
                                <Text style={[styles.cancelText, { color: textColor }]}>Cancel</Text>
                            </Pressable>

                            <Pressable onPress={onConfirm} style={[styles.deleteButton, { backgroundColor: danger }]}>
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
