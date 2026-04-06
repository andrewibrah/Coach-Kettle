# ASC Subscription Stats — Coach Kettle
> Generated: 2026-04-05 via `asc` CLI v0.47.1

---

## App

| Field | Value |
|-------|-------|
| Name | Coach Kettle |
| App ID | `6759267330` |
| Bundle ID | `com.coachkettle.coachkettle` |
| SKU | `coachkettlepro` |
| Primary Locale | `en-US` |

---

## Subscription Groups

⚠️ **Warning:** Monthly and Annual are in **separate subscription groups**. Apple's best practice is to keep all subscription tiers in **one group** so users can only hold one active sub at a time. With two groups, a user could technically subscribe to both simultaneously.

| Group Name | Group ID | Subscriptions |
|------------|----------|--------------|
| Monthly | `21967675` | 1 |
| annual | `21967837` | 1 |

---

## Subscriptions

### Monthly (Group: `21967675`)

| Field | Value |
|-------|-------|
| ASC Subscription ID | `6760269429` |
| Product ID | `com.coachkettle.pro.monthly` |
| Display Name | Monthly |
| Period | ONE_MONTH |
| Group Level | 1 |
| **State** | **READY_TO_SUBMIT** ⚠️ |
| Introductory Offers | None configured |
| Promotional Offers | None configured |

### Annual (Group: `21967837`)

| Field | Value |
|-------|-------|
| ASC Subscription ID | `6760273266` |
| Product ID | `com.coachkettle.annual` |
| Display Name | Annual |
| Period | ONE_YEAR |
| Group Level | 1 |
| **State** | **READY_TO_SUBMIT** ⚠️ |
| Introductory Offers | None configured |
| Promotional Offers | None configured |

---

## Codebase Alignment

### Product IDs

| ASC Product ID | App Constant | Match |
|---------------|--------------|-------|
| `com.coachkettle.pro.monthly` | `SUBSCRIPTION.PRODUCT_ID_MONTHLY` | ✅ |
| `com.coachkettle.annual` | `SUBSCRIPTION.PRODUCT_ID_ANNUAL` | ✅ |

### Issues Found & Fixed

| # | Severity | Issue | File | Fix |
|---|----------|-------|------|-----|
| 1 | 🔴 CRITICAL | `handleSubscribe` in paywall was a stub — showed "Coming Soon" Alert, never called `purchase()` | `app/paywall.tsx` | **Fixed** — now calls `purchase()` with the selected plan's product ID |
| 2 | 🔴 CRITICAL | `purchase` function not destructured from `useIAP` | `app/paywall.tsx` | **Fixed** — added to destructure |
| 3 | 🟡 WARNING | Two separate subscription groups (Monthly + Annual should share one group) | ASC Config | ⚠️ Manual ASC fix needed — merge into one group |
| 4 | 🟡 WARNING | Both subscriptions are `READY_TO_SUBMIT` — not live yet | ASC Config | ⚠️ Submit for review in ASC |
| 5 | 🟠 NOTICE | `iap` edge function uses legacy `verifyReceipt` API (deprecated by Apple) | `supabase/functions/iap/index.ts` | ℹ️ Works for now but should migrate to App Store Server API (StoreKit 2) |

---

## Action Items for You

1. **ASC → Merge subscription groups** — Delete one group and move both products (monthly + annual) into a single subscription group. This prevents double-subscribing.
2. **ASC → Submit subscriptions for review** — Both are `READY_TO_SUBMIT`. Go to ASC → Subscriptions → submit each one with a review screenshot.
3. **ASC → Configure introductory offer** — The codebase references a 7-day free trial (`TRIAL_DAYS: 7`) but no intro offer is configured in ASC. Add a free trial intro offer to both products.
4. **Code** — No action needed; product IDs match and purchase flow is now wired up.
