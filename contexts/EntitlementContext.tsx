import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@/contexts/AuthProvider';
import { fetchWithAuth } from '@/lib/auth';
import {
  configureRevenueCat,
  getActiveCoachKettleEntitlement,
  getRevenueCatCustomerInfo,
} from '@/lib/iap';
import { supabaseUrl } from '@/lib/supabase';
import {
  canUseFeature,
  deriveEntitlementFlags,
  EntitlementStatus,
  FeatureKey,
  Tier,
} from '@/lib/entitlements';
import { SUBSCRIPTION } from '@/constants/subscription';
import Purchases, { CustomerInfo } from 'react-native-purchases';

const API_BASE = `${supabaseUrl}/functions/v1`;

export type { EntitlementStatus, FeatureKey, Tier };

export interface EntitlementState {
  status: EntitlementStatus;
  source: 'trial' | 'subscription' | 'manual' | null;
  expiresAt: string | null;
  trialDaysRemaining: number;
  subscriptionId: string | null;
  appleProductId: string | null;
  paywallDismissed: boolean;
}

interface EntitlementContextType {
  entitlement: EntitlementState;
  isLoading: boolean;
  /** User has active access (trial_active with paywall dismissed, or sub_active) */
  hasAccess: boolean;
  /** Trial or sub expired — must show expired paywall (no skip) */
  needsPaywall: boolean;
  /** Active entitlement but hasn't dismissed initial paywall yet */
  needsInitialPaywall: boolean;
  /** Whether user is a paying subscriber (not trial) */
  isPro: boolean;
  /** Enforcement tier: sub_active → pro, trial_active → trial, else free */
  tier: Tier;
  /** Whether the current tier can use a feature (trial = full pro) */
  can: (feature: FeatureKey) => boolean;
  /** Dismiss the initial paywall (user tapped "Skip — Try Free") */
  dismissPaywall: () => Promise<void>;
  /** Force refresh entitlement state */
  refreshEntitlement: () => Promise<void>;
  /** Sync RevenueCat purchase state to the backend, then refresh.
   *  Call after a successful purchase/restore so server-side gates see pro immediately. */
  syncPurchase: () => Promise<void>;
}

const defaultEntitlement: EntitlementState = {
  status: 'unknown',
  source: null,
  expiresAt: null,
  trialDaysRemaining: 0,
  subscriptionId: null,
  appleProductId: null,
  paywallDismissed: false,
};

const EntitlementContext = createContext<EntitlementContextType>({
  entitlement: defaultEntitlement,
  isLoading: true,
  hasAccess: false,
  needsPaywall: false,
  needsInitialPaywall: false,
  isPro: false,
  tier: 'free',
  can: () => false,
  dismissPaywall: async () => {},
  refreshEntitlement: async () => {},
  syncPurchase: async () => {},
});

export const useEntitlement = () => useContext(EntitlementContext);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [entitlement, setEntitlement] = useState<EntitlementState>(defaultEntitlement);
  const [revenueCatCustomerInfo, setRevenueCatCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastFetchRef = useRef<number>(0);

  const bootstrap = useCallback(async () => {
    await fetchWithAuth(`${API_BASE}/entitlements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'bootstrap' }),
    });
  }, []);

  const loadEntitlement = useCallback(async () => {
    if (!session?.user?.id) {
      setEntitlement(defaultEntitlement);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_BASE}/entitlements`, { method: 'GET' });
      const json = await res.json();

      if (json.ok && json.data) {
        if (json.data.status === null) {
          // No entitlement exists yet — bootstrap
          await bootstrap();
          // Re-fetch after bootstrap
          const res2 = await fetchWithAuth(`${API_BASE}/entitlements`, { method: 'GET' });
          const json2 = await res2.json();

          if (json2.ok && json2.data) {
            setEntitlement({
              status: json2.data.status ?? 'unknown',
              source: json2.data.source ?? null,
              expiresAt: json2.data.expires_at ?? null,
              trialDaysRemaining: json2.data.trial_days_remaining ?? 0,
              subscriptionId: json2.data.subscription_id ?? null,
              appleProductId: json2.data.apple_product_id ?? null,
              paywallDismissed: (json2.data.paywall_dismissed ?? false) || json2.data.status === 'sub_active',
            });
          }
        } else {
          setEntitlement({
            status: json.data.status,
            source: json.data.source ?? null,
            expiresAt: json.data.expires_at ?? null,
            trialDaysRemaining: json.data.trial_days_remaining ?? 0,
            subscriptionId: json.data.subscription_id ?? null,
            appleProductId: json.data.apple_product_id ?? null,
            paywallDismissed: (json.data.paywall_dismissed ?? false) || json.data.status === 'sub_active',
          });
        }
      }
    } catch (error) {
      console.error('[EntitlementContext] Error loading entitlement:', error);
      setEntitlement((prev) => (prev.status === 'unknown' ? prev : { ...prev, status: 'unknown' }));
    } finally {
      setIsLoading(false);
      lastFetchRef.current = Date.now();
    }
  }, [session?.user?.id, bootstrap]);

  const loadRevenueCatCustomerInfo = useCallback(async () => {
    if (!session?.user?.id) {
      setRevenueCatCustomerInfo(null);
      return null;
    }

    try {
      const customerInfo = await getRevenueCatCustomerInfo({
        appUserID: session.user.id,
        email: session.user.email,
      });
      setRevenueCatCustomerInfo(customerInfo);
      return customerInfo;
    } catch (error) {
      console.warn('[EntitlementContext] Error loading RevenueCat customer info:', error);
      return null;
    }
  }, [session?.user?.id, session?.user?.email]);

  useEffect(() => {
    if (!session?.user?.id) {
      setRevenueCatCustomerInfo(null);
      return;
    }

    let cancelled = false;

    const setupRevenueCat = async () => {
      try {
        await configureRevenueCat({
          appUserID: session.user.id,
          email: session.user.email,
        });

        if (!cancelled) {
          await loadRevenueCatCustomerInfo();
        }
      } catch (error) {
        console.warn('[EntitlementContext] RevenueCat setup failed:', error);
      }
    };

    setupRevenueCat();

    const listener = (customerInfo: CustomerInfo) => {
      if (!cancelled) {
        setRevenueCatCustomerInfo(customerInfo);
      }
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [session?.user?.id, session?.user?.email, loadRevenueCatCustomerInfo]);

  // Load entitlement when session changes
  useEffect(() => {
    if (!authLoading) {
      if (!session?.user?.id) {
        setEntitlement(defaultEntitlement);
        setIsLoading(false);
      } else {
        loadEntitlement();
      }
    }
  }, [session?.user?.id, authLoading, loadEntitlement]);

  // Refresh on app foreground (debounced to 30s minimum)
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && session?.user?.id) {
        const now = Date.now();
        if (now - lastFetchRef.current >= 30_000) {
          loadEntitlement();
          loadRevenueCatCustomerInfo();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [session?.user?.id, loadEntitlement, loadRevenueCatCustomerInfo]);

  const dismissPaywall = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      await fetchWithAuth(`${API_BASE}/entitlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_paywall' }),
      });
      await loadEntitlement();
    } catch (error) {
      console.error('[EntitlementContext] Error dismissing paywall:', error);
    }
  }, [session?.user?.id, loadEntitlement]);

  const refreshEntitlement = useCallback(async () => {
    await Promise.all([loadEntitlement(), loadRevenueCatCustomerInfo()]);
  }, [loadEntitlement, loadRevenueCatCustomerInfo]);

  const syncPurchase = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      await fetchWithAuth(`${API_BASE}/entitlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_revenuecat' }),
      });
    } catch (error) {
      // Non-fatal: the RevenueCat webhook will provision the entitlement.
      console.warn('[EntitlementContext] Purchase sync failed (webhook will catch up):', error);
    }
    await refreshEntitlement();
  }, [session?.user?.id, refreshEntitlement]);

  const activeRevenueCatEntitlement = getActiveCoachKettleEntitlement(revenueCatCustomerInfo);
  const revenueCatIsPro = activeRevenueCatEntitlement?.isActive ?? false;

  // Reconcile drift: RevenueCat says pro but the backend doesn't. Server-side
  // gates (chat/coach limits) read the backend, so push RC state to it once.
  const reconciledRef = useRef(false);
  useEffect(() => {
    reconciledRef.current = false;
  }, [session?.user?.id]);
  useEffect(() => {
    if (
      revenueCatIsPro &&
      !isLoading &&
      entitlement.status !== 'sub_active' &&
      !reconciledRef.current
    ) {
      // Includes status === 'unknown': if the backend entitlement failed to load
      // but RevenueCat says the user is pro, still push pro to the server so the
      // paying user isn't gated (429/403) by stale server-side state.
      reconciledRef.current = true;
      syncPurchase();
    }
  }, [revenueCatIsPro, isLoading, entitlement.status, syncPurchase]);
  const effectiveEntitlement: EntitlementState = revenueCatIsPro
    ? {
        ...entitlement,
        status: 'sub_active',
        source: 'subscription',
        expiresAt: activeRevenueCatEntitlement?.expirationDate ?? null,
        appleProductId: activeRevenueCatEntitlement?.productIdentifier ?? null,
        paywallDismissed: true,
      }
    : entitlement;

  // Derived flags — single derivation point (unit-tested in lib/__tests__)
  const { tier, isPro, hasAccess, needsPaywall, needsInitialPaywall } = deriveEntitlementFlags(
    effectiveEntitlement.status,
    effectiveEntitlement.paywallDismissed
  );

  const can = useCallback(
    (feature: FeatureKey) => canUseFeature(SUBSCRIPTION.FEATURES, tier, feature),
    [tier]
  );

  return (
    <EntitlementContext.Provider
      value={{
        entitlement: effectiveEntitlement,
        isLoading,
        hasAccess,
        needsPaywall,
        needsInitialPaywall,
        isPro,
        tier,
        can,
        dismissPaywall,
        refreshEntitlement,
        syncPurchase,
      }}
    >
      {children}
    </EntitlementContext.Provider>
  );
}
