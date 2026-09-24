import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

import { contrastRatio } from '../colorContrast.ts';

// `constants/theme.ts` imports `Platform` from `react-native`, whose real
// package entry uses Flow syntax Node's native TS stripping can't parse —
// so, like the existing `subscriptionRelease.test.ts` pattern, transpile and
// eval it in a sandbox with `react-native` stubbed out.
function loadTheme() {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL('../../constants/theme.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name: string) => {
      if (name === 'react-native') return { Platform: { select: (spec: any) => spec.default ?? spec.ios } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

const NEW_TOKENS = [
  'warningSurface',
  'dangerSurface',
  'dangerFill',
  'pressedSurface',
  'premiumAccent',
  'switchTrackInactive',
  'switchThumb',
  'shadow',
] as const;

test('new semantic tokens exist with a light and dark value', () => {
  const { Colors } = loadTheme();
  for (const token of NEW_TOKENS) {
    assert.equal(typeof Colors.light[token], 'string', `light.${token} missing`);
    assert.ok(Colors.light[token].length > 0, `light.${token} empty`);
    assert.equal(typeof Colors.dark[token], 'string', `dark.${token} missing`);
    assert.ok(Colors.dark[token].length > 0, `dark.${token} empty`);
  }
});

test('dangerFill has at least 4.5:1 contrast against white in both themes (danger #EF4444 on white is ~3.76:1, which fails)', () => {
  const { Colors } = loadTheme();
  assert.ok(contrastRatio(Colors.light.danger, '#ffffff') < 4.5, 'expected the pre-existing danger token to still fail AA on white — this test documents the defect dangerFill fixes');
  assert.ok(contrastRatio(Colors.light.dangerFill, '#ffffff') >= 4.5, `light.dangerFill vs #fff = ${contrastRatio(Colors.light.dangerFill, '#ffffff')}`);
  assert.ok(contrastRatio(Colors.dark.dangerFill, '#ffffff') >= 4.5, `dark.dangerFill vs #fff = ${contrastRatio(Colors.dark.dangerFill, '#ffffff')}`);
});

test('contrastRatio is symmetric and matches known WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#ffffff'), contrastRatio('#ffffff', '#000000'));
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff') * 100) / 100, 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
});

function source(file: string): string {
  return readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
}

test('Settings screen moves live hardcoded colors to theme tokens', () => {
  const s = source('app/settings/index.tsx');
  assert.doesNotMatch(s, /'#3d2d00'|'#FFF8E6'/, 'cacheBg must use warningSurface token');
  assert.doesNotMatch(s, /'#3d1515'|'#FFF1F0'/, 'logoutBg must use dangerSurface token');
  assert.doesNotMatch(s, /'#FFD700'/, 'crown/trophy accents must use premiumAccent token');
  assert.doesNotMatch(s, /'#767577'/, 'switch inactive track must use switchTrackInactive token');
  assert.doesNotMatch(s, /thumbColor="#fff"|thumbColor='#fff'/i, 'switch thumb must use switchThumb token');
  assert.match(s, /useThemeColor\(\{\}, 'warningSurface'\)/);
  assert.match(s, /useThemeColor\(\{\}, 'dangerSurface'\)/);
  assert.match(s, /useThemeColor\(\{\}, 'premiumAccent'\)/);
  assert.match(s, /useThemeColor\(\{\}, 'switchTrackInactive'\)/);
  assert.match(s, /useThemeColor\(\{\}, 'switchThumb'\)/);
});

test('Header and ScreenHeader pressed states use the pressedSurface token, not a hardcoded rgba literal', () => {
  for (const file of ['components/ui/Header.tsx', 'components/ui/screen-header.tsx']) {
    const s = source(file);
    assert.doesNotMatch(s, /rgba\(0,0,0,0\.05\)/, `${file} still hardcodes the pressed overlay color`);
    assert.match(s, /useThemeColor\(\{\}, ["']pressedSurface["']\)/, `${file} missing pressedSurface token`);
  }
});

test('TermsOfServiceScreen button shadow uses the shadow token, not a hardcoded #000', () => {
  const s = source('components/TermsOfServiceScreen.tsx');
  assert.doesNotMatch(s, /shadowColor:\s*'#000'/);
  assert.match(s, /useThemeColor\(\{\}, 'shadow'\)/);
});

test('hooks/useColorScheme(.web).ts call useTheme() unconditionally — no try/catch around it', () => {
  for (const file of ['hooks/useColorScheme.ts', 'hooks/useColorScheme.web.ts']) {
    const s = source(file);
    assert.doesNotMatch(s, /\btry\s*{/, `${file} still wraps a hook call in try/catch`);
    assert.match(s, /useTheme\(\)/, `${file} should still call useTheme()`);
  }
});

function loadHook(file: string, useThemeImpl: () => { colorScheme: 'light' | 'dark' }, reactStub?: any) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name: string) => {
      if (name.endsWith('ThemeProvider')) return { useTheme: useThemeImpl };
      if (name === 'react-native') return { useColorScheme: () => 'light' };
      if (name === 'react') return reactStub ?? {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

test('native useColorScheme returns colorScheme from useTheme()', () => {
  const { useColorScheme } = loadHook('hooks/useColorScheme.ts', () => ({ colorScheme: 'dark' }));
  assert.equal(useColorScheme(), 'dark');
});

test('web useColorScheme returns "light" before hydration and the theme value after', () => {
  // Simulates two renders: the first reads pre-hydration state (false), and
  // its effect flips the flag for the second — like React committing an
  // effect between renders, without a full renderer.
  let hydrated = false;
  const reactStub = {
    useState: (initial: any) => [hydrated ? true : initial, (v: boolean) => { hydrated = v; }],
    useEffect: (fn: () => void) => fn(),
  };
  const { useColorScheme } = loadHook('hooks/useColorScheme.web.ts', () => ({ colorScheme: 'dark' }), reactStub);
  assert.equal(useColorScheme(), 'light', 'first render, before hydration, must be light');
  assert.equal(useColorScheme(), 'dark', 'second render, after hydration, must reflect the theme');
});

// ---------- Fix round 1: dangerFill wired into every filled danger surface ----------
//
// `danger` (#EF4444) against white/`dangerForeground` is ~3.76:1, which fails
// WCAG AA. Every place that fills a background with `danger` and renders
// white or `dangerForeground` content on top of it must use `dangerFill`
// instead. `danger` itself stays correct for text/icon-on-transparent use
// (e.g. a status dot, a "Delete" label) and is not touched.

const DANGER_FILL_SITES: { file: string; badPatterns: RegExp[] }[] = [
  {
    file: 'components/modals/DeleteWorkoutModal.tsx',
    badPatterns: [/styles\.deleteButton,\s*{\s*backgroundColor:\s*danger\s*}/],
  },
  {
    file: 'components/workout/WorkoutTable.tsx',
    badPatterns: [/backgroundColor:\s*dangerColor,\s*minWidth:\s*scaleSpace\(80\)/],
  },
  {
    file: 'components/workout/WorkoutBottomBar.tsx',
    badPatterns: [/workoutActive && { backgroundColor:\s*dangerColor/],
  },
  {
    file: 'app/settings/templates.tsx',
    badPatterns: [/styles\.editActionButton,\s*{\s*backgroundColor:\s*dangerColor\s*}/],
  },
  { file: 'app/coach/index.tsx', badPatterns: [/styles\.errorBanner,\s*{\s*backgroundColor:\s*dangerColor\s*}/] },
  { file: 'app/(tabs)/nutrition/index.tsx', badPatterns: [/styles\.errorBanner,\s*{\s*backgroundColor:\s*dangerColor\s*}/] },
  { file: 'app/(tabs)/progress/index.tsx', badPatterns: [/styles\.card,\s*{\s*backgroundColor:\s*dangerColor\s*}/] },
  { file: 'app/(tabs)/progress/strength.tsx', badPatterns: [/styles\.card,\s*{\s*backgroundColor:\s*dangerColor\s*}/] },
  { file: 'app/(tabs)/progress/body.tsx', badPatterns: [/styles\.card,\s*{\s*backgroundColor:\s*dangerColor\s*}/] },
  { file: 'app/(tabs)/progress/photos.tsx', badPatterns: [/styles\.card,\s*{\s*backgroundColor:\s*dangerColor\s*}/] },
  { file: 'app/(tabs)/progress/resting-hr.tsx', badPatterns: [/styles\.card,\s*{\s*backgroundColor:\s*dangerColor\s*}/] },
  { file: 'app/onboarding/complete.tsx', badPatterns: [/styles\.iconCircle,\s*{\s*backgroundColor:\s*dangerColor\s*}/] },
  {
    file: 'components/media/MediaPickerBubble.tsx',
    badPatterns: [/styles\.errorBadge,\s*{\s*backgroundColor:\s*dangerColor\s*}/, /pressed && { backgroundColor:\s*dangerColor\s*}/],
  },
];

for (const { file, badPatterns } of DANGER_FILL_SITES) {
  test(`${file}: filled danger surface with white/dangerForeground content reads dangerFill, not danger`, () => {
    const s = source(file);
    assert.match(s, /useThemeColor\(\{\},\s*["']dangerFill["']\)/, `${file} does not read the dangerFill token`);
    for (const bad of badPatterns) {
      assert.doesNotMatch(s, bad, `${file} still fills a white/dangerForeground surface with the low-contrast danger token`);
    }
  });
}
