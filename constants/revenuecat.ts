/**
 * RevenueCat configuration for Coach Kettle.
 *
 * Uses the iOS app-specific public key from RevenueCat.
 */
export const REVENUECAT = {
  API_KEY: 'appl_XZhTbhwYIONjMIaDeOokOHPMXgQ',
  ENTITLEMENT_ID: 'Coach Kettle Pro',
  ENTITLEMENT_ALIASES: ['Coach Kettle Pro', 'pro', 'coach_kettle_pro'],
  OFFERING_ID: 'default',
  PACKAGE_IDS: {
    YEARLY: 'yearly',
    MONTHLY: 'monthly',
  },
} as const;

export type RevenueCatPlan = 'yearly' | 'monthly';
