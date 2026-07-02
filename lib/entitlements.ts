// Pure entitlement tier derivation + feature gating.
//
// This module intentionally has ZERO runtime imports so it can be unit-tested
// directly with `node --test` (same pattern as lib/nutritionTargets.ts).
// The feature map is passed in by the caller — EntitlementContext wires in
// SUBSCRIPTION.FEATURES from constants/subscription.ts.
//
// This is the ONLY place client code derives tier/access flags from raw
// entitlement status strings. Screens must consume useEntitlement()'s
// flags and can() — never re-derive from status.

export type EntitlementStatus =
  | 'trial_active'
  | 'trial_expired'
  | 'sub_active'
  | 'sub_expired'
  | 'unknown';

export type Tier = 'pro' | 'trial' | 'free';

export type FeatureKey =
  | 'unlimitedAiMessages'
  | 'unlimitedTemplates'
  | 'advancedAnalytics'
  | 'mealPlanGeneration';

export interface TierFeatures {
  readonly aiMessages: number;
  readonly templates: number;
  readonly analytics: 'basic' | 'advanced';
  readonly mealPlanGeneration: boolean;
}

export interface FeatureMap {
  readonly FREE: TierFeatures;
  readonly PRO: TierFeatures;
}

export interface EntitlementFlags {
  /** Enforcement tier: sub_active → pro, trial_active → trial, else free */
  tier: Tier;
  /** Paying subscriber (not trial) */
  isPro: boolean;
  /** Trial/sub expired but user explicitly chose to continue free */
  isFree: boolean;
  /** User has active access (trial/sub active past initial paywall, or free tier) */
  hasAccess: boolean;
  /** Expired and hasn't dismissed — must show expired paywall (no skip) */
  needsPaywall: boolean;
  /** Active entitlement but hasn't dismissed initial paywall yet */
  needsInitialPaywall: boolean;
}

export function deriveEntitlementFlags(
  status: EntitlementStatus,
  paywallDismissed: boolean
): EntitlementFlags {
  const expired = status === 'trial_expired' || status === 'sub_expired';

  const isPro = status === 'sub_active';
  const isFree = expired && paywallDismissed;

  return {
    tier: isPro ? 'pro' : status === 'trial_active' ? 'trial' : 'free',
    isPro,
    isFree,
    hasAccess: (status === 'trial_active' && paywallDismissed) || isPro || isFree,
    needsPaywall: expired && !paywallDismissed,
    needsInitialPaywall:
      (status === 'trial_active' || status === 'sub_active') && !paywallDismissed,
  };
}

/** Trial = full pro access: trial resolves to the PRO feature row. */
export function canUseFeature(features: FeatureMap, tier: Tier, feature: FeatureKey): boolean {
  const row = tier === 'free' ? features.FREE : features.PRO;

  switch (feature) {
    case 'unlimitedAiMessages':
      return row.aiMessages === -1;
    case 'unlimitedTemplates':
      return row.templates === -1;
    case 'advancedAnalytics':
      return row.analytics === 'advanced';
    case 'mealPlanGeneration':
      return row.mealPlanGeneration;
  }
}

/**
 * Typed error for server feature-gate rejections (429 AI_LIMIT_REACHED,
 * 403 PRO_REQUIRED / TEMPLATE_LIMIT_REACHED). API wrappers throw this so
 * screens can show an upgrade CTA instead of a generic failure toast.
 */
export class FeatureGateError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'FeatureGateError';
    this.code = code;
    this.status = status;
  }
}

/** Parse an error response body into a FeatureGateError, or null if it isn't one. */
export function parseFeatureGateError(status: number, body: string): FeatureGateError | null {
  if (status !== 429 && status !== 403) return null;
  try {
    const json = JSON.parse(body);
    if (typeof json?.code === 'string') {
      return new FeatureGateError(json.code, status, String(json.error ?? 'Upgrade required'));
    }
  } catch {
    // Not JSON — fall through to generic handling.
  }
  return null;
}
