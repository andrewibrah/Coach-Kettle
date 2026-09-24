import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

import { closeLegalReader, legalDocTitle, resolveLegalRoute } from '../legalMode.ts';

// Minimal hook runtime: state survives re-renders (so tab switches can be
// observed), effects run after every render.
function harness() {
  const state: any[] = [];
  const effects: (() => void)[] = [];
  let index = 0;
  const react: any = {
    Fragment: 'Fragment',
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props ?? {}, children }),
    useState: (init: any) => {
      const k = index++;
      if (!(k in state)) state[k] = typeof init === 'function' ? init() : init;
      return [state[k], (v: any) => { state[k] = typeof v === 'function' ? v(state[k]) : v; }];
    },
    useEffect: (fn: () => void) => { effects.push(fn); },
  };
  react.default = react;
  return {
    react,
    render<T>(fn: () => T): T {
      index = 0;
      effects.length = 0;
      const out = fn();
      effects.forEach((e) => e());
      return out;
    },
  };
}

function load(file: string, react: any, dependencies: Record<string, any>) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, React: react, require: (name: string) => {
    if (name === 'react') return react;
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

const legalMode = { closeLegalReader, legalDocTitle, resolveLegalRoute };

// ---------- pure mode resolution ----------

test('no params is the acceptance gate on Terms (the redirect contract for tabs, sign-in and callback)', () => {
  assert.deepEqual(resolveLegalRoute({}, { needsTermsAcceptance: false }), { mode: 'accept', doc: 'terms' });
  assert.deepEqual(resolveLegalRoute({}, { needsTermsAcceptance: true }), { mode: 'accept', doc: 'terms' });
});

test('terms reader and privacy reader resolve from the shipped Settings/Paywall links', () => {
  assert.deepEqual(resolveLegalRoute({ doc: 'terms', mode: 'read' }, { needsTermsAcceptance: false }), { mode: 'reader', doc: 'terms' });
  assert.deepEqual(resolveLegalRoute({ doc: 'privacy', mode: 'read' }, { needsTermsAcceptance: false }), { mode: 'reader', doc: 'privacy' });
  assert.deepEqual(resolveLegalRoute({ doc: 'privacy', mode: 'reader' }, { needsTermsAcceptance: false }), { mode: 'reader', doc: 'privacy' });
});

test('malformed, repeated and unknown params fall back to the acceptance gate', () => {
  const state = { needsTermsAcceptance: false };
  for (const mode of [['read', 'accept'], ['accept', 'read'], ['read', 'read'], [], 'READ', 'read ', 'accept', 'close', '', undefined] as any[]) {
    assert.equal(resolveLegalRoute({ mode }, state).mode, 'accept', `mode=${JSON.stringify(mode)}`);
  }
  for (const doc of [['privacy', 'terms'], ['privacy'], 'Privacy', 'eula', '', undefined] as any[]) {
    assert.equal(resolveLegalRoute({ doc, mode: 'read' }, state).doc, 'terms', `doc=${JSON.stringify(doc)}`);
  }
});

test('an unaccepted user can never reach reader mode, whatever the params say', () => {
  assert.deepEqual(resolveLegalRoute({ doc: 'privacy', mode: 'read' }, { needsTermsAcceptance: true }), { mode: 'accept', doc: 'privacy' });
});

test('document titles match the document', () => {
  assert.equal(legalDocTitle('terms'), 'Terms of Service');
  assert.equal(legalDocTitle('privacy'), 'Privacy Policy');
});

test('reader Close goes back when there is history and to the tabs when deep-linked', () => {
  const calls: any[] = [];
  const router = (canGoBack: boolean) => ({
    canGoBack: () => canGoBack,
    back: () => calls.push(['back']),
    replace: (href: string) => calls.push(['replace', href]),
  });
  closeLegalReader(router(true));
  closeLegalReader(router(false));
  assert.deepEqual(calls, [['back'], ['replace', '/(tabs)']]);
});

// ---------- route screen ----------

function renderRoute(params: Record<string, any>, needsTermsAcceptance = false) {
  const h = harness();
  const routerCalls: any[] = [];
  const backListeners: (() => boolean)[] = [];
  const router = {
    canGoBack: () => false,
    back: () => routerCalls.push(['back']),
    replace: (href: string) => routerCalls.push(['replace', href]),
  };
  const Page = load('app/terms-of-service.tsx', h.react, {
    'react-native': {
      Pressable: 'Pressable',
      BackHandler: { addEventListener: (_: string, fn: () => boolean) => { backListeners.push(fn); return { remove() {} }; } },
    },
    'expo-router': { Stack: { Screen: 'StackScreen' }, router, useLocalSearchParams: () => params },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/TermsOfServiceScreen': { TermsOfServiceScreen: 'TermsOfServiceScreen' },
    '@/contexts/AuthLockProvider': { useAuthLock: () => ({ needsTermsAcceptance }) },
    '@/lib/legalMode': legalMode,
  }).default;
  const tree = h.render(Page);
  const all = nodes(tree);
  const options = all.find((n) => n.type === 'StackScreen').props.options;
  const screen = all.find((n) => n.type === 'TermsOfServiceScreen').props;
  return { tree, options, screen, routerCalls, backListeners };
}

test('acceptance gate: no swipe dismissal, no back button, no Close, hardware back consumed', () => {
  for (const params of [{}, { mode: ['read', 'accept'] }, { mode: 'bogus' }]) {
    const { tree, options, screen, backListeners } = renderRoute(params);
    assert.equal(options.gestureEnabled, false);
    assert.equal(options.headerBackVisible, false);
    assert.equal(options.headerLeft(), null);
    assert.doesNotMatch(JSON.stringify(tree), /Close/);
    assert.equal(screen.readOnly, false);
    assert.equal(backListeners.length, 1);
    assert.equal(backListeners[0](), true);
  }
});

test('reader: Close control only, dismissible, deep-link Close falls back to tabs', () => {
  const { options, screen, routerCalls, backListeners } = renderRoute({ doc: 'privacy', mode: 'read' });
  assert.equal(screen.readOnly, true);
  assert.equal(screen.initialDoc, 'privacy');
  assert.notEqual(options.gestureEnabled, false);
  assert.equal(backListeners.length, 0);
  const close = options.headerLeft();
  assert.equal(close.props.accessibilityLabel, 'Close');
  close.props.onPress();
  assert.deepEqual(routerCalls, [['replace', '/(tabs)']]);
});

test('switching from reader params to gate params re-keys the document view and changes mode', () => {
  const reader = renderRoute({ doc: 'privacy', mode: 'read' });
  const gate = renderRoute({ doc: 'privacy' });
  assert.notEqual(reader.screen.key, gate.screen.key);
  assert.equal(gate.screen.readOnly, false);
  assert.equal(renderRoute({ doc: 'terms', mode: 'read' }, true).screen.readOnly, false);
});

// ---------- document screen ----------

function renderDocument(props: Record<string, any>) {
  const h = harness();
  const calls = { acceptTerms: 0, signOut: 0 };
  const alerts: any[] = [];
  const Screen = load('components/TermsOfServiceScreen.tsx', h.react, {
    'expo-router': { Stack: { Screen: 'StackScreen' }, useRouter: () => ({ replace() {} }) },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
      StyleSheet: { create: (s: any) => s },
      Alert: { alert: (...args: any[]) => alerts.push(args) },
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@/contexts/AuthLockProvider': { useAuthLock: () => ({ acceptTerms: async () => { calls.acceptTerms++; return true; } }) },
    '@/contexts/AuthProvider': { useAuth: () => ({ signOut: async () => { calls.signOut++; } }) },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/constants/legal': { TERMS_OF_SERVICE: '# Terms', PRIVACY_POLICY: '# Privacy' },
    '@/hooks/useThemeColor': { useThemeColor: () => '#000' },
    '@/lib/legalMode': legalMode,
  }).TermsOfServiceScreen;
  const render = () => h.render(() => Screen(props));
  return { render, calls, alerts };
}

async function pressEverything(tree: any, alerts: any[]) {
  for (const node of nodes(tree)) {
    if (typeof node.props.onPress === 'function') await node.props.onPress();
  }
  for (const [, , buttons] of alerts) {
    for (const button of buttons ?? []) if (button.onPress) await button.onPress();
  }
}

test('reader mode can never call acceptTerms or signOut', async () => {
  for (const initialDoc of ['terms', 'privacy']) {
    const { render, calls, alerts } = renderDocument({ initialDoc, readOnly: true });
    const tree = render();
    assert.doesNotMatch(JSON.stringify(tree), /Accept|Decline/);
    await pressEverything(tree, alerts);
    await pressEverything(render(), alerts);
    assert.deepEqual(calls, { acceptTerms: 0, signOut: 0 });
  }
});

test('acceptance gate keeps Accept and Decline (Decline signs out) and has no Close', async () => {
  const { render, calls, alerts } = renderDocument({ readOnly: false });
  const tree = render();
  const labels = nodes(tree).map((n) => n.props.accessibilityLabel).filter(Boolean);
  assert.ok(labels.includes('Accept and continue'));
  assert.ok(labels.includes('Decline'));
  assert.ok(!labels.includes('Close'));
  await pressEverything(tree, alerts);
  assert.equal(calls.acceptTerms, 1);
  assert.equal(calls.signOut, 1);
});

test('native title follows the document shown, including internal tab switches', () => {
  const { render } = renderDocument({ initialDoc: 'terms', readOnly: true });
  const titleOf = (tree: any) => {
    const screens = nodes(tree).filter((n) => n.type === 'StackScreen');
    assert.equal(screens.length, 1);
    return screens[0].props.options.title;
  };
  let tree = render();
  assert.equal(titleOf(tree), 'Terms of Service');
  nodes(tree).find((n) => n.props.accessibilityLabel === 'Privacy Policy' && n.props.accessibilityRole === 'tab').props.onPress();
  tree = render();
  assert.equal(titleOf(tree), 'Privacy Policy');
});

test('the terms route does not set its own title (the document screen owns it)', () => {
  const { options } = renderRoute({ doc: 'privacy', mode: 'read' });
  assert.equal(options.title, undefined);
});

// ---------- More screen settings shortcut ----------

test('More header has an accessible 44pt Settings shortcut and keeps the Settings row', () => {
  const h = harness();
  const pushes: any[] = [];
  const More = load('app/(tabs)/more.tsx', h.react, {
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: (s: any) => s } },
    'expo-router': { useRouter: () => ({ push: (href: string) => pushes.push(href) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/screen-header': { ScreenHeader: 'ScreenHeader' },
    '@/components/ui/icon-symbol': { IconSymbol: 'Icon' },
    '@/hooks/useThemeColor': { useThemeColor: () => '#000' },
  }).default;
  const tree = h.render(More);
  const header = nodes(tree).find((n) => n.type === 'ScreenHeader');
  const button = header.props.rightElement;
  assert.equal(button.type, 'Pressable');
  assert.equal(button.props.accessibilityRole, 'button');
  assert.equal(button.props.accessibilityLabel, 'Settings');
  const flatStyle = (style: any): any => {
    if (typeof style === 'function') return flatStyle(style({ pressed: false }));
    if (Array.isArray(style)) return style.reduce((acc, s) => ({ ...acc, ...flatStyle(s) }), {});
    return style || {};
  };
  const flat = flatStyle(button.props.style);
  assert.ok(flat.minWidth >= 44 && flat.minHeight >= 44, JSON.stringify(flat));
  assert.equal(nodes(button).find((n) => n.type === 'Icon').props.name, 'gear');
  button.props.onPress();
  assert.deepEqual(pushes, ['/settings']);
  assert.ok(nodes(tree).some((n) => n.type === 'NavItem' || (typeof n.type === 'function' && n.props.label === 'Settings')));
});
