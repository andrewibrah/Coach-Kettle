// Shared upgrade CTA for feature-gate rejections. Every gated surface funnels
// through here so the copy and the paywall route stay consistent.

import { Alert } from 'react-native';
import { router } from 'expo-router';
import { SUBSCRIPTION } from '@/constants/subscription';

export function showUpgradeAlert(title: string, message: string): void {
  Alert.alert(title, message, [
    { text: 'Not Now', style: 'cancel' },
    { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
  ]);
}

/** The main conversion surface: free user hit the daily AI message cap. */
export function showAiLimitAlert(): void {
  showUpgradeAlert(
    'Daily Limit Reached',
    `You've used your ${SUBSCRIPTION.FREE_AI_MESSAGES_PER_DAY} free messages today — upgrade for unlimited.`
  );
}
