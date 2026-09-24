import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(file: string): string {
  return readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
}

// ---------- 44x44pt hit targets ----------

test('ScreenHeader back button has a 44x44pt minimum, centered, non-shrinking bounds', () => {
  const s = source('components/ui/screen-header.tsx');
  const match = s.match(/backBtn:\s*{([^}]*)}/);
  assert.ok(match, 'backBtn style not found');
  const body = match![1];
  assert.match(body, /minWidth:\s*44/);
  assert.match(body, /minHeight:\s*44/);
  assert.match(body, /alignItems:\s*"center"/);
  assert.match(body, /justifyContent:\s*"center"/);
  assert.match(body, /flexShrink:\s*0/);
});

test('Header menu/routine/trash buttons share a 44x44pt minimum, centered, non-shrinking iconBtn style', () => {
  const s = source('components/ui/Header.tsx');
  const match = s.match(/iconBtn:\s*{([^}]*)}/);
  assert.ok(match, 'iconBtn style not found');
  const body = match![1];
  assert.match(body, /minWidth:\s*44/);
  assert.match(body, /minHeight:\s*44/);
  assert.match(body, /alignItems:\s*'center'/);
  assert.match(body, /justifyContent:\s*'center'/);
  assert.match(body, /flexShrink:\s*0/);
  // Menu, routine and trash all use this shared style.
  assert.match(s, /onPress=\{onMenuPress\}[\s\S]{0,120}styles\.iconBtn/);
  assert.match(s, /onPress=\{onRoutinePress\}[\s\S]{0,120}styles\.iconBtn/);
  assert.match(s, /onPress=\{onClearPress\}[\s\S]{0,120}styles\.iconBtn/);
});

test('Exercise library filter pills and Retry/Clear buttons are at least 44pt tall', () => {
  const s = source('app/exercise-library/index.tsx');
  const pill = s.match(/pill:\s*{([^}]*)}/);
  const retry = s.match(/retryBtn:\s*{([^}]*)}/);
  assert.ok(pill, 'pill style not found');
  assert.ok(retry, 'retryBtn style not found');
  assert.match(pill![1], /minHeight:\s*44/);
  assert.match(retry![1], /minHeight:\s*44/);
});

// ---------- multi-select checkbox vs single-select radio ----------

test('nutrition preference multi-select pills use accessibilityRole="checkbox" with a checked state', () => {
  const s = source('app/settings/nutrition-preferences.tsx');
  // The shared `pill()` helper defaults to radio, and toggle groups
  // (dietary preferences / allergies / cuisines — all multi-select via
  // toggleIn) must opt into checkbox explicitly.
  assert.match(s, /accessibilityRole=\{role\}/);
  assert.match(s, /role === 'checkbox' \? \{ checked: active \} : \{ selected: active \}/);
  // `renderToggleGroup` is defined once and reused for all 3 multi-select
  // groups (dietary preferences, allergies, cuisines); its single `pill(...)`
  // call site must pass 'checkbox'.
  assert.match(s, /list\.map\(\(v\) => pill\(PREFERENCE_LABELS\[v\], values\.includes\(v\), \(\) => toggleIn\(values, setter, v\), 'checkbox'\)\)/);
  const renderToggleGroupCalls = [...s.matchAll(/renderToggleGroup\(/g)];
  assert.equal(renderToggleGroupCalls.length, 3, 'expected exactly 3 renderToggleGroup call sites (dietary, allergies, cuisines)');
});

test('nutrition preference single-select groups (sex, activity, goal) keep accessibilityRole="radio"', () => {
  const s = source('app/settings/nutrition-preferences.tsx');
  assert.match(s, /SEXES\.map[\s\S]{0,40}pill\(s\.label, sex === s\.v, \(\) => setSex\(s\.v\)\)/);
  assert.match(s, /GOALS\.map[\s\S]{0,40}pill\(g\.label, goal === g\.v, \(\) => setGoal\(g\.v\)\)/);
  assert.match(s, /accessibilityRole="radio"[\s\S]{0,120}accessibilityLabel=\{a\.label\}/);
});

test('exercise library body-part filter stays single-select radio (only one filter active at a time)', () => {
  const s = source('app/exercise-library/index.tsx');
  assert.match(s, /accessibilityRole="radio"/);
  assert.doesNotMatch(s, /accessibilityRole="checkbox"/);
});

// ---------- 0.5 font floor preserved, no reintroduced global line-height patch ----------

test('Header title keeps its 0.5 minimumFontScale floor', () => {
  const s = source('components/ui/Header.tsx');
  assert.match(s, /minimumFontScale=\{0\.5\}/);
  assert.match(s, /numberOfLines=\{1\}/);
  assert.match(s, /adjustsFontSizeToFit/);
});

test('ScreenHeader title keeps its font-scale floor (not lowered below what shipped)', () => {
  const s = source('components/ui/screen-header.tsx');
  const scaleMatch = s.match(/minimumFontScale=\{([\d.]+)\}/);
  assert.ok(scaleMatch, 'minimumFontScale not found on ScreenHeader title');
  assert.ok(Number(scaleMatch![1]) >= 0.7, `expected minimumFontScale >= 0.7 (shipped value), got ${scaleMatch![1]}`);
});

test('ThemedText has no global line-height change (the A/B-tested patch stays reverted)', () => {
  const s = source('components/ui/themed-text.tsx');
  // Baseline values from the shipped, withdrawn-patch-free file.
  assert.match(s, /default:\s*{\s*fontSize:\s*16,\s*lineHeight:\s*24,\s*}/);
  assert.match(s, /defaultSemiBold:\s*{\s*fontSize:\s*16,\s*lineHeight:\s*24,\s*fontWeight:\s*'600',\s*}/);
  assert.match(s, /title:\s*{\s*fontSize:\s*32,\s*fontWeight:\s*'bold',\s*lineHeight:\s*32,\s*}/);
});
