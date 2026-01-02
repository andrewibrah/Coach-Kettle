import { BlurView } from "expo-blur";
import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
    visible: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
};

export function WorkoutNameModal({ visible, onClose, onConfirm }: Props) {
    const insets = useSafeAreaInsets();
    const [name, setName] = useState("");

    const handleConfirm = () => {
        if (!name.trim()) return;
        onConfirm(name.trim());
        setName("");
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.container}
                >
                    <View style={styles.card}>
                        <Text style={styles.title}>Name your workout</Text>

                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Leg Day"
                            placeholderTextColor="#9CA3AF"
                            value={name}
                            onChangeText={setName}
                            autoFocus
                            onSubmitEditing={handleConfirm}
                            returnKeyType="done"
                        />

                        <View style={styles.buttonRow}>
                            <Pressable onPress={onClose} style={styles.cancelButton}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </Pressable>

                            <Pressable
                                onPress={handleConfirm}
                                style={[styles.confirmButton, !name.trim() && styles.disabled]}
                                disabled={!name.trim()}
                            >
                                <Text style={styles.confirmText}>Start</Text>
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
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
        gap: 20,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
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
    input: {
        backgroundColor: "#F9FAFB",
        borderRadius: 14,
        padding: 16,
        color: "#111827",
        fontSize: 16,
        borderWidth: 1,
        borderColor: "#D1D5DB",
    },
    buttonRow: {
        flexDirection: "row",
        gap: 12,
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
    confirmButton: {
        flex: 1,
        padding: 12,
        alignItems: "center",
        borderRadius: 14,
        backgroundColor: "#111827",
    },
    confirmText: {
        color: "#FFFFFF",
        fontWeight: "600",
        fontSize: 16,
    },
    disabled: {
        opacity: 0.5,
    },
});
