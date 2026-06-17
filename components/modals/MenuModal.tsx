import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { BlurView } from "expo-blur";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";


type Props = {
    visible: boolean;
    onClose: () => void;
    onNavigateHistory: () => void;
    onNavigateChats: () => void;
    onNavigateSettings: () => void;
    onNavigateTemplates: () => void;
    onOpenCoach: () => void;
    onNavigateNutrition?: () => void;
    onNavigateCoachReport?: () => void;
    onNavigateProgress?: () => void;
    onNavigateProgram?: () => void;
    onNavigateExerciseLibrary?: () => void;
    onOpenHelp?: () => void;
};

export function MenuModal({
    visible,
    onClose,
    onNavigateHistory,
    onNavigateChats,
    onNavigateSettings,
    onNavigateTemplates,
    onOpenCoach,
    onNavigateNutrition,
    onNavigateCoachReport,
    onNavigateProgress,
    onNavigateProgram,
    onNavigateExerciseLibrary,
    onOpenHelp,
}: Props) {

    const colorScheme = useColorScheme();
    const textColor = useThemeColor({}, 'text');
    const isDark = colorScheme === 'dark';

    const item = (label: string, onPress: () => void) => (
        <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
        </Pressable>
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={40} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill}>
                <Pressable style={styles.container} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu">
                    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                        <View style={styles.content}>
                            {item("Ask Coach", () => { onClose(); onOpenCoach(); })}
                            {item("Chats", () => { onClose(); onNavigateChats(); })}
                            {item("History", () => { onClose(); onNavigateHistory(); })}
                            {onNavigateCoachReport && item("Daily Report", () => { onClose(); onNavigateCoachReport!(); })}
                            {onNavigateNutrition && item("Nutrition", () => { onClose(); onNavigateNutrition!(); })}
                            {onNavigateProgram && item("Program", () => { onClose(); onNavigateProgram!(); })}
                            {onNavigateProgress && item("Progress", () => { onClose(); onNavigateProgress!(); })}
                            {onNavigateExerciseLibrary && item("Library", () => { onClose(); onNavigateExerciseLibrary!(); })}
                            {item("Templates", () => { onClose(); onNavigateTemplates(); })}
                            {onOpenHelp && item("Help", () => { onClose(); onOpenHelp!(); })}
                            {item("Settings", () => { onClose(); onNavigateSettings(); })}
                        </View>
                    </ScrollView>
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
    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 24,
    },
    content: {
        width: '100%',
        alignItems: 'center',
        gap: 12,
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        minWidth: 200,
    },
    buttonPressed: {
        opacity: 0.7,
    },
    buttonText: {
        fontSize: 19,
        fontWeight: "500",
        textAlign: "center",
        letterSpacing: 0.5,
    },
});
