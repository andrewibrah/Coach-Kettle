import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

// react-native-purchases 10.10+ no longer tags purchase rejections itself; it
// wraps the native module so every rejection goes through PHC's
// normalizePurchasesError. Load the real wrapper so a change in the error
// shape lib/iap.ts relies on (userCancelled, string code) fails here instead
// of as an error banner after a cancelled purchase sheet.
const require = createRequire(import.meta.url);
const { normalizingRejections } = require('react-native-purchases/dist/normalizingRejections');
const { PURCHASES_ERROR_CODE } = require('@revenuecat/purchases-typescript-internal');

const iap: any = {};
const iapSource = readFileSync(new URL('../iap.ts', import.meta.url), 'utf8');
vm.runInNewContext(
  `${ts.transpileModule(iapSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText}
exports.normalizeRevenueCatError = normalizeRevenueCatError;`,
  {
    exports: iap,
    require: (id: string) => (id === 'react-native-purchases' ? { PURCHASES_ERROR_CODE } : {}),
  },
);

// What RCTPromiseRejectBlock hands JS on iOS: an Error carrying the numeric
// code as a string and the NSError userInfo (RNPurchases.m merges the error
// container's info into it).
function iosRejection(code: string, message: string, userInfo: Record<string, unknown> = {}) {
  return Object.assign(new Error(message), { code, domain: 'RevenueCat.ErrorCode', userInfo });
}

const nativeModule = {
  isConfigured: () => Promise.resolve(true),
  purchasePackage: () => Promise.reject(iosRejection(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR, 'Purchase was cancelled.', {
    readableErrorCode: 'PURCHASE_CANCELLED', readable_error_code: 'PURCHASE_CANCELLED',
  })),
  logOut: () => Promise.reject(iosRejection(PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR, 'LogOut was called but the current user is anonymous.')),
  restorePurchases: () => Promise.reject(iosRejection(PURCHASES_ERROR_CODE.NETWORK_ERROR, 'Error performing request.', {
    underlyingErrorMessage: 'The Internet connection appears to be offline.',
  })),
};
const RNPurchases = normalizingRejections(nativeModule);

test('a cancelled purchase sheet is not reported as an error', async () => {
  const error: any = await RNPurchases.purchasePackage('$rc_monthly', null, null, null, null).catch((e: unknown) => e);
  assert.equal(error.userCancelled, true);
  assert.equal(error.code, PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR);
  assert.equal(iap.normalizeRevenueCatError(error, 'Unable to complete purchase'), null);
});

test('logOut of an anonymous user keeps the code logOutRevenueCat ignores', async () => {
  const error: any = await RNPurchases.logOut().catch((e: unknown) => e);
  assert.equal(error.code, PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR);
  assert.equal(error.userCancelled, false);
});

test('other failures surface the native message', async () => {
  const error: any = await RNPurchases.restorePurchases().catch((e: unknown) => e);
  assert.ok(error instanceof Error);
  assert.equal(error.userCancelled, false);
  assert.equal(error.underlyingErrorMessage, 'The Internet connection appears to be offline.');
  assert.equal(iap.normalizeRevenueCatError(error, 'Restore failed'), 'Error performing request.');
});

test('resolved calls pass through the wrapper unchanged', async () => {
  assert.equal(await RNPurchases.isConfigured(), true);
});
