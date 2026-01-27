import { useAuthLock } from '@/components/AuthLockProvider';
import { useAuth } from '@/components/AuthProvider';
import { useTheme } from '@/components/ThemeProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors } from '@/constants/theme';
import { useProfile } from '@/contexts/ProfileContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getBiometricDisplayName } from '@/lib/biometrics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

export default function SettingsScreen() {
    const { signOut, session, clearAllCaches } = useAuth();
    const {
        biometricStatus,
        biometricEnabled,
        setBiometricEnabled,
    } = useAuthLock();
    const { profile } = useProfile();
    const { themeMode, setThemeMode, isDark } = useTheme();
    const router = useRouter();
    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const activeColor = useThemeColor({}, 'tint');
    const [isClearing, setIsClearing] = useState(false);

    // Dynamic colors for dark mode
    const cardBg = isDark ? Colors.dark.cardBackground : '#F2F2F7';
    const sectionTitleColor = isDark ? '#8E8E93' : '#8E8E93';
    const warningBg = isDark ? '#3d2d00' : '#FFF8E6';
    const warningTextColor = isDark ? '#FFD60A' : '#996600';
    const infoBg = isDark ? '#0a2540' : '#E8F4FD';
    const infoTextColor = isDark ? '#64B5F6' : '#0066CC';
    const cacheBg = isDark ? '#3d2d00' : '#FFF8E6';
    const logoutBg = isDark ? '#3d1515' : '#FFF1F0';

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
        <ThemedView style={[styles.container, { backgroundColor }]}>
            <ScreenHeader title="Settings" />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Account</ThemedText>
                    {session?.user?.email && (
                        <View style={[styles.emailContainer, { backgroundColor: cardBg }]}>
                            <ThemedText style={styles.emailText}>{session.user.email}</ThemedText>
                        </View>
                    )}
                </View>

                {/* Profile Section */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Profile</ThemedText>
                    <Pressable
                        style={({ pressed }) => [styles.navRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
                        onPress={() => router.push('/settings/profile' as any)}
                    >
                        <View style={styles.navRowContent}>
                            <IconSymbol name="person.fill" size={20} color={activeColor} />
                            <View style={styles.navRowText}>
                                <ThemedText style={styles.navRowLabel}>Edit Profile</ThemedText>
                                <ThemedText style={styles.navRowDescription}>
                                    {profile?.focus
                                        ? `Focus: ${profile.focus.replace('_', ' ')}`
                                        : profile
                                            ? 'Update your fitness info'
                                            : 'Set up your fitness profile'}
                                </ThemedText>
                            </View>
                        </View>
                        <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
                    </Pressable>
                </View>

                {/* PR Tracking Section */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>PR Tracking</ThemedText>
                    <Pressable
                        style={({ pressed }) => [styles.navRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
                        onPress={() => router.push('/settings/pr-tracking' as any)}
                    >
                        <View style={styles.navRowContent}>
                            <IconSymbol name="trophy.fill" size={20} color="#FFD700" />
                            <View style={styles.navRowText}>
                                <ThemedText style={styles.navRowLabel}>Personal Records</ThemedText>
                                <ThemedText style={styles.navRowDescription}>
                                    Manage tracked lifts and view PR history
                                </ThemedText>
                            </View>
                        </View>
                        <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
                    </Pressable>
                </View>

                {/* Appearance Section */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Appearance</ThemedText>
                    <View style={[styles.settingRow, { backgroundColor: cardBg }]}>
                        <View style={styles.settingInfo}>
                            <ThemedText style={styles.settingLabel}>Dark Mode</ThemedText>
                            <ThemedText style={styles.settingDescription}>
                                {themeMode === 'system' ? 'Following system setting' : themeMode === 'dark' ? 'Always dark' : 'Always light'}
                            </ThemedText>
                        </View>
                        <Switch
                            value={isDark}
                            onValueChange={(value) => setThemeMode(value ? 'dark' : 'light')}
                            trackColor={{ false: '#767577', true: activeColor }}
                            thumbColor="#fff"
                        />
                    </View>
                    <Pressable
                        style={({ pressed }) => [styles.systemThemeButton, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
                        onPress={() => setThemeMode('system')}
                    >
                        <IconSymbol name="gear" size={20} color={textColor} />
                        <Text style={[styles.systemThemeText, { color: textColor }]}>Use System Setting</Text>
                        {themeMode === 'system' && (
                            <IconSymbol name="checkmark" size={20} color={activeColor} />
                        )}
                    </Pressable>
                </View>

                {/* Security Section */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Security</ThemedText>

                    {/* Biometric Toggle */}
                    <View style={[styles.settingRow, { backgroundColor: cardBg }]}>
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
                        <View style={[styles.infoBox, { backgroundColor: infoBg }]}>
                            <IconSymbol name="lock.shield" size={16} color={activeColor} />
                            <Text style={[styles.infoText, { color: infoTextColor }]}>
                                Your biometric data never leaves your device. Coach Kettle only receives a success/fail result from your device&apos;s secure enclave.
                            </Text>
                        </View>
                    )}

                    {!canUseBiometrics && (
                        <View style={[styles.warningBox, { backgroundColor: warningBg }]}>
                            <IconSymbol name="exclamationmark.triangle" size={16} color={isDark ? '#FFD60A' : '#FF9500'} />
                            <Text style={[styles.warningText, { color: warningTextColor }]}>
                                Set up Face ID, Touch ID, or a device passcode in Settings to enable this feature.
                            </Text>
                        </View>
                    )}
                </View>

                {/* Data Section */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Data</ThemedText>
                    <Pressable
                        style={({ pressed }) => [styles.cacheButton, { backgroundColor: cacheBg }, pressed && styles.buttonPressed]}
                        onPress={handleClearCache}
                        disabled={isClearing}
                    >
                        <IconSymbol name="trash" size={20} color={isDark ? '#FFD60A' : '#FF9500'} />
                        <Text style={[styles.cacheText, { color: isDark ? '#FFD60A' : '#FF9500' }]}>{isClearing ? 'Clearing...' : 'Clear Local Cache'}</Text>
                    </Pressable>
                </View>

                {/* Account Actions */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Account Actions</ThemedText>
                    <Pressable
                        style={({ pressed }) => [styles.logoutButton, { backgroundColor: logoutBg }, pressed && styles.buttonPressed]}
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
    scrollContent: {
        paddingHorizontal: 20,
    },
    section: {
        marginBottom: 12,
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
    systemThemeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 10,
    },
    systemThemeText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '500',
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
    navRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        marginBottom: 8,
    },
    navRowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    navRowText: {
        flex: 1,
    },
    navRowLabel: {
        fontSize: 16,
        fontWeight: '500',
    },
    navRowDescription: {
        fontSize: 13,
        opacity: 0.6,
        marginTop: 2,
    },
});
