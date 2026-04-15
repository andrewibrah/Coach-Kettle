# ASC Subscription Stats — Coach Kettle
> Updated: 2026-04-15 via `asc` CLI v0.47.1

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

✅ **Single group** — Both tiers consolidated into one group. Users can only hold one active subscription at a time.

| Group Name | Group ID | Subscriptions |
|------------|----------|--------------|
| Coach Kettle Pro | `21967675` | 2 |

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
| Price | $1.99 USD |
| **State** | **READY_TO_SUBMIT** ⚠️ |
| Introductory Offers | None configured |

### Annual (Group: `21967675`)

| Field | Value |
|-------|-------|
| ASC Subscription ID | `6762304011` |
| Product ID | `com.coachkettle.pro.annual.v2` |
| Display Name | Annual |
| Period | ONE_YEAR |
| Group Level | 2 |
| Price | $19.99 USD |
| **State** | **MISSING_METADATA** ⚠️ Needs review screenshot |
| Introductory Offers | None configured |

---

## Codebase Alignment

### Product IDs

| ASC Product ID | App Constant | Match |
|----------------|--------------|-------|
| `com.coachkettle.pro.monthly` | `SUBSCRIPTION.PRODUCT_ID_MONTHLY` | ✅ |
| `com.coachkettle.pro.annual.v2` | `SUBSCRIPTION.PRODUCT_ID_ANNUAL` | ✅ |

---

## Remaining Actions Before Submission

| # | Priority | Action | How |
|---|----------|--------|-----|
| 1 | 🔴 REQUIRED | Add review screenshot to Annual sub (`6762304011`) | `asc subscriptions review screenshots create --subscription-id 6762304011 --screenshot <path>` |
| 2 | 🔴 REQUIRED | Submit both subscriptions for review | `asc subscriptions review submit --subscription-id 6760269429` and `--subscription-id 6762304011` |
| 3 | 🔴 REQUIRED | Configure ASSN webhook URL in ASC | ASC → App Information → App Store Server Notifications → `https://vjfteiuxsdqdozhljxhd.supabase.co/functions/v1/iap` |
| 4 | 🟡 OPTIONAL | Configure 7-day free trial as StoreKit introductory offer | `asc subscriptions offers create --subscription-id <ID> --duration P7D --offer-type FREE_TRIAL` |

---

## History

- **2026-04-05**: Initial setup — two separate groups (Monthly `21967675`, annual `21967837`), both READY_TO_SUBMIT
- **2026-04-15**: Consolidated into single group `21967675` (renamed "Coach Kettle Pro"). Annual sub recreated as `com.coachkettle.pro.annual.v2` (ASC ID `6762304011`) — original `com.coachkettle.annual` deleted; Apple permanently reserved the old product ID preventing reuse.
