import { useEffect } from 'react';
import { BackHandler, Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/ui/themed-text';
import { TermsOfServiceScreen } from '@/components/TermsOfServiceScreen';
import { useAuthLock } from '@/contexts/AuthLockProvider';
import { closeLegalReader, resolveLegalRoute } from '@/lib/legalMode';

/**
 * Two modes on one route (resolution rules live in lib/legalMode.ts):
 *   /terms-of-service                        -> sign-up acceptance gate (the default)
 *   /terms-of-service?doc=privacy&mode=read  -> reader, Privacy tab preselected, no Accept/Decline
 *
 * The acceptance gate relies on the no-param default, so the `needsTermsAcceptance` redirect in
 * app/(tabs)/_layout.tsx keeps working untouched.
 */
export default function Page() {
    const params = useLocalSearchParams<{ doc?: string | string[]; mode?: string | string[] }>();
    const { needsTermsAcceptance } = useAuthLock();
    const { mode, doc } = resolveLegalRoute(params, { needsTermsAcceptance });
    const readOnly = mode === 'reader';

    // Android hardware back would otherwise pop the gate and expose whatever is beneath it.
    useEffect(() => {
        if (readOnly) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
        return () => subscription.remove();
    }, [readOnly]);

    return (
        <>
            {/* The native title is set by TermsOfServiceScreen so it follows the document tab.

                The reader needs a real dismiss control: this route is presented as a modal,
                which gives no back chevron, and swipe-to-dismiss alone is not an accessible
                affordance. The acceptance gate gets NO close, back button or swipe dismissal —
                there the user must choose Accept or Decline. */}
            <Stack.Screen
                options={{
                    gestureEnabled: readOnly,
                    headerBackVisible: false,
                    headerLeft: readOnly
                        ? () => (
                            <Pressable
                                onPress={() => closeLegalReader(router)}
                                hitSlop={12}
                                style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                                accessibilityHint="Returns to the previous screen"
                            >
                                <ThemedText type="link">Close</ThemedText>
                            </Pressable>
                        )
                        : () => null,
                }}
            />
            <TermsOfServiceScreen key={`${mode}:${doc}`} initialDoc={doc} readOnly={readOnly} />
        </>
    );
}
