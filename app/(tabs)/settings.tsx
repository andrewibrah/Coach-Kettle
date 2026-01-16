import { useAuth } from '@/components/AuthProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
    const { signOut, session, clearAllCaches } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const border = useThemeColor({}, 'border');
    const activeColor = useThemeColor({}, 'tint');
    const [isClearing, setIsClearing] = useState(false);

    const handleLogout = async () => {
        try {
            await signOut();
            // Redirect happens automatically in _layout.tsx when session becomes null
        } catch (error) {
            console.error('Logout failed:', error);
        }
    };

    const handleClearCache = async () => {
        Alert.alert(
            'Clear Cache',
            'This will clear all local workout data and cached sessions. Your cloud data will not be affected.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: async () => {
                        setIsClearing(true);
                        try {
                            await clearAllCaches();
                            Alert.alert('Success', 'All local caches have been cleared.');
                        } catch (error) {
                            console.error('Failed to clear cache:', error);
                            Alert.alert('Error', 'Failed to clear cache. Please try again.');
                        } finally {
                            setIsClearing(false);
                        }
                    },
                },
            ]
        );
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
                        style={({ pressed }) => [styles.cacheButton, pressed && styles.buttonPressed]}
                        onPress={handleClearCache}
                        disabled={isClearing}
                    >
                        <IconSymbol name="trash" size={20} color="#FF9500" />
                        <Text style={styles.cacheText}>{isClearing ? 'Clearing...' : 'Clear Local Cache'}</Text>
                    </Pressable>
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
    cacheButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF8E6',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 10,
        marginBottom: 12,
    },
    cacheText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FF9500',
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
    optionsContainer: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    optionSelected: {
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
});
