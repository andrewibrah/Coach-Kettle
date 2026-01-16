import { useThemeColor } from "@/hooks/use-theme-color";
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
    useColorScheme,
} from "react-native";


type Props = {
    visible: boolean;
    onClose: () => void;
    onConfirm: (name: string) => void;
};

export function WorkoutNameModal({ visible, onClose, onConfirm }: Props) {

    const [name, setName] = useState("");

    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const cardBg = useThemeColor({}, 'cardBackground');
    const textColor = useThemeColor({}, 'text');
    const placeholderColor = useThemeColor({}, 'placeholder');
    const borderColor = useThemeColor({}, 'border');
    const inputBg = useThemeColor({}, 'inputBackground');
    const buttonBg = useThemeColor({}, 'inputBackground');
    const primaryBtn = useThemeColor({}, 'text');
    const primaryBtnText = useThemeColor({}, 'background');

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
            <BlurView intensity={20} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.container}
                >
                    <View style={[styles.card, { backgroundColor: cardBg }]}>
                        <Text style={[styles.title, { color: textColor }]}>Name your workout</Text>

                        <TextInput
                            style={[styles.input, { backgroundColor: inputBg, color: textColor, borderColor }]}
                            placeholder="e.g. Leg Day"
                            placeholderTextColor={placeholderColor}
                            value={name}
                            onChangeText={setName}
                            autoFocus
                            onSubmitEditing={handleConfirm}
                            returnKeyType="done"
                        />

                        <View style={styles.buttonRow}>
                            <Pressable onPress={onClose} style={[styles.cancelButton, { backgroundColor: buttonBg }]}>
                                <Text style={[styles.cancelText, { color: textColor }]}>Cancel</Text>
                            </Pressable>

                            <Pressable
                                onPress={handleConfirm}
                                style={[styles.confirmButton, { backgroundColor: primaryBtn }, !name.trim() && styles.disabled]}
                                disabled={!name.trim()}
                            >
                                <Text style={[styles.confirmText, { color: primaryBtnText }]}>Start</Text>
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
        textAlign: "center",
    },
    input: {
        borderRadius: 14,
        padding: 16,
        fontSize: 16,
        borderWidth: 1,
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
    },
    cancelText: {
        fontWeight: "600",
        fontSize: 16,
    },
    confirmButton: {
        flex: 1,
        padding: 12,
        alignItems: "center",
        borderRadius: 14,
    },
    confirmText: {
        fontWeight: "600",
        fontSize: 16,
    },
    disabled: {
        opacity: 0.5,
    },
});
