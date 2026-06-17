import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthLock } from '@/contexts/AuthLockProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { ThemedText } from '@/components/ui/themed-text';
import { ThemedView } from '@/components/ui/themed-view';
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from '@/constants/legal';
import { useThemeColor } from '@/hooks/useThemeColor';

type DocType = 'terms' | 'privacy';

export function TermsOfServiceScreen() {
    const { acceptTerms } = useAuthLock();
    const { signOut } = useAuth();
    const router = useRouter();
    const [isAccepting, setIsAccepting] = useState(false);
    const [activeDoc, setActiveDoc] = useState<DocType>('terms');
    const insets = useSafeAreaInsets();
    const primaryColor = useThemeColor({}, 'tint');
    const onTint = useThemeColor({}, 'tintForeground');
    const borderColor = useThemeColor({}, 'border');

    const handleAccept = async () => {
        setIsAccepting(true);
        try {
            const success = await acceptTerms();
            if (success) {
                console.log('[TermsOfService] Terms accepted, navigating to app...');
                router.replace('/(tabs)');
            } else {
                // Server sync failed after all retries. Local acceptance is recorded.
                // Offer a clear retry path so a transient network failure (notably
                // observed on iPad in App Review) does not strand the user here.
                Alert.alert(
                    'Network Error',
                    'We could not save your acceptance to our servers. Please check your connection and try again.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Retry', onPress: () => { void handleAccept(); } },
                    ]
                );
            }
        } catch (error: any) {
            console.error('[TermsOfService] Accept error:', {
                message: error?.message,
                stack: error?.stack,
            });
            Alert.alert(
                'Error',
                error?.message ? `Could not accept terms: ${error.message}` : 'An unexpected error occurred. Please try again.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Retry', onPress: () => { void handleAccept(); } },
                ]
            );
        } finally {
            setIsAccepting(false);
        }
    };

    const handleDecline = () => {
        Alert.alert(
            'Decline Terms',
            'You must accept the terms to use Coach Kettle. Declining will sign you out.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Decline and Sign Out', style: 'destructive', onPress: signOut },
            ]
        );
    };

    const content = activeDoc === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY;

    return (
        <ThemedView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <ThemedView style={styles.header}>
                <ThemedText type="title">Terms & Privacy</ThemedText>
                <ThemedText style={styles.subtitle}>Please review and accept to continue</ThemedText>
            </ThemedView>

            {/* Tab Switcher */}
            <View style={[styles.tabContainer, { borderColor }]}>
                <Pressable
                    style={[
                        styles.tab,
                        activeDoc === 'terms' && { backgroundColor: primaryColor },
                    ]}
                    onPress={() => setActiveDoc('terms')}
                >
                    <ThemedText style={[
                        styles.tabText,
                        activeDoc === 'terms' && [styles.tabTextActive, { color: onTint }],
                    ]}>
                        Terms of Service
                    </ThemedText>
                </Pressable>
                <Pressable
                    style={[
                        styles.tab,
                        activeDoc === 'privacy' && { backgroundColor: primaryColor },
                    ]}
                    onPress={() => setActiveDoc('privacy')}
                >
                    <ThemedText style={[
                        styles.tabText,
                        activeDoc === 'privacy' && [styles.tabTextActive, { color: onTint }],
                    ]}>
                        Privacy Policy
                    </ThemedText>
                </Pressable>
            </View>

            <ThemedView style={[styles.contentContainer, { borderColor }]}>
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                    <MarkdownText content={content} />
                </ScrollView>
            </ThemedView>

            <ThemedView style={styles.footer}>
                <Pressable
                    style={({ pressed }) => [
                        styles.button,
                        styles.acceptButton,
                        { backgroundColor: primaryColor },
                        pressed && styles.buttonPressed,
                    ]}
                    onPress={handleAccept}
                    disabled={isAccepting}
                >
                    {isAccepting ? (
                        <ActivityIndicator color={onTint} />
                    ) : (
                        <ThemedText style={[styles.buttonText, { color: onTint }]}>Accept and Continue</ThemedText>
                    )}
                </Pressable>

                <Pressable
                    style={({ pressed }) => [styles.declineButton, pressed && styles.buttonPressed]}
                    onPress={handleDecline}
                    disabled={isAccepting}
                >
                    <ThemedText style={styles.declineText}>Decline</ThemedText>
                </Pressable>
            </ThemedView>
        </ThemedView>
    );
}

/**
 * Simple markdown-like text renderer
 */
function MarkdownText({ content }: { content: string }) {
    const lines = content.split('\n');

    return (
        <View>
            {lines.map((line, index) => {
                const trimmed = line.trim();

                if (!trimmed) {
                    return <View key={index} style={styles.spacer} />;
                }

                if (trimmed.startsWith('# ')) {
                    return (
                        <ThemedText key={index} style={styles.h1}>
                            {trimmed.slice(2)}
                        </ThemedText>
                    );
                }

                if (trimmed.startsWith('## ')) {
                    return (
                        <ThemedText key={index} style={styles.h2}>
                            {trimmed.slice(3)}
                        </ThemedText>
                    );
                }

                if (trimmed.startsWith('### ')) {
                    return (
                        <ThemedText key={index} style={styles.h3}>
                            {trimmed.slice(4)}
                        </ThemedText>
                    );
                }

                if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                    return (
                        <View key={index} style={styles.bulletContainer}>
                            <ThemedText style={styles.bullet}>•</ThemedText>
                            <ThemedText style={styles.bulletText}>
                                {renderInlineFormatting(trimmed.slice(2))}
                            </ThemedText>
                        </View>
                    );
                }

                return (
                    <ThemedText key={index} style={styles.paragraph}>
                        {renderInlineFormatting(trimmed)}
                    </ThemedText>
                );
            })}
        </View>
    );
}

function renderInlineFormatting(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);

    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <ThemedText key={index} style={styles.bold}>
                    {part.slice(2, -2)}
                </ThemedText>
            );
        }
        return part;
    });
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 16,
    },
    subtitle: {
        fontSize: 16,
        opacity: 0.6,
        marginTop: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        borderRadius: 10,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 12,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
    },
    tabTextActive: {
        color: '#fff',
    },
    contentContainer: {
        flex: 1,
        marginHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    scrollView: {
        padding: 16,
    },
    scrollContent: {
        paddingBottom: 24,
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
    acceptButton: {},
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    buttonPressed: {
        opacity: 0.7,
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
    // Markdown styles
    spacer: {
        height: 8,
    },
    h1: {
        fontSize: 24,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 12,
    },
    h2: {
        fontSize: 20,
        fontWeight: '700',
        marginTop: 20,
        marginBottom: 8,
    },
    h3: {
        fontSize: 17,
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 6,
    },
    paragraph: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 8,
    },
    bulletContainer: {
        flexDirection: 'row',
        paddingLeft: 8,
        marginBottom: 6,
    },
    bullet: {
        fontSize: 15,
        marginRight: 8,
    },
    bulletText: {
        flex: 1,
        fontSize: 15,
        lineHeight: 22,
    },
    bold: {
        fontWeight: '700',
    },
});
