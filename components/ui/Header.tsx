import { IconSymbol } from "@/components/ui/icon-symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type HeaderProps = {
    title?: string | null;
    onMenuPress: () => void;
    onClearPress: () => void;
};

export function Header({ title, onMenuPress, onClearPress }: HeaderProps) {
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
                    >
                        <IconSymbol name="line.3.horizontal" size={24} color={iconColor} />
                    </Pressable>
                </View>

                <View style={styles.titleContainer}>
                    <ThemedText style={[styles.title, { color: textColor }]} numberOfLines={1}>
                        {title || "Coach Kettle"}
                    </ThemedText>
                </View>

                <View style={styles.headerRight}>
                    <Pressable
                        onPress={onClearPress}
                        style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
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
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
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
