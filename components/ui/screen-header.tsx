import { IconSymbol } from "@/components/ui/icon-symbol";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    rightElement?: React.ReactNode;
    style?: ViewStyle;
    /** If true, skip adding top safe area padding (use when parent already handles it) */
    skipSafeArea?: boolean;
};

export function ScreenHeader({ title, subtitle, onBack, rightElement, style, skipSafeArea = false }: Props) {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const textColor = useThemeColor({}, "text");
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
                    <Pressable
                        onPress={handleBack}
                        style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
                    >
                        <IconSymbol name="chevron.left" size={24} color={iconColor} />
                    </Pressable>
                    <View>
                        <Text style={[styles.title, { color: textColor }]}>{title}</Text>
                        {subtitle && (
                            <Text style={[styles.subtitle, { color: subtitleColor }]}>
                                {subtitle}
                            </Text>
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
