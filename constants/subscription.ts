/**
 * Subscription constants for Coach Kettle Pro
 *
 * Product IDs match App Store Connect configuration.
 * Pricing and limits defined here for single source of truth.
 */

export const SUBSCRIPTION = {
  // App Store Connect Product IDs
  PRODUCT_ID_MONTHLY: 'com.coachkettle.pro.monthly',
  PRODUCT_ID_ANNUAL: 'com.coachkettle.pro.annual.v2',

  // Pricing (display only — actual pricing set in App Store Connect)
  PRICE_MONTHLY: '$1.99',
  PRICE_ANNUAL: '$24.99',
  PRICE_ANNUAL_MONTHLY_EQUIVALENT: '$2.08',
  ANNUAL_SAVINGS_PERCENT: 40,

  // Trial
  TRIAL_DAYS: 7,

  // Free tier limits
  FREE_AI_MESSAGES_PER_DAY: 5,
  FREE_TEMPLATE_LIMIT: 5,

  // Feature flags
  FEATURES: {
    FREE: {
      aiMessages: 5, // per day
      templates: 5, // starter templates
      analytics: 'basic', // basic history + streaks
      ads: true,
    },
    PRO: {
      aiMessages: -1, // unlimited
      templates: -1, // unlimited
      analytics: 'advanced', // trending, fatigue, 1RM projections
      ads: false,
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
    icon: '🚫',
    title: 'Ad-Free Experience',
    description: 'Focus on your workout without distractions',
  },
] as const;
