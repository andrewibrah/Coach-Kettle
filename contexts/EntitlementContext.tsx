import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@/components/AuthProvider';
import { fetchWithAuth } from '@/lib/auth';
import { supabaseUrl } from '@/lib/supabase';

const API_BASE = `${supabaseUrl}/functions/v1`;

export type EntitlementStatus = 'trial_active' | 'trial_expired' | 'sub_active' | 'sub_expired' | 'unknown';

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
  /** Dismiss the initial paywall (user tapped "Skip — Try Free") */
  dismissPaywall: () => Promise<void>;
  /** Force refresh entitlement state */
  refreshEntitlement: () => Promise<void>;
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
  dismissPaywall: async () => {},
  refreshEntitlement: async () => {},
});

export const useEntitlement = () => useContext(EntitlementContext);

export function EntitlementProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: authLoading } = useAuth();
  const [entitlement, setEntitlement] = useState<EntitlementState>(defaultEntitlement);
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
          const res2 = await fetchWithAuth(`${API_BASE}/entitlements`);
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
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [session?.user?.id, loadEntitlement]);

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
    await loadEntitlement();
  }, [loadEntitlement]);

  // Derived flags
  // Free tier: trial/sub expired but user explicitly chose to continue free
  const isFree =
    (entitlement.status === 'trial_expired' || entitlement.status === 'sub_expired') &&
    entitlement.paywallDismissed;

  const hasAccess =
    (entitlement.status === 'trial_active' && entitlement.paywallDismissed) ||
    entitlement.status === 'sub_active' ||
    isFree;

  // Only block with paywall if expired AND user hasn't dismissed (i.e., chosen free tier)
  const needsPaywall =
    (entitlement.status === 'trial_expired' || entitlement.status === 'sub_expired') &&
    !entitlement.paywallDismissed;

  const needsInitialPaywall =
    (entitlement.status === 'trial_active' || entitlement.status === 'sub_active') &&
    !entitlement.paywallDismissed;

  const isPro = entitlement.status === 'sub_active';

  return (
    <EntitlementContext.Provider
      value={{
        entitlement,
        isLoading,
        hasAccess,
        needsPaywall,
        needsInitialPaywall,
        isPro,
        dismissPaywall,
        refreshEntitlement,
      }}
    >
      {children}
    </EntitlementContext.Provider>
  );
}
