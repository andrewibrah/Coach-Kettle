import { IconSymbol, type IconSymbolName } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useThemeColor } from "@/hooks/useThemeColor";
import { BlurView } from "expo-blur";
import React, { useEffect, useRef, useState } from "react";
import {
    Animated,
    Easing,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

type Entry = {
    label: string;
    icon: IconSymbolName;
    onPress: () => void;
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
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();

    const isDark = colorScheme === "dark";
    const background = useThemeColor({}, "background");
    const cardBackground = useThemeColor({}, "cardBackground");
    const iconColor = useThemeColor({}, "icon");
    const placeholder = useThemeColor({}, "placeholder");
    const borderColor = useThemeColor({}, "border");

    // `mounted` keeps the Modal on screen through the closing animation; without it
    // the native Modal unmounts instantly and the slide-out is never seen.
    const [mounted, setMounted] = useState(visible);
    // Closed position is the full window height, not a constant: the sheet is capped at
    // 0.85 * windowHeight, so windowHeight always parks it fully offscreen -- a fixed
    // guess would leave the grabber and title peeking on taller screens and in landscape.
    const translateY = useRef(new Animated.Value(windowHeight)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    // A row's destination fires only AFTER the slide-out completes. Firing it alongside
    // onClose() presents CoachModal/TutorialModal while this Modal is still mounted,
    // which iOS swallows ("attempt to present while presenting") and the target modal
    // silently never appears.
    const pendingActionRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (visible) {
            // Reopened mid-close: the queued destination is stale, drop it.
            pendingActionRef.current = null;
            setMounted(true);
            Animated.parallel([
                Animated.timing(translateY, {
                    toValue: 0,
                    duration: 260,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(backdropOpacity, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
            return;
        }

        Animated.parallel([
            Animated.timing(translateY, {
                toValue: windowHeight,
                duration: 200,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
                toValue: 0,
                duration: 160,
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (!finished) return;
            setMounted(false);
            const pending = pendingActionRef.current;
            pendingActionRef.current = null;
            pending?.();
        });
    }, [visible, translateY, backdropOpacity, windowHeight]);

    const go = (fn: () => void) => () => {
        pendingActionRef.current = fn;
        onClose();
    };

    const allSections: { title: string; entries: Entry[] }[] = [
        {
            title: "COACHING",
            entries: [
                { label: "Ask Coach", icon: "bubble.left.and.bubble.right.fill", onPress: go(onOpenCoach) },
                ...(onNavigateCoachReport
                    ? [{ label: "Coach Report", icon: "sparkles" as IconSymbolName, onPress: go(onNavigateCoachReport) }]
                    : []),
                { label: "Chat History", icon: "text.bubble.fill", onPress: go(onNavigateChats) },
            ],
        },
        {
            title: "TRAINING",
            entries: [
                ...(onNavigateProgram
                    ? [{ label: "Program", icon: "chart.bar.fill" as IconSymbolName, onPress: go(onNavigateProgram) }]
                    : []),
                ...(onNavigateExerciseLibrary
                    ? [{ label: "Exercise Library", icon: "books.vertical.fill" as IconSymbolName, onPress: go(onNavigateExerciseLibrary) }]
                    : []),
                { label: "Workout History", icon: "clock.fill", onPress: go(onNavigateHistory) },
                { label: "Templates", icon: "doc.text.fill", onPress: go(onNavigateTemplates) },
            ],
        },
        {
            title: "TRACKING",
            entries: [
                ...(onNavigateNutrition
                    ? [{ label: "Nutrition", icon: "fork.knife" as IconSymbolName, onPress: go(onNavigateNutrition) }]
                    : []),
                ...(onNavigateProgress
                    ? [{ label: "Progress", icon: "chart.line.uptrend.xyaxis" as IconSymbolName, onPress: go(onNavigateProgress) }]
                    : []),
            ],
        },
        {
            title: "APP",
            entries: [
                ...(onOpenHelp
                    ? [{ label: "Help", icon: "questionmark.circle" as IconSymbolName, onPress: go(onOpenHelp) }]
                    : []),
                { label: "Settings", icon: "gear", onPress: go(onNavigateSettings) },
            ],
        },
    ];
    const sections = allSections.filter((section) => section.entries.length > 0);

    return (
        <Modal
            visible={mounted}
            transparent
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <View style={styles.root}>
                {/* Backdrop — the ONLY tap-to-dismiss surface. Taps inside the sheet
                    no longer fall through and close the menu. */}
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={onClose}
                        accessibilityRole="button"
                        accessibilityLabel="Close menu"
                    >
                        <BlurView
                            intensity={30}
                            tint={isDark ? "dark" : "light"}
                            style={StyleSheet.absoluteFill}
                        />
                        <View
                            style={[
                                StyleSheet.absoluteFill,
                                { backgroundColor: isDark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.22)" },
                            ]}
                        />
                    </Pressable>
                </Animated.View>

                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            backgroundColor: background,
                            borderColor,
                            paddingBottom: insets.bottom + 12,
                            maxHeight: windowHeight * 0.85,
                            transform: [{ translateY }],
                        },
                    ]}
                >
                    <View style={[styles.grabber, { backgroundColor: borderColor }]} />

                    <View style={styles.sheetHeader}>
                        <ThemedText type="defaultSemiBold" style={styles.sheetTitle}>
                            Menu
                        </ThemedText>
                        <Pressable
                            onPress={onClose}
                            hitSlop={12}
                            style={({ pressed }) => [
                                styles.closeBtn,
                                { backgroundColor: cardBackground },
                                pressed && styles.pressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel="Close menu"
                        >
                            <IconSymbol name="xmark" size={18} color={iconColor} />
                        </Pressable>
                    </View>

                    <ScrollView
                        contentContainerStyle={styles.scroll}
                        showsVerticalScrollIndicator={false}
                        bounces={false}
                    >
                        {sections.map((section) => (
                            <View key={section.title} style={styles.section}>
                                <ThemedText style={[styles.sectionHeader, { color: placeholder }]}>
                                    {section.title}
                                </ThemedText>
                                <View style={[styles.group, { backgroundColor: cardBackground }]}>
                                    {section.entries.map((entry, index) => (
                                        <Pressable
                                            key={entry.label}
                                            onPress={entry.onPress}
                                            style={({ pressed }) => [
                                                styles.row,
                                                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: borderColor },
                                                pressed && styles.pressed,
                                            ]}
                                            accessibilityRole="button"
                                            accessibilityLabel={entry.label}
                                        >
                                            <IconSymbol name={entry.icon} size={22} color={iconColor} />
                                            <ThemedText style={styles.rowLabel} numberOfLines={2}>
                                                {entry.label}
                                            </ThemedText>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        ))}
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        justifyContent: "flex-end",
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingTop: 8,
    },
    grabber: {
        alignSelf: "center",
        width: 36,
        height: 5,
        borderRadius: 999,
        marginBottom: 8,
    },
    sheetHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingBottom: 4,
        minHeight: 44,
    },
    sheetTitle: {
        fontSize: 20,
        fontWeight: "700",
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    scroll: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    section: {
        marginTop: 14,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: "600",
        letterSpacing: 0.5,
        marginBottom: 8,
        marginLeft: 4,
    },
    group: {
        borderRadius: 14,
        overflow: "hidden",
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 13,
        minHeight: 48,
    },
    rowLabel: {
        fontSize: 16,
        flexShrink: 1,
    },
    pressed: {
        opacity: 0.6,
    },
});
