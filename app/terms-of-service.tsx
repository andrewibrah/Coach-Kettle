import { Pressable } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/ui/themed-text';
import { TermsOfServiceScreen } from '@/components/TermsOfServiceScreen';

/**
 * Two modes on one route:
 *   /terms-of-service                        -> sign-up acceptance gate (unchanged default)
 *   /terms-of-service?doc=privacy&mode=read  -> reader, Privacy tab preselected, no Accept/Decline
 *
 * The acceptance gate relies on the no-param default, so the `needsTermsAcceptance` redirect in
 * app/(tabs)/_layout.tsx keeps working untouched.
 */
export default function Page() {
    const { doc, mode } = useLocalSearchParams<{ doc?: string; mode?: string }>();
    const initialDoc = doc === 'privacy' ? 'privacy' : 'terms';
    const readOnly = mode === 'read';

    return (
        <>
            {/* The root layout registers this route with a static title of "Terms of Service".
                That contradicts the content when ?doc=privacy is showing the Privacy Policy, so
                the title is set from the param here rather than editing the shared root layout.

                The reader also needs a real dismiss control: this route is presented as a modal,
                which gives no back chevron, and swipe-to-dismiss alone is not an accessible
                affordance. The acceptance gate deliberately gets NO close button — there the
                user must choose Accept or Decline. */}
            <Stack.Screen
                options={{
                    title: initialDoc === 'privacy' ? 'Privacy Policy' : 'Terms of Service',
                    headerLeft: readOnly
                        ? () => (
                            <Pressable
                                onPress={() => router.back()}
                                hitSlop={12}
                                style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                                accessibilityHint="Returns to the previous screen"
                            >
                                <ThemedText type="link">Close</ThemedText>
                            </Pressable>
                        )
                        : undefined,
                }}
            />
            <TermsOfServiceScreen initialDoc={initialDoc} readOnly={readOnly} />
        </>
    );
}
