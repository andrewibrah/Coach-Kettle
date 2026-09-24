import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
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

function loadModule(file: string, dependencies: Record<string, any>, react?: any) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name: string) {
    if (name === 'react' && react) return react;
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

function nodes(tree: any): any[] {
  const out: any[] = [];
  const walk = (node: any) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    out.push(node);
    walk(node.children);
  };
  walk(tree);
  return out;
}

const subscriptionConstants = loadModule('constants/subscription.ts', {});

function paywall() {
  const calls: any[] = [];
  const react: any = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props ?? {}, children }),
    useState: (value: any) => [value, () => {}],
    useEffect: () => {},
  };
  react.default = react;
  const screen = loadModule('app/paywall.tsx', {
    '@/components/AppLogo': { AppLogo: 'AppLogo' },
    '@/contexts/AuthProvider': { useAuth: () => ({ session: null, signOut: async () => { calls.push(['signOut']); } }) },
    '@/components/ui/icon-symbol': { IconSymbol: 'Icon' },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/contexts/EntitlementContext': { useEntitlement: () => ({
      needsPaywall: false, needsInitialPaywall: true,
      dismissPaywall: async () => { calls.push(['dismissPaywall']); },
      syncPurchase: async () => { calls.push(['syncPurchase']); },
    }) },
    '@/hooks/useThemeColor': { useThemeColor: () => '#000' },
    '@/lib/iap': { useIAP: () => ({
      products: [{ plan: 'monthly', localizedPrice: '2,49 €' }, { plan: 'yearly', localizedPrice: '24,99 €' }],
      purchase: async (plan: string) => { calls.push(['purchase', plan]); return false; },
      restore: async () => { calls.push(['restore']); },
      isLoadingProducts: false, isProcessing: false, error: null,
    }) },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-router': { useRouter: () => ({ push() {}, replace: (href: string) => calls.push(['replace', href]) }) },
    'react-native': { ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: (s: any) => s } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/constants/subscription': subscriptionConstants,
  }, react);
  return { tree: screen.default(), calls };
}

test('paywall renders every PRO_FEATURES entry by its title', () => {
  const { tree } = paywall();
  const text = JSON.stringify(tree);
  assert.ok(subscriptionConstants.PRO_FEATURES.length > 0);
  for (const feature of subscriptionConstants.PRO_FEATURES) {
    assert.ok(text.includes(JSON.stringify(feature.title)), `missing ${feature.title}`);
    assert.ok(text.includes(JSON.stringify(feature.description)), `missing ${feature.description}`);
  }
});

test('Pro benefits never advertise form/video analysis or unimplemented analytics', () => {
  const copy = JSON.stringify(subscriptionConstants.PRO_FEATURES) + JSON.stringify(paywall().tree);
  assert.doesNotMatch(copy, /form check|form analysis|video|camera|fatigue|projection/i);
});

test('paywall purchase, restore, localized prices and dismiss-only Continue are unchanged', async () => {
  const { tree, calls } = paywall();
  const text = JSON.stringify(tree);
  assert.match(text, /24,99 €/);
  assert.match(text, /2,49 €/);
  const byLabel = (label: string) => nodes(tree).find((n) => n.props.accessibilityLabel === label);
  await byLabel('Subscribe with Yearly').props.onPress();
  await byLabel('Restore Purchases').props.onPress();
  await byLabel('Continue').props.onPress();
  assert.deepEqual(calls, [['purchase', 'yearly'], ['restore'], ['dismissPaywall'], ['replace', '/(tabs)']]);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(new URL(`../../${dir}`, import.meta.url), { recursive: true, withFileTypes: false } as any)
    .map(String)
    .filter((f: string) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .map((f: string) => `${dir}/${f}`);
}

test('no UI copy promises fatigue monitoring, 1RM projections, or working form/video analysis', () => {
  const offenders: string[] = [];
  for (const file of [...sourceFiles('app'), ...sourceFiles('components')]) {
    readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\/?\*|\{\/\*)/.test(line)) return; // comments are not shown to users
      const overclaim = /fatigue|1RM projection|projections/i.test(line)
        || (/(form|video) analysis/i.test(line) && !/coming soon|unavailable/i.test(line));
      if (overclaim) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});
