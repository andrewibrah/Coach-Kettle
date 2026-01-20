import { useAuth } from '@/components/AuthProvider';
import { useAuthLock } from '@/components/AuthLockProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getBiometricDisplayName } from '@/lib/biometrics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
    const { signOut, session, clearAllCaches } = useAuth();
    const {
        biometricStatus,
        biometricEnabled,
        setBiometricEnabled,
    } = useAuthLock();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const activeColor = useThemeColor({}, 'tint');
    const [isClearing, setIsClearing] = useState(false);

    // Check if biometrics can be used
    const canUseBiometrics = biometricStatus?.isEnrolled || biometricStatus?.canUsePasscode;
    const biometricName = biometricStatus
        ? getBiometricDisplayName(biometricStatus.biometricType)
        : 'Biometrics';

    const handleBiometricToggle = async (value: boolean) => {
        if (value && !canUseBiometrics) {
            Alert.alert(
                'Not Available',
                'Please set up Face ID, Touch ID, or a device passcode in your device settings first.'
            );
            return;
        }

        await setBiometricEnabled(value);

        if (value) {
            Alert.alert(
                `${biometricName} Enabled`,
                'Your session will now require biometric verification after 4 hours of inactivity.'
            );
        }
    };

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
                </View>

                {/* Security Section */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Security</ThemedText>

                    {/* Biometric Toggle */}
                    <View style={styles.settingRow}>
                        <View style={styles.settingInfo}>
                            <ThemedText style={styles.settingLabel}>
                                Use {biometricName} for faster login
                            </ThemedText>
                            <ThemedText style={styles.settingDescription}>
                                Require verification after 4 hours of inactivity
                            </ThemedText>
                        </View>
                        <Switch
                            value={biometricEnabled}
                            onValueChange={handleBiometricToggle}
                            trackColor={{ false: '#767577', true: activeColor }}
                            thumbColor="#fff"
                            disabled={!canUseBiometrics && !biometricEnabled}
                        />
                    </View>

                    {/* Biometric Explanation */}
                    {biometricEnabled && (
                        <View style={styles.infoBox}>
                            <IconSymbol name="lock.shield" size={16} color={activeColor} />
                            <ThemedText style={styles.infoText}>
                                Your biometric data never leaves your device. EasyWorkouts only receives a success/fail result from your device&apos;s secure enclave.
                            </ThemedText>
                        </View>
                    )}

                    {!canUseBiometrics && (
                        <View style={styles.warningBox}>
                            <IconSymbol name="exclamationmark.triangle" size={16} color="#FF9500" />
                            <ThemedText style={styles.warningText}>
                                Set up Face ID, Touch ID, or a device passcode in Settings to enable this feature.
                            </ThemedText>
                        </View>
                    )}
                </View>

                {/* Data Section */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Data</ThemedText>
                    <Pressable
                        style={({ pressed }) => [styles.cacheButton, pressed && styles.buttonPressed]}
                        onPress={handleClearCache}
                        disabled={isClearing}
                    >
                        <IconSymbol name="trash" size={20} color="#FF9500" />
                        <Text style={styles.cacheText}>{isClearing ? 'Clearing...' : 'Clear Local Cache'}</Text>
                    </Pressable>
                </View>

                {/* Account Actions */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Account Actions</ThemedText>
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
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F2F2F7',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    settingInfo: {
        flex: 1,
        marginRight: 12,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 2,
    },
    settingDescription: {
        fontSize: 13,
        opacity: 0.6,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#E8F4FD',
        padding: 12,
        borderRadius: 8,
        gap: 8,
        marginBottom: 12,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
        color: '#0066CC',
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#FFF8E6',
        padding: 12,
        borderRadius: 8,
        gap: 8,
        marginBottom: 12,
    },
    warningText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
        color: '#996600',
    },
});
