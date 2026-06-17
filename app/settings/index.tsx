import { useAuth } from '@/contexts/AuthProvider';
import { useTheme } from '@/contexts/ThemeProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { TutorialModal } from '@/components/tutorial/TutorialModal';
import { Toast } from '@/components/ui/Toast';
import { useProfile } from '@/contexts/ProfileContext';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useToast } from '@/hooks/useToast';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

export default function SettingsScreen() {
    const { signOut, session, clearAllCaches } = useAuth();
    const { profile } = useProfile();
    const { isPro, entitlement } = useEntitlement();
    const { themeMode, setThemeMode, isDark } = useTheme();
    const router = useRouter();
    const backgroundColor = useThemeColor({}, 'background');
    const textColor = useThemeColor({}, 'text');
    const activeColor = useThemeColor({}, 'tint');
    const [isClearing, setIsClearing] = useState(false);
    const [tutorialVisible, setTutorialVisible] = useState(false);
    const { toast, showToast, hideToast } = useToast();

    // Dynamic colors for dark mode
    const cardBg = useThemeColor({}, 'cardBackground');
    const dangerColor = useThemeColor({}, 'danger');
    const sectionTitleColor = '#8E8E93'; // iOS system gray — same in both themes
    const cacheBg = isDark ? '#3d2d00' : '#FFF8E6';
    const logoutBg = isDark ? '#3d1515' : '#FFF1F0';

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
                            showToast('Cache cleared', 'success');
                        } catch (error) {
                            console.error('Failed to clear cache:', error);
                            showToast('Failed to clear cache. Please try again.', 'error');
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
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={hideToast} />}
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

                {/* Subscription Section */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Subscription</ThemedText>
                    <Pressable
                        style={({ pressed }) => [styles.navRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
                        onPress={() => router.push('/settings/subscription' as any)}
                    >
                        <View style={styles.navRowContent}>
                            <IconSymbol name="crown.fill" size={20} color={isPro ? '#FFD700' : activeColor} />
                            <View style={styles.navRowText}>
                                <ThemedText style={styles.navRowLabel}>
                                    {isPro ? 'Coach Kettle Pro' : 'Subscription'}
                                </ThemedText>
                                <ThemedText style={styles.navRowDescription}>
                                    {isPro ? 'Manage your subscription' : entitlement.status === 'trial_active' ? `Trial: ${entitlement.trialDaysRemaining} days left` : 'Upgrade to Pro'}
                                </ThemedText>
                            </View>
                        </View>
                        <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
                    </Pressable>
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

                {/* Coaching Section */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Coaching</ThemedText>
                    <Pressable
                        style={({ pressed }) => [styles.navRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
                        onPress={() => router.push('/form' as any)}
                    >
                        <View style={styles.navRowContent}>
                            <IconSymbol name="camera.fill" size={20} color={activeColor} />
                            <View style={styles.navRowText}>
                                <ThemedText style={styles.navRowLabel}>Form check</ThemedText>
                                <ThemedText style={styles.navRowDescription}>
                                    Camera rep count, ROM score, and direct technique cues
                                </ThemedText>
                            </View>
                        </View>
                        <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [styles.navRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
                        onPress={() => router.push('/settings/nutrition-preferences' as any)}
                    >
                        <View style={styles.navRowContent}>
                            <IconSymbol name="fork.knife" size={20} color={activeColor} />
                            <View style={styles.navRowText}>
                                <ThemedText style={styles.navRowLabel}>Nutrition preferences</ThemedText>
                                <ThemedText style={styles.navRowDescription}>
                                    Sex, activity, goal, dietary prefs — drives macros and meal plan
                                </ThemedText>
                            </View>
                        </View>
                        <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
                    </Pressable>
                    <Pressable
                        style={({ pressed }) => [styles.navRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
                        onPress={() => router.push('/settings/notifications' as any)}
                    >
                        <View style={styles.navRowContent}>
                            <IconSymbol name="bell.fill" size={20} color={activeColor} />
                            <View style={styles.navRowText}>
                                <ThemedText style={styles.navRowLabel}>Notifications</ThemedText>
                                <ThemedText style={styles.navRowDescription}>
                                    Rest timer, coach reports, workout reminders
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

                {/* Help Section */}
                <View style={styles.section}>
                    <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Help</ThemedText>
                    <Pressable
                        style={({ pressed }) => [styles.navRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
                        onPress={() => setTutorialVisible(true)}
                    >
                        <View style={styles.navRowContent}>
                            <IconSymbol name="questionmark.circle" size={20} color={activeColor} />
                            <View style={styles.navRowText}>
                                <ThemedText style={styles.navRowLabel}>How to use Coach Kettle</ThemedText>
                                <ThemedText style={styles.navRowDescription}>
                                    Replay the walkthrough of logging, history, and coaching
                                </ThemedText>
                            </View>
                        </View>
                        <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
                    </Pressable>
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
                        <IconSymbol name="rectangle.portrait.and.arrow.right" size={20} color={dangerColor} />
                        <Text style={[styles.logoutText, { color: dangerColor }]}>Log Out</Text>
                    </Pressable>
                </View>
            </ScrollView>

            <TutorialModal
                visible={tutorialVisible}
                onDismiss={() => setTutorialVisible(false)}
            />
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
