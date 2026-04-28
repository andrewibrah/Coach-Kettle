/**
 * RevenueCat purchase service for Coach Kettle Pro.
 *
 * Keeps the existing useIAP interface while moving purchase, restore, customer
 * info, Paywall, and Customer Center behavior to RevenueCat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { REVENUECAT, RevenueCatPlan } from '@/constants/revenuecat';
import { SUBSCRIPTION } from '@/constants/subscription';

export type RevenueCatProduct = {
  plan: RevenueCatPlan;
  productId: string;
  packageId: string;
  title: string;
  localizedPrice: string;
  pricePerMonth: string | null;
  package: PurchasesPackage;
};

type ConfigureOptions = {
  appUserID?: string | null;
  email?: string | null;
};

let configuredUserId: string | null = null;
let configurePromise: Promise<void> | null = null;

export function getActiveCoachKettleEntitlement(customerInfo: CustomerInfo | null | undefined) {
  if (!customerInfo) return null;

  for (const entitlementId of REVENUECAT.ENTITLEMENT_ALIASES) {
    const entitlement = customerInfo.entitlements.active[entitlementId];
    if (entitlement?.isActive) return entitlement;
  }

  return null;
}

export function isCoachKettlePro(customerInfo: CustomerInfo | null | undefined): boolean {
  return getActiveCoachKettleEntitlement(customerInfo) !== null;
}

export async function configureRevenueCat(options: ConfigureOptions = {}): Promise<void> {
  const appUserID = options.appUserID ?? null;
  const email = options.email ?? null;

  if (Platform.OS === 'web') {
    return;
  }

  const isConfigured = await Purchases.isConfigured().catch(() => false);
  if (isConfigured && configuredUserId === appUserID) {
    return;
  }

  if (configurePromise) {
    await configurePromise;
    if (configuredUserId === appUserID) return;
  }

  configurePromise = (async () => {
    await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);

    if (!isConfigured) {
      Purchases.configure({
        apiKey: REVENUECAT.API_KEY,
        appUserID: appUserID ?? undefined,
      });
    } else if (appUserID) {
      const currentUserId = await Purchases.getAppUserID().catch(() => null);
      if (currentUserId !== appUserID) {
        await Purchases.logIn(appUserID);
      }
    }

    configuredUserId = appUserID;

    if (email) {
      await Purchases.setEmail(email).catch((error) => {
        console.warn('[RevenueCat] Failed to set email attribute:', error);
      });
    }
  })();

  try {
    await configurePromise;
  } finally {
    configurePromise = null;
  }
}

export async function logOutRevenueCat(): Promise<void> {
  if (Platform.OS === 'web') return;

  const isConfigured = await Purchases.isConfigured().catch(() => false);
  if (!isConfigured) return;

  try {
    await Purchases.logOut();
    configuredUserId = null;
  } catch (error: any) {
    if (error?.code !== PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR) {
      console.warn('[RevenueCat] Failed to log out:', error);
    }
  }
}

export async function getRevenueCatCustomerInfo(options?: ConfigureOptions): Promise<CustomerInfo | null> {
  await configureRevenueCat(options);
  if (Platform.OS === 'web') return null;
  return Purchases.getCustomerInfo();
}

function normalizeRevenueCatError(error: any, fallback: string): string | null {
  if (error?.userCancelled || error?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return null;
  }

  return error?.message ?? error?.underlyingErrorMessage ?? fallback;
}

function packagePlan(aPackage: PurchasesPackage): RevenueCatPlan | null {
  if (
    aPackage.packageType === PACKAGE_TYPE.ANNUAL ||
    aPackage.identifier === REVENUECAT.PACKAGE_IDS.YEARLY ||
    aPackage.product.identifier === SUBSCRIPTION.PRODUCT_ID_YEARLY
  ) {
    return 'yearly';
  }

  if (
    aPackage.packageType === PACKAGE_TYPE.MONTHLY ||
    aPackage.identifier === REVENUECAT.PACKAGE_IDS.MONTHLY ||
    aPackage.product.identifier === SUBSCRIPTION.PRODUCT_ID_MONTHLY
  ) {
    return 'monthly';
  }

  return null;
}

function offeringPackages(offering: PurchasesOffering | null): RevenueCatProduct[] {
  if (!offering) return [];

  return offering.availablePackages.flatMap((aPackage) => {
    const plan = packagePlan(aPackage);
    if (!plan) return [];

    return [{
      plan,
      productId: aPackage.product.identifier,
      packageId: aPackage.identifier,
      title: aPackage.product.title,
      localizedPrice: aPackage.product.priceString,
      pricePerMonth: aPackage.product.pricePerMonthString,
      package: aPackage,
    }];
  });
}

function findPackage(products: RevenueCatProduct[], productIdOrPlan: string): PurchasesPackage | null {
  return products.find((product) =>
    product.productId === productIdOrPlan ||
    product.plan === productIdOrPlan ||
    product.packageId === productIdOrPlan
  )?.package ?? null;
}

interface UseIAPOptions {
  onPurchaseSuccess?: () => Promise<void>;
  appUserID?: string | null;
  email?: string | null;
}

interface UseIAPReturn {
  products: RevenueCatProduct[];
  offering: PurchasesOffering | null;
  customerInfo: CustomerInfo | null;
  isPro: boolean;
  purchase: (productIdOrPlan: string) => Promise<boolean>;
  restore: () => Promise<boolean>;
  presentPaywall: () => Promise<boolean>;
  presentCustomerCenter: () => Promise<void>;
  refreshCustomerInfo: () => Promise<CustomerInfo | null>;
  isLoadingProducts: boolean;
  isProcessing: boolean;
  error: string | null;
}

export function useIAP(options?: UseIAPOptions): UseIAPReturn {
  const { onPurchaseSuccess, appUserID, email } = options ?? {};

  const [products, setProducts] = useState<RevenueCatProduct[]>([]);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccessRef = useRef(onPurchaseSuccess);
  useEffect(() => {
    onSuccessRef.current = onPurchaseSuccess;
  }, [onPurchaseSuccess]);

  const configureOptions = useMemo(() => ({ appUserID, email }), [appUserID, email]);

  const refreshCustomerInfo = useCallback(async () => {
    try {
      const info = await getRevenueCatCustomerInfo(configureOptions);
      setCustomerInfo(info);
      setError(null);
      return info;
    } catch (err: any) {
      const message = normalizeRevenueCatError(err, 'Failed to load customer info');
      if (message) setError(message);
      return null;
    }
  }, [configureOptions]);

  const loadOfferings = useCallback(async (): Promise<RevenueCatProduct[]> => {
    if (Platform.OS === 'web') return [];

    setIsLoadingProducts(true);
    try {
      await configureRevenueCat(configureOptions);
      const offerings = await Purchases.getOfferings();
      const currentOffering = offerings.current ?? offerings.all[REVENUECAT.OFFERING_ID] ?? null;
      const nextProducts = offeringPackages(currentOffering);
      setOffering(currentOffering);
      setProducts(nextProducts);
      setError(null);
      return nextProducts;
    } catch (err: any) {
      const message = normalizeRevenueCatError(err, 'Failed to load RevenueCat offerings');
      if (message) {
        console.warn('[RevenueCat] offerings failed:', err);
        setError(message);
      }
      return [];
    } finally {
      setIsLoadingProducts(false);
    }
  }, [configureOptions]);

  useEffect(() => {
    let cancelled = false;

    const setup = async () => {
      if (Platform.OS === 'web') return;

      await loadOfferings();
      if (!cancelled) {
        await refreshCustomerInfo();
      }
    };

    setup();

    const listener = (info: CustomerInfo) => {
      if (!cancelled) {
        setCustomerInfo(info);
        onSuccessRef.current?.();
      }
    };

    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [loadOfferings, refreshCustomerInfo]);

  const purchase = useCallback(async (productIdOrPlan: string): Promise<boolean> => {
    setError(null);
    setIsProcessing(true);

    try {
      await configureRevenueCat(configureOptions);

      let purchasablePackage = findPackage(products, productIdOrPlan);
      if (!purchasablePackage) {
        const nextProducts = await loadOfferings();
        purchasablePackage = findPackage(nextProducts, productIdOrPlan);
      }

      if (!purchasablePackage) {
        throw new Error('This plan is not available yet. Check the RevenueCat offering configuration.');
      }

      const result = await Purchases.purchasePackage(purchasablePackage);
      setCustomerInfo(result.customerInfo);

      if (onSuccessRef.current) {
        await onSuccessRef.current();
      }

      setError(null);
      return isCoachKettlePro(result.customerInfo);
    } catch (err: any) {
      const message = normalizeRevenueCatError(err, 'Unable to complete purchase');
      if (message) {
        console.error('[RevenueCat] purchase failed:', err);
        setError(message);
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [configureOptions, loadOfferings, products]);

  const restore = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsProcessing(true);

    try {
      await configureRevenueCat(configureOptions);
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);

      if (onSuccessRef.current) {
        await onSuccessRef.current();
      }

      setError(null);
      return isCoachKettlePro(info);
    } catch (err: any) {
      const message = normalizeRevenueCatError(err, 'Restore failed');
      if (message) {
        console.error('[RevenueCat] restore failed:', err);
        setError(message);
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [configureOptions]);

  const presentPaywall = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsProcessing(true);

    try {
      await configureRevenueCat(configureOptions);
      const offerings = await Purchases.getOfferings();
      const paywallOffering = offering ?? offerings.all[REVENUECAT.OFFERING_ID] ?? offerings.current ?? undefined;
      if (paywallOffering) {
        setOffering(paywallOffering);
      }

      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: REVENUECAT.ENTITLEMENT_ID,
        offering: paywallOffering,
        displayCloseButton: true,
      });

      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);

      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED || isCoachKettlePro(info)) {
        if (onSuccessRef.current) {
          await onSuccessRef.current();
        }
        return true;
      }

      return false;
    } catch (err: any) {
      const message = normalizeRevenueCatError(err, 'Unable to present RevenueCat paywall');
      if (message) {
        console.error('[RevenueCat] paywall failed:', err);
        setError(message);
      }
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [configureOptions, offering]);

  const presentCustomerCenter = useCallback(async () => {
    setError(null);

    try {
      await configureRevenueCat(configureOptions);
      await RevenueCatUI.presentCustomerCenter({
        callbacks: {
          onRestoreCompleted: async ({ customerInfo: info }) => {
            setCustomerInfo(info);
            if (onSuccessRef.current) {
              await onSuccessRef.current();
            }
          },
          onRestoreFailed: ({ error: restoreError }) => {
            console.warn('[RevenueCat] Customer Center restore failed:', restoreError);
          },
        },
      });
    } catch (err: any) {
      const message = normalizeRevenueCatError(err, 'Unable to open Customer Center');
      if (message) {
        console.error('[RevenueCat] customer center failed:', err);
        setError(message);
      }
    }
  }, [configureOptions]);

  return {
    products,
    offering,
    customerInfo,
    isPro: isCoachKettlePro(customerInfo),
    purchase,
    restore,
    presentPaywall,
    presentCustomerCenter,
    refreshCustomerInfo,
    isLoadingProducts,
    isProcessing,
    error,
  };
}
