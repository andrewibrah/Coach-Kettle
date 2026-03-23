import { useAuth } from '@/components/AuthProvider';
import { ThemedText } from '@/components/ui/themed-text';
import { SUBSCRIPTION } from '@/constants/subscription';
import { Colors } from '@/constants/theme';
import { useEntitlement } from '@/contexts/EntitlementContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIAP } from '@/lib/iap';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type Plan = 'monthly' | 'annual';

const FEATURES = [
  { icon: '💬', label: 'Unlimited AI Coach Messages' },
  { icon: '📊', label: 'Advanced Workout Analytics' },
  { icon: '📋', label: 'Unlimited Custom Templates' },
  { icon: '✨', label: 'Ad-Free Experience' },
];

export default function PaywallScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { needsPaywall, needsInitialPaywall, dismissPaywall, refreshEntitlement } = useEntitlement();
  const { signOut } = useAuth();
  const { products, purchase, restore, isProcessing, error: iapError } = useIAP({
    onPurchaseSuccess: refreshEntitlement,
  });
  const [selectedPlan, setSelectedPlan] = useState<Plan>('annual');
  const [isDismissing, setIsDismissing] = useState(false);

  const monthlyProduct = products.find(p => p.productId === SUBSCRIPTION.PRODUCT_ID_MONTHLY);
  const annualProduct = products.find(p => p.productId === SUBSCRIPTION.PRODUCT_ID_ANNUAL);
  const monthlyPrice = monthlyProduct?.localizedPrice ?? SUBSCRIPTION.PRICE_MONTHLY;
  const annualPrice = annualProduct?.localizedPrice ?? SUBSCRIPTION.PRICE_ANNUAL;
  const productsLoaded = products.length > 0;

  const isExpiredMode = needsPaywall;
  const isInitialMode = needsInitialPaywall;

  useEffect(() => {
    if (iapError) {
      // Friendlier error message for common SKU issues
      const msg = iapError.toLowerCase().includes('sku') || iapError.toLowerCase().includes('not found')
        ? 'Subscription is not available right now. Please try again later or contact support.'
        : iapError;
      Alert.alert('Subscription Unavailable', msg);
    }
  }, [iapError]);

  const handleSubscribe = async () => {
    if (!productsLoaded) {
      Alert.alert('Unavailable', 'Subscription products could not be loaded. Please check your connection and try again.');
      return;
    }
    const productId = selectedPlan === 'monthly'
      ? SUBSCRIPTION.PRODUCT_ID_MONTHLY
      : SUBSCRIPTION.PRODUCT_ID_ANNUAL;
    await purchase(productId);
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

  const handleClose = () => {
    handleSkip();
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
      {/* X close button — always visible so user is never trapped */}
      <Pressable
        style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}
        onPress={handleClose}
        hitSlop={12}
      >
        <Ionicons name="close" size={26} color={colors.placeholder} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/kettlebell-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* Title */}
        <ThemedText style={styles.title}>Coach Kettle Pro</ThemedText>

        {/* Subtitle */}
        <ThemedText style={[styles.subtitle, { color: colors.placeholder }]}>
          {isExpiredMode
            ? 'Your trial has ended — upgrade or continue free'
            : 'Unlock everything. Cancel anytime.'}
        </ThemedText>

        {/* Features */}
        <View style={styles.featuresContainer}>
          {FEATURES.map((feature) => (
            <View
              key={feature.label}
              style={[styles.featureRow, { backgroundColor: colors.cardBackground }]}
            >
              <ThemedText style={styles.featureIcon}>{feature.icon}</ThemedText>
              <ThemedText style={styles.featureLabel}>{feature.label}</ThemedText>
            </View>
          ))}
        </View>

        {/* Pricing Cards */}
        <View style={styles.pricingContainer}>
          {/* Monthly */}
          <Pressable
            style={[
              styles.pricingCard,
              {
                backgroundColor: colors.cardBackground,
                borderColor: selectedPlan === 'monthly' ? colors.tint : colors.border,
                borderWidth: selectedPlan === 'monthly' ? 2 : 1,
              },
            ]}
            onPress={() => setSelectedPlan('monthly')}
          >
            {/* Spacer to match annual badge height */}
            <View style={styles.badgePlaceholder} />
            <ThemedText style={styles.planName}>Monthly</ThemedText>
            <ThemedText style={[styles.planPrice, { color: colors.text }]}>{monthlyPrice}</ThemedText>
            <ThemedText style={[styles.planPeriod, { color: colors.placeholder }]}>
              /month
            </ThemedText>
          </Pressable>

          {/* Annual */}
          <Pressable
            style={[
              styles.pricingCard,
              {
                backgroundColor: colors.cardBackground,
                borderColor: selectedPlan === 'annual' ? colors.tint : colors.border,
                borderWidth: selectedPlan === 'annual' ? 2 : 1,
                paddingTop: 0,
              },
            ]}
            onPress={() => setSelectedPlan('annual')}
          >
            <View style={[styles.saveBadge, { backgroundColor: colors.tint }]}>
              <ThemedText style={styles.saveBadgeText}>Save 40%</ThemedText>
            </View>
            <ThemedText style={styles.planName}>Annual</ThemedText>
            <ThemedText style={[styles.planPrice, { color: colors.text }]}>{annualPrice}</ThemedText>
            <ThemedText style={[styles.planPeriod, { color: colors.placeholder }]}>
              /year
            </ThemedText>
          </Pressable>
        </View>

        {/* Products not available notice */}
        {!productsLoaded && (
          <ThemedText style={[styles.productsUnavailableText, { color: colors.placeholder }]}>
            Subscription pricing unavailable — check your connection
          </ThemedText>
        )}

        {/* Subscribe Button */}
        <Pressable
          style={({ pressed }) => [
            styles.subscribeButton,
            {
              backgroundColor: colors.tint,
              opacity: (pressed || isProcessing || !productsLoaded) ? 0.6 : 1,
            },
          ]}
          onPress={handleSubscribe}
          disabled={isProcessing || !productsLoaded}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.subscribeButtonText}>Subscribe Now</ThemedText>
          )}
        </Pressable>

        {/* Skip Button (initial mode only) */}
        {isInitialMode && (
          <Pressable
            style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
            onPress={handleSkip}
            disabled={isDismissing}
          >
            <ThemedText style={[styles.skipButtonText, { color: colors.tint }]}>
              {isDismissing ? 'Starting trial...' : 'Skip \u2014 Try 1 Week Free'}
            </ThemedText>
          </Pressable>
        )}

        {/* Continue Free (expired mode only) */}
        {isExpiredMode && (
          <Pressable
            style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
            onPress={handleSkip}
            disabled={isDismissing}
          >
            <ThemedText style={[styles.skipButtonText, { color: colors.placeholder }]}>
              {isDismissing ? 'Loading...' : 'Continue with Free Tier'}
            </ThemedText>
          </Pressable>
        )}

        {/* Restore Purchases */}
        <Pressable
          style={({ pressed }) => [styles.restoreButton, pressed && styles.buttonPressed]}
          onPress={handleRestore}
          disabled={isProcessing}
        >
          <ThemedText style={[styles.restoreText, { color: colors.placeholder, opacity: isProcessing ? 0.5 : 1 }]}>
            Restore Purchases
          </ThemedText>
        </Pressable>

        {/* Sign Out — available in both modes */}
        <Pressable
          style={({ pressed }) => [styles.signOutButton, pressed && styles.buttonPressed]}
          onPress={handleSignOut}
        >
          <ThemedText style={[styles.signOutText, { color: colors.danger }]}>
            Sign Out
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const BADGE_HEIGHT = 28;

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
  logo: {
    width: 72,
    height: 72,
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
  featureIcon: {
    fontSize: 20,
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
  // Spacer in Monthly card so both cards have same content layout
  badgePlaceholder: {
    height: BADGE_HEIGHT,
    marginBottom: 4,
  },
  saveBadge: {
    alignSelf: 'stretch',
    paddingVertical: 6,
    alignItems: 'center',
    marginHorizontal: -12,  // bleed to card edges
    marginBottom: 12,
    height: BADGE_HEIGHT,
    justifyContent: 'center',
  },
  saveBadgeText: {
    color: '#fff',
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
    color: '#fff',
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
});
