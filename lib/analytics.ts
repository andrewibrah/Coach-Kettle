import { fetchWithAuth } from './auth';
import { supabaseUrl } from './supabase';

type AppPlatform = 'ios' | 'android' | 'web';
type WorkoutSource = 'quick_start' | 'program' | 'resume';
type WorkoutDurationBucket =
  | 'under_15_min'
  | '15_to_29_min'
  | '30_to_59_min'
  | '60_to_89_min'
  | '90_min_or_more';
type WorkoutSetCountBucket =
  | '0_sets'
  | '1_to_5_sets'
  | '6_to_10_sets'
  | '11_to_20_sets'
  | '21_sets_or_more';
type WorkoutParseKind = 'fast' | 'ai' | 'manual';
type RecommendationType =
  | 'no_history'
  | 'hold'
  | 'increase_weight'
  | 'micro_load'
  | 'deload_set';
type PaywallSource = 'onboarding' | 'feature_gate' | 'settings' | 'expired_access';
type CheckoutProduct = 'monthly' | 'yearly';
type NutritionCaptureMode = 'text' | 'photo';

export type ProductEvent =
  | { name: 'app_opened'; properties: { platform: AppPlatform } }
  | { name: 'onboarding_completed'; properties: Record<string, never> }
  | { name: 'workout_started'; properties: { source: WorkoutSource } }
  | {
      name: 'workout_completed';
      properties: {
        duration_bucket: WorkoutDurationBucket;
        set_count_bucket: WorkoutSetCountBucket;
      };
    }
  | { name: 'workout_parse_corrected'; properties: { parse_kind: WorkoutParseKind } }
  | {
      name: 'recommendation_accepted';
      properties: { recommendation_type: RecommendationType };
    }
  | { name: 'paywall_presented'; properties: { source: PaywallSource } }
  | { name: 'checkout_started'; properties: { product_id: CheckoutProduct } }
  | { name: 'nutrition_capture_opened'; properties: { mode: NutritionCaptureMode } }
  | {
      name: 'nutrition_analysis_completed';
      properties: { mode: NutritionCaptureMode; cache_hit: boolean };
    }
  | {
      name: 'nutrition_log_confirmed';
      properties: { mode: NutritionCaptureMode; item_count: number };
    };

const OBSERVABILITY_URL = `${supabaseUrl}/functions/v1/observability`;
const MIN_NUTRITION_ITEM_COUNT = 1;
const MAX_NUTRITION_ITEM_COUNT = 20;

const APP_PLATFORMS = ['ios', 'android', 'web'] as const;
const WORKOUT_SOURCES = ['quick_start', 'program', 'resume'] as const;
const WORKOUT_DURATION_BUCKETS = [
  'under_15_min',
  '15_to_29_min',
  '30_to_59_min',
  '60_to_89_min',
  '90_min_or_more',
] as const;
const WORKOUT_SET_COUNT_BUCKETS = [
  '0_sets',
  '1_to_5_sets',
  '6_to_10_sets',
  '11_to_20_sets',
  '21_sets_or_more',
] as const;
const WORKOUT_PARSE_KINDS = ['fast', 'ai', 'manual'] as const;
const RECOMMENDATION_TYPES = [
  'no_history',
  'hold',
  'increase_weight',
  'micro_load',
  'deload_set',
] as const;
const PAYWALL_SOURCES = ['onboarding', 'feature_gate', 'settings', 'expired_access'] as const;
const CHECKOUT_PRODUCTS = ['monthly', 'yearly'] as const;
const NUTRITION_CAPTURE_MODES = ['text', 'photo'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isEnumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function sanitizeProductEventUnsafe(event: unknown): ProductEvent | null {
  if (!isRecord(event) || typeof event.name !== 'string' || !isRecord(event.properties)) {
    return null;
  }

  const properties = event.properties;

  switch (event.name) {
    case 'app_opened':
      return isEnumValue(properties.platform, APP_PLATFORMS)
        ? { name: event.name, properties: { platform: properties.platform } }
        : null;
    case 'onboarding_completed':
      return { name: event.name, properties: {} };
    case 'workout_started':
      return isEnumValue(properties.source, WORKOUT_SOURCES)
        ? { name: event.name, properties: { source: properties.source } }
        : null;
    case 'workout_completed':
      return isEnumValue(properties.duration_bucket, WORKOUT_DURATION_BUCKETS) &&
        isEnumValue(properties.set_count_bucket, WORKOUT_SET_COUNT_BUCKETS)
        ? {
            name: event.name,
            properties: {
              duration_bucket: properties.duration_bucket,
              set_count_bucket: properties.set_count_bucket,
            },
          }
        : null;
    case 'workout_parse_corrected':
      return isEnumValue(properties.parse_kind, WORKOUT_PARSE_KINDS)
        ? { name: event.name, properties: { parse_kind: properties.parse_kind } }
        : null;
    case 'recommendation_accepted':
      return isEnumValue(properties.recommendation_type, RECOMMENDATION_TYPES)
        ? {
            name: event.name,
            properties: { recommendation_type: properties.recommendation_type },
          }
        : null;
    case 'paywall_presented':
      return isEnumValue(properties.source, PAYWALL_SOURCES)
        ? { name: event.name, properties: { source: properties.source } }
        : null;
    case 'checkout_started':
      return isEnumValue(properties.product_id, CHECKOUT_PRODUCTS)
        ? { name: event.name, properties: { product_id: properties.product_id } }
        : null;
    case 'nutrition_capture_opened':
      return isEnumValue(properties.mode, NUTRITION_CAPTURE_MODES)
        ? { name: event.name, properties: { mode: properties.mode } }
        : null;
    case 'nutrition_analysis_completed':
      return isEnumValue(properties.mode, NUTRITION_CAPTURE_MODES) &&
        typeof properties.cache_hit === 'boolean'
        ? {
            name: event.name,
            properties: { mode: properties.mode, cache_hit: properties.cache_hit },
          }
        : null;
    case 'nutrition_log_confirmed':
      return isEnumValue(properties.mode, NUTRITION_CAPTURE_MODES) &&
        Number.isInteger(properties.item_count) &&
        (properties.item_count as number) >= MIN_NUTRITION_ITEM_COUNT &&
        (properties.item_count as number) <= MAX_NUTRITION_ITEM_COUNT
        ? {
            name: event.name,
            properties: { mode: properties.mode, item_count: properties.item_count as number },
          }
        : null;
    default:
      return null;
  }
}

/**
 * Returns a fresh allowlisted event, dropping all unexpected keys. Invalid
 * names or required property values are rejected with null.
 */
export function sanitizeProductEvent(event: unknown): ProductEvent | null {
  try {
    return sanitizeProductEventUnsafe(event);
  } catch {
    return null;
  }
}

export function isProductEvent(event: unknown): event is ProductEvent {
  return sanitizeProductEvent(event) !== null;
}

/** Sends a product event without ever blocking the caller or surfacing errors. */
export async function trackProductEvent(event: ProductEvent): Promise<void> {
  try {
    const sanitizedEvent = sanitizeProductEvent(event);
    if (!sanitizedEvent) return;

    await fetchWithAuth(OBSERVABILITY_URL, {
      method: 'POST',
      body: JSON.stringify({
        source: 'product',
        level: 'info',
        message: sanitizedEvent.name,
        context: { event_version: 1, ...sanitizedEvent.properties },
      }),
    });
  } catch {
    // Product analytics is best effort and must never affect the user flow.
  }
}
