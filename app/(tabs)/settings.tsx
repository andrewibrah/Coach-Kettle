import { useAuth } from '@/components/AuthProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
    const { signOut, session } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');

    const handleLogout = async () => {
        try {
            await signOut();
            // Redirect happens automatically in _layout.tsx when session becomes null
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    return (
        <ThemedView style={[styles.container, { paddingTop: insets.top + 20, backgroundColor }]}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}>
                    <IconSymbol name="chevron.left" size={28} color={textColor} />
                </Pressable>
                <ThemedText type="subtitle" style={styles.title}>Settings</ThemedText>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Account</ThemedText>
                    {session?.user?.email && (
                        <View style={styles.emailContainer}>
                            <ThemedText style={styles.emailText}>{session.user.email}</ThemedText>
                        </View>
                    )}
                    <Pressable
                        style={({ pressed }) => [styles.logoutButton, pressed && styles.buttonPressed]}
                        onPress={handleLogout}
                    >
                        <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color="#FF3B30" />
                        <Text style={styles.logoutText}>Log Out</Text>
                    </Pressable>
                </View>
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    backButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#8E8E93',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF1F0',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 10,
    },
    logoutText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FF3B30',
    },
    emailContainer: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#F2F2F7',
        borderRadius: 12,
        marginBottom: 12,
    },
    emailText: {
        fontSize: 16,
        fontWeight: '500',
    },
    buttonPressed: {
        opacity: 0.7,
    },
});
