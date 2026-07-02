import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveEntitlementFlags,
  canUseFeature,
  parseFeatureGateError,
  FeatureGateError,
} from '../entitlements.ts';
import type { EntitlementStatus, EntitlementFlags, Tier } from '../entitlements.ts';
import { SUBSCRIPTION } from '../../constants/subscription.ts';

// ---------- deriveEntitlementFlags: every status × paywallDismissed ----------

const CASES: [EntitlementStatus, boolean, EntitlementFlags][] = [
  // trial_active
  ['trial_active', false, {
    tier: 'trial', isPro: false, isFree: false,
    hasAccess: false, needsPaywall: false, needsInitialPaywall: true,
  }],
  ['trial_active', true, {
    tier: 'trial', isPro: false, isFree: false,
    hasAccess: true, needsPaywall: false, needsInitialPaywall: false,
  }],
  // trial_expired
  ['trial_expired', false, {
    tier: 'free', isPro: false, isFree: false,
    hasAccess: false, needsPaywall: true, needsInitialPaywall: false,
  }],
  ['trial_expired', true, {
    tier: 'free', isPro: false, isFree: true,
    hasAccess: true, needsPaywall: false, needsInitialPaywall: false,
  }],
  // sub_active — note: loadEntitlement forces paywallDismissed true for
  // sub_active, but the derivation must hold for both inputs anyway.
  ['sub_active', false, {
    tier: 'pro', isPro: true, isFree: false,
    hasAccess: true, needsPaywall: false, needsInitialPaywall: true,
  }],
  ['sub_active', true, {
    tier: 'pro', isPro: true, isFree: false,
    hasAccess: true, needsPaywall: false, needsInitialPaywall: false,
  }],
  // sub_expired
  ['sub_expired', false, {
    tier: 'free', isPro: false, isFree: false,
    hasAccess: false, needsPaywall: true, needsInitialPaywall: false,
  }],
  ['sub_expired', true, {
    tier: 'free', isPro: false, isFree: true,
    hasAccess: true, needsPaywall: false, needsInitialPaywall: false,
  }],
  // unknown — never grants access, never blocks with a paywall
  ['unknown', false, {
    tier: 'free', isPro: false, isFree: false,
    hasAccess: false, needsPaywall: false, needsInitialPaywall: false,
  }],
  ['unknown', true, {
    tier: 'free', isPro: false, isFree: false,
    hasAccess: false, needsPaywall: false, needsInitialPaywall: false,
  }],
];

for (const [status, dismissed, expected] of CASES) {
  test(`deriveEntitlementFlags(${status}, dismissed=${dismissed})`, () => {
    assert.deepEqual(deriveEntitlementFlags(status, dismissed), expected);
  });
}

// ---------- canUseFeature against the real SUBSCRIPTION.FEATURES map ----------

const FEATURES = SUBSCRIPTION.FEATURES;

test('free tier gets no pro features', () => {
  assert.equal(canUseFeature(FEATURES, 'free', 'unlimitedAiMessages'), false);
  assert.equal(canUseFeature(FEATURES, 'free', 'unlimitedTemplates'), false);
  assert.equal(canUseFeature(FEATURES, 'free', 'advancedAnalytics'), false);
  assert.equal(canUseFeature(FEATURES, 'free', 'mealPlanGeneration'), false);
});

for (const tier of ['trial', 'pro'] as Tier[]) {
  test(`${tier} tier gets full pro features (trial = full pro)`, () => {
    assert.equal(canUseFeature(FEATURES, tier, 'unlimitedAiMessages'), true);
    assert.equal(canUseFeature(FEATURES, tier, 'unlimitedTemplates'), true);
    assert.equal(canUseFeature(FEATURES, tier, 'advancedAnalytics'), true);
    assert.equal(canUseFeature(FEATURES, tier, 'mealPlanGeneration'), true);
  });
}

// ---------- parseFeatureGateError ----------

test('parses 429 AI_LIMIT_REACHED', () => {
  const err = parseFeatureGateError(
    429,
    JSON.stringify({ error: 'Daily AI message limit reached', code: 'AI_LIMIT_REACHED', limit: 5, count: 5 })
  );
  assert.ok(err instanceof FeatureGateError);
  assert.equal(err.code, 'AI_LIMIT_REACHED');
  assert.equal(err.status, 429);
});

test('parses 403 PRO_REQUIRED and TEMPLATE_LIMIT_REACHED', () => {
  assert.equal(
    parseFeatureGateError(403, JSON.stringify({ error: 'x', code: 'PRO_REQUIRED' }))?.code,
    'PRO_REQUIRED'
  );
  assert.equal(
    parseFeatureGateError(403, JSON.stringify({ error: 'x', code: 'TEMPLATE_LIMIT_REACHED' }))?.code,
    'TEMPLATE_LIMIT_REACHED'
  );
});

test('ignores non-gate statuses and malformed bodies', () => {
  assert.equal(parseFeatureGateError(500, JSON.stringify({ code: 'AI_LIMIT_REACHED' })), null);
  assert.equal(parseFeatureGateError(503, JSON.stringify({ code: 'ENTITLEMENT_UNAVAILABLE' })), null);
  assert.equal(parseFeatureGateError(429, 'not json'), null);
  assert.equal(parseFeatureGateError(429, JSON.stringify({ error: 'no code field' })), null);
});
