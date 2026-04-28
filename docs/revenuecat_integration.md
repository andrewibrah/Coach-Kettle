# Coach Kettle RevenueCat Integration

RevenueCat dashboard: https://app.revenuecat.com/

RevenueCat docs:

- iOS SDK setup: https://www.revenuecat.com/docs/getting-started/installation/reactnative
- Paywalls: https://www.revenuecat.com/docs/tools/paywalls
- Customer Center: https://www.revenuecat.com/docs/tools/customer-center
- App Store credentials: https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret

## Current Implementation

Coach Kettle uses RevenueCat as the client-side purchase and Pro access source.

- SDK packages: `react-native-purchases` and `react-native-purchases-ui`
- iOS public SDK key: `appl_XZhTbhwYIONjMIaDeOokOHPMXgQ`
- App user id: Supabase `session.user.id`
- Entitlement identifier: `Coach Kettle Pro`
- Offering identifier: `default`
- Package identifiers: `monthly` and `yearly`
- Paywall: RevenueCat-hosted paywall attached to offering `default`
- Customer Center: `RevenueCatUI.presentCustomerCenter`

Do not put RevenueCat secret keys or App Store `.p8` files in app code. The iOS public SDK key is safe to ship in the client.

## App Store Connect State

App:

- App ID: `6759267330`
- Bundle ID: `com.coachkettle.coachkettle`
- App Store version under review: `1.0.0`

Products currently used by RevenueCat:

- Monthly subscription
  - Product ID: `com.coachkettle.pro.monthly`
  - RevenueCat package: `monthly`
- Yearly subscription
  - Product ID: `com.coachkettle.pro.annual.v2`
  - RevenueCat package: `yearly`

## RevenueCat Dashboard Setup

1. Open the Coach Kettle project in RevenueCat.

2. Confirm the iOS app.
   - Bundle ID: `com.coachkettle.coachkettle`
   - App Store Connect API key connected
   - In-app purchase key connected

3. Confirm the entitlement.
   - Identifier: `Coach Kettle Pro`
   - Products attached:
     - `com.coachkettle.pro.monthly`
     - `com.coachkettle.pro.annual.v2`

4. Confirm the default offering.
   - Offering identifier: `default`
   - Package `monthly` points to `com.coachkettle.pro.monthly`
   - Package `yearly` points to `com.coachkettle.pro.annual.v2`

5. Confirm the hosted paywall.
   - Paywall is published.
   - Paywall is attached to offering `default`.
   - Paywall only presents the active monthly and yearly packages.
   - Terms URL: `https://coachkettle.com/#/eula`
   - Privacy URL: `https://coachkettle.com/#/privacy`

6. Confirm Customer Center.
   - Configure management, restore, refund, and support options in RevenueCat.
   - The app opens Customer Center from `app/settings/subscription.tsx`.

## Code Paths

`constants/revenuecat.ts` contains the RevenueCat client config:

```ts
export const REVENUECAT = {
  API_KEY: 'appl_XZhTbhwYIONjMIaDeOokOHPMXgQ',
  ENTITLEMENT_ID: 'Coach Kettle Pro',
  OFFERING_ID: 'default',
};
```

`lib/iap.ts` configures RevenueCat, loads offerings, reads `CustomerInfo`, restores purchases, presents the hosted RevenueCat paywall, and presents Customer Center.

```ts
await configureRevenueCat({
  appUserID: session.user.id,
  email: session.user.email,
});

const customerInfo = await Purchases.getCustomerInfo();
const isPro = isCoachKettlePro(customerInfo);
```

`app/paywall.tsx` is now a Coach Kettle intro screen that opens the hosted RevenueCat paywall:

```ts
const unlocked = await presentPaywall();
if (unlocked) {
  await refreshEntitlement();
  router.replace('/(tabs)' as any);
}
```

`contexts/EntitlementContext.tsx` merges the existing Supabase trial/free-tier state with RevenueCat Pro state. If RevenueCat says the `Coach Kettle Pro` entitlement is active, the app treats the user as Pro even if the old Supabase subscription row has not been updated.

`app/settings/subscription.tsx` opens Customer Center:

```ts
await presentCustomerCenter();
await refreshEntitlement();
```

## TestFlight Checklist

Use a real development build or TestFlight build. Expo Go cannot validate native App Store purchases.

1. Sign in with a normal Coach Kettle account.
2. Open the app paywall and tap `View Plans`.
3. Confirm the RevenueCat-hosted paywall loads from offering `default`.
4. Confirm RevenueCat customer logs show the Supabase UUID as `appUserID`.
5. Purchase monthly or yearly with a sandbox/TestFlight tester.
6. Confirm entitlement `Coach Kettle Pro` becomes active in RevenueCat.
7. Confirm the app unlocks Pro after purchase.
8. Restore purchases and confirm Pro state updates.
9. Open Settings -> Subscription and confirm Customer Center opens.

## Backend Follow-Up

The app currently unlocks Pro from RevenueCat `CustomerInfo`. Existing Supabase entitlement tables and the old `/iap` function still exist.

Before relying on server-side Pro enforcement for AI usage or other protected limits, add one of these backend strategies:

- RevenueCat webhooks into Supabase, recommended for durable entitlement sync.
- RevenueCat REST API verification from Supabase for request-time checks.

After RevenueCat is proven in TestFlight, remove the old `react-native-iap` package/plugin and the old `/iap/verify_receipt` purchase path if nothing still calls it.
