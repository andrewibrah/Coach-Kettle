import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/useThemeColor";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    rightElement?: React.ReactNode;
    style?: ViewStyle;
    /**
     * When true, skips adding `insets.top` padding at the top.
     * Only pass `true` when a parent layout (e.g. a SafeAreaView) already
     * handles top safe area. Default is false — the header IS the safe area source.
     */
    skipSafeArea?: boolean;
    /** If false, hides the back button (use on tab root screens) */
    showBack?: boolean;
};

export function ScreenHeader({ title, subtitle, onBack, rightElement, style, skipSafeArea = false, showBack = true }: Props) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const subtitleColor = useThemeColor({}, "placeholder");
    const iconColor = useThemeColor({}, "icon");

    const handleBack = () => {
        if (onBack) {
            onBack();
        } else {
            router.back();
        }
    };

    return (
        <View style={[
            styles.header,
            !skipSafeArea && { paddingTop: insets.top + 12 },
            style
        ]}>
            <View style={styles.headerTop}>
                <View style={styles.headerLeft}>
                    {showBack ? (
                        <Pressable
                            onPress={handleBack}
                            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
                            accessibilityRole="button"
                            accessibilityLabel="Go back"
                        >
                            <IconSymbol name="chevron.left" size={24} color={iconColor} />
                        </Pressable>
                    ) : null}
                    <View style={styles.titleWrap}>
                        <ThemedText
                            style={styles.title}
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                        >
                            {title}
                        </ThemedText>
                        {subtitle && (
                            <ThemedText style={[styles.subtitle, { color: subtitleColor }]}>
                                {subtitle}
                            </ThemedText>
                        )}
                    </View>
                </View>
                {rightElement && <View style={styles.headerRight}>{rightElement}</View>}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        marginBottom: 12,
        paddingHorizontal: 16,
    },
    headerTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    headerLeft: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        // Without this, React Native's flexShrink:0 default on this row
        // stops it (and the title inside it) from ever shrinking below its
        // natural content width, so a long title still overflows past the
        // screen edge regardless of titleWrap's flexShrink below.
        flexShrink: 1,
    },
    headerRight: {
        flexDirection: "row",
        alignItems: "center",
    },
    backBtn: {
        padding: 8,
        marginLeft: -8,
        borderRadius: 999,
    },
    backBtnPressed: {
        backgroundColor: "rgba(0,0,0,0.05)",
    },
    titleWrap: {
        flexShrink: 1,
    },
    title: {
        fontSize: 26,
        fontWeight: "800",
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        fontWeight: "600",
    },
});
