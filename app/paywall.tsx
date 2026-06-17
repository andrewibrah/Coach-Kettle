import { AppLogo } from '@/components/AppLogo';
import { useAuth } from '@/contexts/AuthProvider';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/ui/themed-text';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useIAP } from '@/lib/iap';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const BADGE_HEIGHT = 28;

type Plan = 'monthly' | 'yearly';
type PaywallPlan = {
  id: Plan;
  name: string;
  price: string;
  period: string;
  badge: string | null;
};

const FEATURES = [
  { icon: 'bubble.left.and.bubble.right.fill', label: 'Unlimited AI Coach Messages' },
  { icon: 'chart.bar.fill', label: 'Advanced Workout Analytics' },
  { icon: 'doc.text.fill', label: 'Unlimited Custom Templates' },
  { icon: 'sparkles', label: 'Ad-Free Experience' },
] as const;

export default function PaywallScreen() {
  const router = useRouter();
  const colors = {
    background: useThemeColor({}, 'background'),
    placeholder: useThemeColor({}, 'placeholder'),
    cardBackground: useThemeColor({}, 'cardBackground'),
    tint: useThemeColor({}, 'tint'),
    border: useThemeColor({}, 'border'),
    tintForeground: useThemeColor({}, 'tintForeground'),
    text: useThemeColor({}, 'text'),
    danger: useThemeColor({}, 'danger'),
  };
  const { needsPaywall, needsInitialPaywall, dismissPaywall, refreshEntitlement } = useEntitlement();
  const { session, signOut } = useAuth();
  const { products, purchase, restore, isLoadingProducts, isProcessing, error: iapError } = useIAP({
    appUserID: session?.user?.id,
    email: session?.user?.email,
    onPurchaseSuccess: refreshEntitlement,
  });
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly');
  const [isDismissing, setIsDismissing] = useState(false);

  const monthlyProduct = products.find(p => p.plan === 'monthly');
  const yearlyProduct = products.find(p => p.plan === 'yearly');
  const availablePlans: PaywallPlan[] = [];

  if (monthlyProduct) {
    availablePlans.push({
      id: 'monthly',
      name: 'Monthly',
      price: monthlyProduct.localizedPrice,
      period: '/month',
      badge: null,
    });
  }
  if (yearlyProduct) {
    availablePlans.push({
      id: 'yearly',
      name: 'Yearly',
      price: yearlyProduct.localizedPrice,
      period: '/year',
      badge: 'Best Value',
    });
  }
  const selectedPlanConfig = availablePlans.find(plan => plan.id === selectedPlan);
  const hasPurchasableProducts = availablePlans.length > 0;
  const isExpiredMode = needsPaywall;
  const isInitialMode = needsInitialPaywall;

  useEffect(() => {
    if (products.length === 0 || products.some(product => product.plan === selectedPlan)) return;

    const fallbackProduct =
      products.find(product => product.plan === 'yearly') ??
      products.find(product => product.plan === 'monthly');

    if (fallbackProduct) {
      setSelectedPlan(fallbackProduct.plan);
    }
  }, [products, selectedPlan]);

  const handleSubscribe = async () => {
    if (!selectedPlanConfig) return;

    const unlocked = await purchase(selectedPlan);
    if (unlocked) {
      await refreshEntitlement();
      router.replace('/(tabs)' as any);
    }
  };

  const handleSkip = async () => {
    setIsDismissing(true);
    try {
      await dismissPaywall();
    } catch (error) {
      console.error('[Paywall] Error dismissing paywall:', error);
    } finally {
      setIsDismissing(false);
      router.replace('/(tabs)' as any);
    }
  };

  const handleRestore = async () => {
    await restore();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('[Paywall] Error signing out:', error);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Pressable
        style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}
        onPress={handleSkip}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={26} color={colors.placeholder} />
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.logoContainer}>
          <AppLogo size={72} />
        </View>

        <ThemedText style={styles.title}>Coach Kettle Pro</ThemedText>

        <ThemedText style={[styles.subtitle, { color: colors.placeholder }]}>
          {isExpiredMode ? 'Your trial has ended - upgrade or continue free' : 'Unlock everything. Cancel anytime.'}
        </ThemedText>

        <View style={styles.featuresContainer}>
          {FEATURES.map((feature) => (
            <View key={feature.label} style={[styles.featureRow, { backgroundColor: colors.cardBackground }]}>
              <IconSymbol name={feature.icon} size={20} color={colors.tint} />
              <ThemedText style={styles.featureLabel}>{feature.label}</ThemedText>
            </View>
          ))}
        </View>

        {hasPurchasableProducts ? (
          <View style={styles.pricingContainer}>
            {availablePlans.map((plan) => (
              <Pressable
                key={plan.id}
                style={[
                  styles.pricingCard,
                  {
                    backgroundColor: colors.cardBackground,
                    borderColor: selectedPlan === plan.id ? colors.tint : colors.border,
                    borderWidth: selectedPlan === plan.id ? 2 : 1,
                    paddingTop: plan.badge ? 0 : 20,
                  },
                ]}
                onPress={() => setSelectedPlan(plan.id)}
                accessibilityRole="radio"
                accessibilityLabel={`${plan.name} ${plan.price}${plan.period}`}
                accessibilityState={{ checked: selectedPlan === plan.id }}
              >
                {plan.badge ? (
                  <View style={[styles.saveBadge, { backgroundColor: colors.tint }]}>
                    <ThemedText style={[styles.saveBadgeText, { color: colors.tintForeground }]}>{plan.badge}</ThemedText>
                  </View>
                ) : (
                  <View style={styles.badgePlaceholder} />
                )}
                <ThemedText style={styles.planName}>{plan.name}</ThemedText>
                <ThemedText style={[styles.planPrice, { color: colors.text }]}>{plan.price}</ThemedText>
                <ThemedText style={[styles.planPeriod, { color: colors.placeholder }]}>{plan.period}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : (
          <ThemedText style={[styles.productsUnavailableText, { color: colors.placeholder }]}>
            {isLoadingProducts
              ? 'Loading App Store prices...'
              : 'Purchases are temporarily unavailable. Please try again later or restore purchases.'}
          </ThemedText>
        )}

        {iapError && (
          <ThemedText style={[styles.productsUnavailableText, { color: colors.danger }]}>{iapError}</ThemedText>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.subscribeButton,
            {
              backgroundColor: colors.tint,
              opacity: pressed || isProcessing || !selectedPlanConfig ? 0.6 : 1,
            },
          ]}
          onPress={handleSubscribe}
          disabled={isProcessing || !selectedPlanConfig}
          accessibilityRole="button"
          accessibilityLabel={selectedPlanConfig ? `Subscribe with ${selectedPlanConfig.name}` : 'Purchases Unavailable'}
          accessibilityState={{ disabled: isProcessing || !selectedPlanConfig }}
        >
          {isProcessing ? (
            <ActivityIndicator color={colors.tintForeground} />
          ) : (
            <ThemedText style={[styles.subscribeButtonText, { color: colors.tintForeground }]}>
              {selectedPlanConfig ? `Continue with ${selectedPlanConfig.name}` : 'Purchases Unavailable'}
            </ThemedText>
          )}
        </Pressable>

        <ThemedText style={[styles.disclosureText, { color: colors.placeholder }]}>
          {selectedPlanConfig
            ? `${selectedPlanConfig.price}${selectedPlanConfig.period}`
            : 'Plans and prices load from the App Store'}
          {' '}· Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in your Apple ID account settings.
        </ThemedText>

        <View style={styles.legalLinks}>
          <Pressable onPress={() => router.push('/terms-of-service' as any)} hitSlop={8} accessibilityRole="link" accessibilityLabel="Terms of Service">
            <ThemedText style={[styles.legalLink, { color: colors.tint }]}>Terms of Service</ThemedText>
          </Pressable>
          <ThemedText style={[styles.legalSep, { color: colors.placeholder }]}> · </ThemedText>
          <Pressable onPress={() => router.push('/terms-of-service' as any)} hitSlop={8} accessibilityRole="link" accessibilityLabel="Privacy Policy">
            <ThemedText style={[styles.legalLink, { color: colors.tint }]}>Privacy Policy</ThemedText>
          </Pressable>
        </View>

        {isInitialMode && (
          <Pressable
            style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
            onPress={handleSkip}
            disabled={isDismissing}
            accessibilityRole="button"
            accessibilityLabel="Skip - Try 1 Week Free"
            accessibilityState={{ disabled: isDismissing }}
          >
            <ThemedText style={[styles.skipButtonText, { color: colors.tint }]}>
              {isDismissing ? 'Starting trial...' : 'Skip - Try 1 Week Free'}
            </ThemedText>
          </Pressable>
        )}

        {isExpiredMode && (
          <Pressable
            style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
            onPress={handleSkip}
            disabled={isDismissing}
            accessibilityRole="button"
            accessibilityLabel="Continue with Free Tier"
            accessibilityState={{ disabled: isDismissing }}
          >
            <ThemedText style={[styles.skipButtonText, { color: colors.placeholder }]}>
              {isDismissing ? 'Loading...' : 'Continue with Free Tier'}
            </ThemedText>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [styles.restoreButton, pressed && styles.buttonPressed]}
          onPress={handleRestore}
          disabled={isProcessing}
          accessibilityRole="button"
          accessibilityLabel="Restore Purchases"
          accessibilityState={{ disabled: isProcessing }}
        >
          <ThemedText style={[styles.restoreText, { color: colors.placeholder, opacity: isProcessing ? 0.5 : 1 }]}>
            Restore Purchases
          </ThemedText>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.signOutButton, pressed && styles.buttonPressed]}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign Out"
        >
          <ThemedText style={[styles.signOutText, { color: colors.danger }]}>Sign Out</ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 58,
    right: 18,
    zIndex: 10,
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  logoContainer: {
    marginTop: 24,
    marginBottom: 12,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  featuresContainer: {
    width: '100%',
    gap: 8,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 12,
  },
  featureLabel: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  pricingContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
    marginBottom: 16,
  },
  pricingCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    paddingBottom: 20,
    borderRadius: 14,
    overflow: 'hidden',
  },
  badgePlaceholder: {
    height: BADGE_HEIGHT,
    marginBottom: 4,
  },
  saveBadge: {
    alignSelf: 'stretch',
    paddingVertical: 6,
    alignItems: 'center',
    marginHorizontal: -12,
    marginBottom: 12,
    height: BADGE_HEIGHT,
    justifyContent: 'center',
  },
  saveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  planPeriod: {
    fontSize: 13,
    marginTop: 2,
  },
  productsUnavailableText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  subscribeButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 4,
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '500',
  },
  restoreButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  restoreText: {
    fontSize: 14,
  },
  signOutButton: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '500',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  disclosureText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: '500',
  },
  legalSep: {
    fontSize: 12,
  },
});
