/**
 * IAP service module for Coach Kettle Pro subscriptions.
 *
 * Wraps react-native-iap v14 and handles:
 *  - Connection lifecycle
 *  - Product fetching (monthly + annual)
 *  - Purchase flow with server-side receipt verification
 *  - Restore purchases
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
} from 'react-native-iap';
import type {
  ProductSubscription,
  Purchase,
  PurchaseError,
} from 'react-native-iap';

import { SUBSCRIPTION } from '@/constants/subscription';
import { fetchWithAuth } from '@/lib/auth';
import { supabaseUrl } from '@/lib/supabase';

const API_BASE = `${supabaseUrl}/functions/v1`;

const PRODUCT_IDS = [
  SUBSCRIPTION.PRODUCT_ID_MONTHLY,
  SUBSCRIPTION.PRODUCT_ID_ANNUAL,
];

// ---------------------------------------------------------------------------
// useIAP hook
// ---------------------------------------------------------------------------

interface UseIAPOptions {
  /** Called after a purchase is successfully verified server-side (e.g. refreshEntitlement). */
  onPurchaseSuccess?: () => Promise<void>;
}

interface UseIAPReturn {
  products: ProductSubscription[];
  purchase: (productId: string) => Promise<void>;
  restore: () => Promise<boolean>;
  isProcessing: boolean;
  error: string | null;
}

export function useIAP(options?: UseIAPOptions): UseIAPReturn {
  const { onPurchaseSuccess } = options ?? {};

  const [products, setProducts] = useState<ProductSubscription[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep callback ref stable so listeners always see the latest value.
  const onSuccessRef = useRef(onPurchaseSuccess);
  useEffect(() => {
    onSuccessRef.current = onPurchaseSuccess;
  }, [onPurchaseSuccess]);

  // ------ initialise connection & fetch products ------
  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      try {
        await initConnection();

        const result = await getSubscriptions({ skus: PRODUCT_IDS });

        if (!cancelled && result) {
          setProducts(result);
        }
      } catch (err) {
        console.warn('[IAP] setup failed:', err);
        if (!cancelled) {
          setError('Failed to load subscription products');
        }
      }
    };

    setup();

    return () => {
      cancelled = true;
      endConnection();
    };
  }, []);

  // ------ purchase listeners ------
  useEffect(() => {
    const updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
      // Use purchaseToken (JWS on iOS, token on Android) as the receipt data.
      const receiptData = purchase.purchaseToken ?? null;

      if (!receiptData) {
        setError('No receipt data available');
        setIsProcessing(false);
        return;
      }

      try {
        const res = await fetchWithAuth(`${API_BASE}/iap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'verify_receipt',
            receipt_data: receiptData,
            product_id: purchase.productId,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Server verification failed: ${body}`);
        }

        // Finish the transaction only after successful server verification.
        await finishTransaction({ purchase });

        // Notify caller (e.g. to refresh entitlement state).
        if (onSuccessRef.current) {
          await onSuccessRef.current();
        }

        setError(null);
      } catch (err: any) {
        console.error('[IAP] verification failed:', err);
        setError(err?.message ?? 'Purchase verification failed');

        // Still finish the transaction so it does not re-queue indefinitely.
        try {
          await finishTransaction({ purchase });
        } catch (finishErr) {
          console.warn('[IAP] finishTransaction (on failure) failed:', finishErr);
        }
      } finally {
        setIsProcessing(false);
      }
    });

    const errorSub = purchaseErrorListener((err: PurchaseError) => {
      console.warn('[IAP] purchase error:', err);
      setError(err.message ?? 'Purchase failed');
      setIsProcessing(false);
    });

    return () => {
      updateSub.remove();
      errorSub.remove();
    };
  }, []);

  // ------ purchase action ------
  const purchase = useCallback(async (productId: string) => {
    setError(null);
    setIsProcessing(true);

    try {
      if (Platform.OS === 'ios') {
        await requestSubscription({ sku: productId });
      } else {
        await requestSubscription({
          sku: productId,
          ...(Platform.OS === 'android' ? { subscriptionOffers: [{ sku: productId, offerToken: '' }] } : {}),
        } as any);
      }
      // purchaseUpdatedListener handles the rest.
    } catch (err: any) {
      console.error('[IAP] requestSubscription failed:', err);
      setError(err?.message ?? 'Unable to start purchase');
      setIsProcessing(false);
    }
  }, []);

  // ------ restore action ------
  const restore = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsProcessing(true);

    try {
      const purchases = await getAvailablePurchases();

      for (const p of purchases) {
        const receiptData = p.purchaseToken ?? null;
        if (!receiptData) continue;

        await fetchWithAuth(`${API_BASE}/iap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'restore',
            receipt_data: receiptData,
            product_id: p.productId,
          }),
        });
      }

      if (onSuccessRef.current) {
        await onSuccessRef.current();
      }

      setError(null);
      return true;
    } catch (err: any) {
      console.error('[IAP] restore failed:', err);
      setError(err?.message ?? 'Restore failed');
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { products, purchase, restore, isProcessing, error };
}
