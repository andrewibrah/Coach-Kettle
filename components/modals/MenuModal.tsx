import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeColor } from "@/hooks/use-theme-color";
import { BlurView } from "expo-blur";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";


type Props = {
    visible: boolean;
    onClose: () => void;
    onNavigateHistory: () => void;
    onNavigateChats: () => void;
    onNavigateSettings: () => void;
    onNavigateTemplates: () => void;
    onOpenCoach: () => void;
};

export function MenuModal({ visible, onClose, onNavigateHistory, onNavigateChats, onNavigateSettings, onNavigateTemplates, onOpenCoach }: Props) {

    const colorScheme = useColorScheme();
    const textColor = useThemeColor({}, 'text');
    const isDark = colorScheme === 'dark';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
                <Pressable style={styles.container} onPress={onClose}>
                    <View style={styles.content}>
                        <Pressable
                            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                            onPress={() => { onClose(); onNavigateHistory(); }}
                        >
                            <Text style={[styles.buttonText, { color: textColor }]}>History</Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                            onPress={() => { onClose(); onOpenCoach(); }}
                        >
                            <Text style={[styles.buttonText, { color: textColor }]}>Ask Coach</Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                            onPress={() => { onClose(); onNavigateChats(); }}
                        >
                            <Text style={[styles.buttonText, { color: textColor }]}>Chats</Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                            onPress={() => { onClose(); onNavigateTemplates(); }}
                        >
                            <Text style={[styles.buttonText, { color: textColor }]}>Templates</Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                            onPress={() => { onClose(); onNavigateSettings(); }}
                        >
                            <Text style={[styles.buttonText, { color: textColor }]}>Settings</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    content: {
        width: '100%',
        alignItems: 'center',
        gap: 16,
    },
    button: {
        padding: 12,
        borderRadius: 14,
        minWidth: 160,
    },
    buttonPressed: {
        opacity: 0.7,
    },
    buttonText: {
        fontSize: 20,
        fontWeight: "500",
        textAlign: "center",
        letterSpacing: 0.5,
    },
});
