import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/useThemeColor";
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type HeaderProps = {
    title?: string | null;
    onMenuPress: () => void;
    onClearPress: () => void;
    onRoutinePress?: () => void;
};

export function Header({ title, onMenuPress, onClearPress, onRoutinePress }: HeaderProps) {
    const insets = useSafeAreaInsets();
    const iconColor = useThemeColor({}, 'icon');
    const textColor = useThemeColor({}, 'text');

    return (
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
            <View style={styles.headerTop}>
                <View style={styles.headerLeft}>
                    <Pressable
                        onPress={onMenuPress}
                        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Open menu"
                    >
                        <IconSymbol name="line.3.horizontal" size={24} color={iconColor} />
                    </Pressable>
                </View>

                <View style={styles.titleContainer}>
                    {/* At accessibility text sizes the title has nowhere to grow between the
                        menu and action icons. numberOfLines={1} alone truncated "Coach Kettle"
                        to "Co…" (measured: docs/qa/2026-09-08-1.0.2-fable-lineheight/
                        A0-baseline-unmodified-AX5.png). Shrinking to fit keeps the whole title
                        readable and keeps the header one line, which is what UIKit nav bars do.
                        Wrapping to 2 lines was tried and rejected -- it swallowed the header and
                        collided with the icons (B1-numberOfLines2-autoshrink-AX5.png). */}
                    <ThemedText style={[styles.title, { color: textColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                        {title || "Coach Kettle"}
                    </ThemedText>
                </View>

                <View style={styles.headerRight}>
                    {onRoutinePress && (
                        <Pressable
                            onPress={onRoutinePress}
                            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                            accessibilityRole="button"
                            accessibilityLabel="Load routine"
                        >
                            <MaterialCommunityIcons name="clipboard-list-outline" size={24} color={iconColor} />
                        </Pressable>
                    )}
                    <Pressable
                        onPress={onClearPress}
                        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
                        accessibilityRole="button"
                        accessibilityLabel="Clear workout"
                    >
                        <MaterialCommunityIcons name="trash-can-outline" size={24} color={iconColor} />
                    </Pressable>
                </View>
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        minHeight: 44,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        width: 88,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        width: 88,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 8,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 32,
    },
    iconBtn: {
        padding: 8,
        borderRadius: 999,
    },
    iconBtnPressed: {
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
});
