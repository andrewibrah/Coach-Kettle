import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { useAuthLock } from '@/components/AuthLockProvider';
import { useAuth } from '@/components/AuthProvider';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function TermsOfServiceScreen() {
    const colorScheme = useColorScheme() ?? 'light';
    const { acceptTerms } = useAuthLock();
    const { signOut } = useAuth();
    const router = useRouter();
    const [isAccepting, setIsAccepting] = useState(false);
    const insets = useSafeAreaInsets();

    const handleAccept = async () => {
        setIsAccepting(true);
        try {
            const success = await acceptTerms();
            if (success) {
                // Terms accepted - navigate to main app
                console.log('[TermsOfService] Terms accepted, navigating to app...');
                router.replace('/(tabs)');
            } else {
                Alert.alert('Error', 'Failed to save terms acceptance. Please try again.');
            }
        } catch (error) {
            console.error('[TermsOfService] Accept error:', error);
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
        } finally {
            setIsAccepting(false);
        }
    };

    const handleDecline = () => {
        Alert.alert(
            'Decline Terms',
            'You must accept the terms to use the app. Declining will sign you out.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Decline and Sign Out', style: 'destructive', onPress: signOut },
            ]
        );
    };

    return (
        <ThemedView style={[styles.container, { paddingBottom: insets.bottom }]}>
            <ThemedView style={styles.header}>
                <ThemedText style={styles.subtitle}>Please review and accept to continue</ThemedText>
            </ThemedView>

            <ThemedView style={styles.contentContainer}>
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                    <ThemedText type="defaultSemiBold">1. Acceptance of Terms</ThemedText>
                    <ThemedText style={styles.paragraph}>
                        By using WorkoutTracker, you agree to be bound by these terms. If you do not agree, please do not use the application.
                    </ThemedText>

                    <ThemedText type="defaultSemiBold">2. User Conduct</ThemedText>
                    <ThemedText style={styles.paragraph}>
                        You agree to use the app for lawful purposes only and in a way that does not infringe the rights of others.
                    </ThemedText>

                    <ThemedText type="defaultSemiBold">3. Data Privacy</ThemedText>
                    <ThemedText style={styles.paragraph}>
                        Your workout data is stored securely in Supabase. We do not sell your personal information to third parties.
                    </ThemedText>

                    <ThemedText type="defaultSemiBold">4. Liability</ThemedText>
                    <ThemedText style={styles.paragraph}>
                        WorkoutTracker is provided &quot;as is&quot;. Use at your own risk. Consult a physician before starting any exercise program.
                    </ThemedText>

                    <ThemedText type="defaultSemiBold">5. Updates to Terms</ThemedText>
                    <ThemedText style={styles.paragraph}>
                        We may update these terms from time to time. Your continued use of the app after such changes constitutes acceptance.
                    </ThemedText>

                    <ThemedText style={styles.paragraph}>
                        [Placeholder for actual Terms of Service and Privacy Policy text. In a production app, this would be more comprehensive.]
                    </ThemedText>
                </ScrollView>
            </ThemedView>

            <ThemedView style={styles.footer}>
                <TouchableOpacity
                    style={[styles.button, styles.acceptButton, { backgroundColor: Colors[colorScheme].tint }]}
                    onPress={handleAccept}
                    disabled={isAccepting}
                >
                    {isAccepting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <ThemedText style={styles.buttonText}>Accept and Continue</ThemedText>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.declineButton}
                    onPress={handleDecline}
                    disabled={isAccepting}
                >
                    <ThemedText style={styles.declineText}>Decline</ThemedText>
                </TouchableOpacity>
            </ThemedView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 16,
    },
    subtitle: {
        fontSize: 16,
        opacity: 0.6,
        marginTop: 4,
    },
    contentContainer: {
        flex: 1,
        marginHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(150, 150, 150, 0.2)',
        overflow: 'hidden',
    },
    scrollView: {
        padding: 16,
    },
    scrollContent: {
        paddingBottom: 24,
    },
    paragraph: {
        marginTop: 8,
        marginBottom: 16,
        lineHeight: 20,
        opacity: 0.8,
    },
    footer: {
        padding: 24,
        gap: 12,
    },
    button: {
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    acceptButton: {
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    declineButton: {
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    declineText: {
        fontSize: 16,
        opacity: 0.6,
    },
});
