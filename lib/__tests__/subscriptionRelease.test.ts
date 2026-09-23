import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function screen(products: any[]) {
  const exports: any = {};
  const react = { createElement: (_: any, props: any, ...children: any[]) => ({ props, children }) };
  const code = ts.transpileModule(readFileSync(new URL('../../app/settings/subscription.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name: string) {
    if (name === 'react') return { ...react, default: react };
    if (name === 'react-native') return { StyleSheet: { create: (s: any) => s } };
    if (name === 'expo-router') return { router: {} };
    if (name.includes('safe-area')) return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (name.endsWith('EntitlementContext')) return { useEntitlement: () => ({ isPro: true, entitlement: { status: 'sub_active', appleProductId: 'fixture-year', expiresAt: null } }) };
    if (name.endsWith('AuthProvider')) return { useAuth: () => ({ session: null }) };
    if (name.endsWith('/iap')) return { useIAP: () => ({ products, isProcessing: false }) };
    if (name.endsWith('useThemeColor')) return { useThemeColor: () => '#000' };
    if (name.endsWith('useToast')) return { useToast: () => ({ toast: null }) };
    if (name.endsWith('/subscription')) return { SUBSCRIPTION: { PRODUCT_ID_YEARLY: 'fixture-year', PRICE_YEARLY: '$19.99' } };
    return {};
  } });
  return JSON.stringify(exports.default());
}

test('subscription settings displays localized matching storefront price, not hardcoded USD', () => {
  const rendered = screen([{ productId: 'fixture-year', plan: 'yearly', localizedPrice: '24,99 €' }]);
  assert.match(rendered, /24,99 €/);
  assert.doesNotMatch(rendered, /\$19.99/);
});

test('missing product never falls back to invented price and current price is not promised as renewal charge', () => {
  const rendered = screen([]);
  assert.match(rendered, /See Manage Subscription for billing details/);
  assert.match(screen([{ productId: 'fixture-year', plan: 'yearly', localizedPrice: '24,99 €' }]), /Current store price/);
  assert.doesNotMatch(rendered, /\$19.99/);
});
