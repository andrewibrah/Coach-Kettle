import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/ui/themed-view';
import { ThemedText } from '@/components/ui/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useIAP } from '@/lib/iap';
import { useAuth } from '@/contexts/AuthProvider';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SUBSCRIPTION } from '@/constants/subscription';

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const activeColor = useThemeColor({}, 'tint');
  const onTint = useThemeColor({}, 'tintForeground');
  const cardBg = useThemeColor({}, 'cardBackground');
  const successColor = useThemeColor({}, 'success');
  const dangerColor = useThemeColor({}, 'danger');

  const { session } = useAuth();
  const { entitlement, isPro, refreshEntitlement } = useEntitlement();
  const { restore, presentCustomerCenter, isProcessing } = useIAP({
    appUserID: session?.user?.id,
    email: session?.user?.email,
    onPurchaseSuccess: refreshEntitlement,
  });
  const sectionTitleColor = '#8E8E93';

  const formatDate = (iso: string | null): string => {
    if (!iso) return 'N/A';
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleRestore = async () => {
    const success = await restore();
    if (success) {
      Alert.alert('Restore Complete', 'Your purchases have been restored.');
    } else {
      Alert.alert('Restore Failed', 'Unable to restore purchases. Please try again.');
    }
  };

  const handleManageSubscription = async () => {
    await presentCustomerCenter();
    await refreshEntitlement();
  };

  const renderStatusIndicator = () => {
    if (isPro) {
      return (
        <View style={[styles.statusRow, { backgroundColor: cardBg }]}>
          <View style={styles.statusContent}>
            <View style={[styles.statusDot, { backgroundColor: successColor }]} />
            <View style={styles.statusText}>
              <ThemedText style={styles.statusLabel}>Coach Kettle Pro</ThemedText>
              <ThemedText style={styles.statusDescription}>
                Renews {formatDate(entitlement.expiresAt)}
              </ThemedText>
            </View>
          </View>
          <IconSymbol name="crown.fill" size={20} color="#FFD700" />
        </View>
      );
    }

    if (entitlement.status === 'trial_active') {
      return (
        <View style={[styles.statusRow, { backgroundColor: cardBg }]}>
          <View style={styles.statusContent}>
            <View style={[styles.statusDot, { backgroundColor: activeColor }]} />
            <View style={styles.statusText}>
              <ThemedText style={styles.statusLabel}>Free Trial</ThemedText>
              <ThemedText style={styles.statusDescription}>
                {entitlement.trialDaysRemaining} {entitlement.trialDaysRemaining === 1 ? 'day' : 'days'} remaining — expires {formatDate(entitlement.expiresAt)}
              </ThemedText>
            </View>
          </View>
        </View>
      );
    }

    // trial_expired or sub_expired
    return (
      <View style={[styles.statusRow, { backgroundColor: cardBg }]}>
        <View style={styles.statusContent}>
          <View style={[styles.statusDot, { backgroundColor: dangerColor }]} />
          <View style={styles.statusText}>
            <ThemedText style={styles.statusLabel}>No Active Plan</ThemedText>
            <ThemedText style={styles.statusDescription}>
              Your {entitlement.status === 'sub_expired' ? 'subscription' : 'trial'} has expired
            </ThemedText>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 20, backgroundColor }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
        >
          <IconSymbol name="chevron.left" size={28} color={textColor} />
        </Pressable>
        <ThemedText type="subtitle" style={styles.title}>
          Subscription
        </ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Current Plan */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Current Plan</ThemedText>
          {renderStatusIndicator()}
        </View>

        {/* Plan Details (if subscribed) */}
        {isPro && (
          <View style={styles.section}>
            <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Plan Details</ThemedText>
            <View style={[styles.detailRow, { backgroundColor: cardBg }]}>
              <ThemedText style={styles.detailLabel}>Next billing date</ThemedText>
              <ThemedText style={styles.detailValue}>{formatDate(entitlement.expiresAt)}</ThemedText>
            </View>
            <View style={[styles.detailRow, { backgroundColor: cardBg }]}>
              <ThemedText style={styles.detailLabel}>Plan price</ThemedText>
              <ThemedText style={styles.detailValue}>
                {entitlement.appleProductId === SUBSCRIPTION.PRODUCT_ID_YEARLY
                  ? `${SUBSCRIPTION.PRICE_YEARLY}/year`
                  : entitlement.appleProductId === SUBSCRIPTION.PRODUCT_ID_MONTHLY
                    ? `${SUBSCRIPTION.PRICE_MONTHLY}/month`
                    : '—'}
              </ThemedText>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <ThemedText style={[styles.sectionTitle, { color: sectionTitleColor }]}>Actions</ThemedText>

          {!isPro && (
            <Pressable
              style={({ pressed }) => [styles.upgradeButton, { backgroundColor: activeColor }, pressed && styles.buttonPressed]}
              onPress={() => router.push('/paywall' as any)}
            >
              <IconSymbol name="crown.fill" size={20} color={onTint} />
              <ThemedText style={[styles.upgradeText, { color: onTint }]}>Upgrade to Pro</ThemedText>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [styles.actionRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed, isProcessing && { opacity: 0.5 }]}
            onPress={handleRestore}
            disabled={isProcessing}
          >
            <View style={styles.actionContent}>
              <IconSymbol name="arrow.clockwise" size={20} color={activeColor} />
              <ThemedText style={styles.actionLabel}>{isProcessing ? 'Restoring...' : 'Restore Purchases'}</ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
          </Pressable>

          {isPro && (
            <Pressable
              style={({ pressed }) => [styles.actionRow, { backgroundColor: cardBg }, pressed && styles.buttonPressed]}
              onPress={handleManageSubscription}
            >
              <View style={styles.actionContent}>
                <IconSymbol name="gear" size={20} color={activeColor} />
                <ThemedText style={styles.actionLabel}>Manage Subscription</ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={16} color={textColor} style={{ opacity: 0.4 }} />
            </Pressable>
          )}
        </View>

        {/* Info Footer */}
        <ThemedText style={styles.footerText}>
          Subscriptions are managed through Apple. Changes take effect at the end of the current billing period.
        </ThemedText>
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
  headerSpacer: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  statusDescription: {
    fontSize: 13,
    opacity: 0.6,
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 15,
    opacity: 0.7,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    marginBottom: 8,
  },
  upgradeText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  footerText: {
    fontSize: 13,
    opacity: 0.5,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
