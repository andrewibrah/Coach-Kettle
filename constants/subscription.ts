/**
 * Subscription constants for Coach Kettle Pro
 *
 * Product IDs match App Store Connect configuration.
 * Pricing and limits defined here for single source of truth.
 */

export const SUBSCRIPTION = {
  // App Store Connect Product IDs
  PRODUCT_ID_MONTHLY: 'com.coachkettle.pro.monthly',
  PRODUCT_ID_YEARLY: 'com.coachkettle.pro.annual.v2',

  // Backwards-compatible alias for existing screens and records.
  PRODUCT_ID_ANNUAL: 'com.coachkettle.pro.annual.v2',

  // Pricing (display only — actual pricing set in App Store Connect)
  PRICE_MONTHLY: '$1.99',
  PRICE_YEARLY: '$19.99',

  // Backwards-compatible alias for existing screens.
  PRICE_ANNUAL: '$19.99',

  // Trial
  TRIAL_DAYS: 7,

  // Free tier limits
  FREE_AI_MESSAGES_PER_DAY: 5,
  FREE_TEMPLATE_LIMIT: 5,

  // Feature flags — the single tier-to-features map. Consumed by
  // lib/entitlements.ts (canUseFeature); trial resolves to the PRO row.
  // Server-side mirror: supabase/functions/_shared/entitlements.ts.
  FEATURES: {
    FREE: {
      aiMessages: 5, // per day
      templates: 5, // starter templates
      analytics: 'basic', // basic history + streaks
      mealPlanGeneration: false,
    },
    PRO: {
      aiMessages: -1, // unlimited
      templates: -1, // unlimited
      analytics: 'advanced', // trending, fatigue, 1RM projections
      mealPlanGeneration: true,
    },
  },
} as const;

export type SubscriptionTier = 'free' | 'pro';

/**
 * Feature descriptions for paywall display
 */
export const PRO_FEATURES = [
  {
    icon: '💬',
    title: 'Unlimited AI Coach',
    description: 'Ask Coach Kettle anything, anytime',
  },
  {
    icon: '📊',
    title: 'Advanced Analytics',
    description: 'Performance trends, fatigue monitoring, 1RM projections',
  },
  {
    icon: '📋',
    title: 'Unlimited Templates',
    description: 'Create and save unlimited custom workout templates',
  },
  {
    icon: '🍽️',
    title: 'AI Meal Plans',
    description: 'Weekly meal plans generated for your goals',
  },
] as const;
