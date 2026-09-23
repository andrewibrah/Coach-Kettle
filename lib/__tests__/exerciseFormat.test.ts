import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatTerm, formatTermList } from '../exerciseFormat.ts';
import * as exerciseFormat from '../exerciseFormat.ts';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const req = createRequire(import.meta.url);
function flatten(node: any): string {
  if (node == null) return '';
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return '';
}
function transpile(file: string): string {
  return ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), {
    // target must be ES2015+: app/exercise-library/index.tsx spreads a Set
    // ("[...new Set(...)]"), and TS's default ES3 target downlevels that via a
    // helper that assumes array-like `.length` instead of iterating — it
    // silently returns [] for any Set. Only a test-harness transpile setting;
    // the real build already targets ES2015+.
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2017 },
  }).outputText;
}

// Source guards supplement formatter tests; device rendering still needs QA.
test('library display formats names while search and navigation retain raw identity', () => {
  const source = readFileSync(new URL('../../app/exercise-library/index.tsx', import.meta.url), 'utf8');
  assert.match(source, /\{formatExerciseName\(item\.name\)\}/);
  assert.match(source, /accessibilityLabel=\{`\$\{formatExerciseName\(item\.name\)\}/);
  assert.ok(source.includes('router.push(`/exercise-library/${item.slug}`)'));
  assert.ok(source.includes('!e.name.toLowerCase().includes(q)'));
  assert.ok(source.includes('keyExtractor={(ex) => ex.id}'));
});

test('detail title and media accessibility use display names, never lookup names', () => {
  const source = readFileSync(new URL('../../app/exercise-library/[slug].tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('<ScreenHeader title={formatExerciseName(exercise.name)} />'));
  assert.ok(source.includes('accessibilityLabel={`${formatExerciseName(exercise.name)} demonstration`}'));
  assert.ok(source.includes('getExerciseBySlug(String(slug))'));
  assert.ok(source.includes('const SHOW_EXERCISE_MEDIA = false;'));
});

test('nutrition toggle vocabulary has explicit display labels and saves raw values', () => {
  const source = readFileSync(new URL('../../app/settings/nutrition-preferences.tsx', import.meta.url), 'utf8');
  const labels = {
    vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian',
    gluten_free: 'Gluten-Free', dairy_free: 'Dairy-Free', low_carb: 'Low-Carb', keto: 'Keto',
    peanut: 'Peanut', tree_nut: 'Tree Nut', shellfish: 'Shellfish', egg: 'Egg',
    soy: 'Soy', gluten: 'Gluten', dairy: 'Dairy',
    mediterranean: 'Mediterranean', asian: 'Asian', mexican: 'Mexican',
    italian: 'Italian', american: 'American', indian: 'Indian',
  };
  for (const [value, label] of Object.entries(labels)) {
    assert.ok(source.includes(`${value}: '${label}'`), `Missing label for ${value}`);
  }
  assert.ok(source.includes('pill(PREFERENCE_LABELS[v], values.includes(v), () => toggleIn(values, setter, v))'));
  assert.ok(source.includes('accessibilityLabel={label}'));
  assert.ok(source.includes('dietary_preferences: dietaryPrefs'));
  assert.ok(source.includes('dietary_allergies: allergies'));
  assert.ok(source.includes('preferred_cuisines: cuisines'));
  assert.ok(!source.includes('exerciseFormat'));
});

test('exercise names use title case without equipment substitutions', () => {
  assert.equal(typeof exerciseFormat.formatExerciseName, 'function');
  for (const [raw, expected] of [
    ['air bike', 'Air Bike'],
    ['ez barbell curl', 'EZ Barbell Curl'],
    ['3/4 sit-up', '3/4 Sit-Up'],
    ["farmer's walk", "Farmer's Walk"],
    ['runner’s lunge (one-leg)', 'Runner’s Lunge (One-Leg)'],
    ['  aIR\tBIKE  ', 'Air Bike'],
    ['body weight squat', 'Body Weight Squat'],
    ['', '—'],
    ['   ', '—'],
  ]) {
    assert.equal(exerciseFormat.formatExerciseName(raw), expected);
  }
});

test('name tokens preserve canonical casing without rewriting whole equipment names', () => {
  // BOSU occurs in seed names; SkiErg occurs as equipment, not a seed name.
  // TRX is a defensive token case, not a claim that the current seed contains it.
  for (const [raw, expected] of [
    ['push-up (bosu ball)', 'Push-Up (BOSU Ball)'],
    ['dumbbell biceps curl v sit on bosu ball', 'Dumbbell Biceps Curl V Sit On BOSU Ball'],
    ['skierg sprint', 'SkiErg Sprint'],
    ['trx row', 'TRX Row'],
    ['ez-barbell curl', 'EZ-Barbell Curl'],
    ['bosun trxylophone', 'Bosun Trxylophone'],
    // JM and SZ: real seed acronyms (barbell JM bench press; SZ-bar pushdown).
    ['jm bench press', 'JM Bench Press'],
    ['sz bar curl', 'SZ Bar Curl'],
    ['sz-bar curl', 'SZ-Bar Curl'],
    // Token-boundary: words that merely contain "jm"/"sz" must not be upper-cased.
    ['adjmuster row', 'Adjmuster Row'],
    ['poszition row', 'Poszition Row'],
  ]) {
    assert.equal(exerciseFormat.formatExerciseName(raw), expected);
  }
  assert.equal(exerciseFormat.formatExerciseName(null), '—');
  assert.equal(exerciseFormat.formatExerciseName(undefined), '—');
});

// ---------- Real dataset acronyms (JM, SZ) from the seed (Gap 1) ----------

test('formatExerciseName renders the real seed JM and SZ exercise names verbatim', () => {
  for (const [raw, expected] of [
    ['barbell jm bench press', 'Barbell JM Bench Press'],
    ['ez barbell jm bench press', 'EZ Barbell JM Bench Press'],
    [
      'cable reverse grip triceps pushdown (sz-bar) (with arm blaster)',
      'Cable Reverse Grip Triceps Pushdown (SZ-Bar) (With Arm Blaster)',
    ],
  ]) {
    assert.equal(exerciseFormat.formatExerciseName(raw), expected);
  }
});

// Full-seed scan (Gap 1 follow-up) turned up "pov" (point of view) as another
// unambiguous token-level acronym rendered wrong by plain title-case, e.g.
// "barbell full squat (back pov)".
test('formatExerciseName renders the real seed "pov" acronym verbatim', () => {
  assert.equal(exerciseFormat.formatExerciseName('barbell full squat (back pov)'), 'Barbell Full Squat (Back POV)');
  assert.equal(exerciseFormat.formatExerciseName('dumbbell upright row (back pov)'), 'Dumbbell Upright Row (Back POV)');
});

test('metadata retains specific equipment names from the dataset', () => {
  for (const [raw, expected] of [
    ['leverage_machine', 'Leverage Machine'],
    ['stepmill', 'Stepmill'], ['elliptical', 'Elliptical'],
    ['assisted', 'Assisted'], ['weighted', 'Weighted'],
    ['hammer', 'Hammer'], ['tire', 'Tire'], ['skierg_machine', 'SkiErg'],
  ]) {
    assert.equal(formatTerm(raw), expected);
  }
});

// ---------- Real seed equipment values (Gap 3) ----------

test('formatTerm handles the real seed equipment values stepmill_machine and elliptical_machine', () => {
  assert.equal(formatTerm('stepmill_machine'), 'Stepmill Machine');
  assert.equal(formatTerm('elliptical_machine'), 'Elliptical Machine');
});

// ---------- Real dataset values (20260708000100_exercise_dataset_seed.sql) ----------

test('simple underscore terms are split and title-cased', () => {
  assert.equal(formatTerm('dumbbell'), 'Dumbbell');
  assert.equal(formatTerm('cable'), 'Cable');
  assert.equal(formatTerm('barbell'), 'Barbell');
  assert.equal(formatTerm('kettlebell'), 'Kettlebell');
  assert.equal(formatTerm('hip_flexors'), 'Hip Flexors');
  assert.equal(formatTerm('lower_back'), 'Lower Back');
});

test('override table wins for terms whose canonical casing is not simple title-case', () => {
  assert.equal(formatTerm('body_weight'), 'Bodyweight');
  assert.equal(formatTerm('ez_barbell'), 'EZ Bar');
  assert.equal(formatTerm('smith_machine'), 'Smith Machine');
  assert.equal(formatTerm('bosu_ball'), 'BOSU Ball');
  assert.equal(formatTerm('olympic_barbell'), 'Olympic Barbell');
  assert.equal(formatTerm('wheel_roller'), 'Ab Wheel');
  assert.equal(formatTerm('cardiovascular_system'), 'Cardiovascular System');
});

test('naive title-casing would look as unpolished as the underscores -- overrides prevent that', () => {
  // Regression guard for the exact examples the investigation called out.
  assert.notEqual(formatTerm('ez_barbell'), 'Ez Barbell');
  assert.notEqual(formatTerm('bosu_ball'), 'Bosu Ball');
});

for (const [raw, expected] of [
  ['constructor', 'Constructor'],
  ['__proto__', '  Proto  '],
  ['toString', 'Tostring'],
]) {
  test(`metadata formats prototype-property name ${raw} as an ordinary string`, () => {
    assert.equal(formatTerm(raw), expected);
  });
}

// ---------- Case / whitespace normalization ----------

test('already-capitalized or mixed-case input normalizes the same as lowercase', () => {
  assert.equal(formatTerm('Dumbbell'), 'Dumbbell');
  assert.equal(formatTerm('DUMBBELL'), 'Dumbbell');
  assert.equal(formatTerm('Body_Weight'), 'Bodyweight');
});

test('surrounding whitespace is trimmed', () => {
  assert.equal(formatTerm('  dumbbell  '), 'Dumbbell');
  assert.equal(formatTerm('  body_weight '), 'Bodyweight');
});

// ---------- Category values (compound/isolation) ----------

test('single-word category values are title-cased', () => {
  assert.equal(formatTerm('compound'), 'Compound');
  assert.equal(formatTerm('isolation'), 'Isolation');
});

// ---------- body_part values are already clean Title Case (idempotent) ----------

test('already-clean Title Case values pass through unchanged', () => {
  assert.equal(formatTerm('Abs'), 'Abs');
  assert.equal(formatTerm('Legs'), 'Legs');
  assert.equal(formatTerm('Lower Arms'), 'Lower Arms');
});

// ---------- null / empty / falsy ----------

test('null, undefined, and empty string all fall back to an em dash', () => {
  assert.equal(formatTerm(null), '—');
  assert.equal(formatTerm(undefined), '—');
  assert.equal(formatTerm(''), '—');
  assert.equal(formatTerm('   '), '—');
});

// ---------- formatTermList ----------

test('formatTermList formats and joins every entry', () => {
  assert.equal(formatTermList(['hip_flexors', 'lower_back']), 'Hip Flexors, Lower Back');
  assert.equal(formatTermList(['abs']), 'Abs');
});

test('formatTermList falls back to an em dash for null/undefined/empty arrays', () => {
  assert.equal(formatTermList(null), '—');
  assert.equal(formatTermList(undefined), '—');
  assert.equal(formatTermList([]), '—');
});

// ---------- Gap 2: behavioral proof of search identity + unchanged slug navigation ----------
// These render the real screens (react-test-renderer) instead of only grepping source text,
// so a regression that broke search-by-raw-name or slug navigation would fail these.

function load(file: string, dependencies: Record<string, any>) {
  const exportsObj: any = {};
  vm.runInNewContext(transpile(file), {
    exports: exportsObj,
    require: (name: string) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exportsObj;
}

const exerciseFormatDeps = load('lib/exerciseFormat.ts', {});

async function libraryHost(exercises: any[]) {
  const React = req('react');
  const renderer = req('react-test-renderer');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const pushed: string[] = [];
  const exportsObj: any = {};
  vm.runInNewContext(transpile('app/exercise-library/index.tsx'), {
    exports: exportsObj, console,
    require(name: string) {
      if (name === 'react') return React;
      if (name === 'react-native') return {
        ActivityIndicator: 'ActivityIndicator',
        // A functional FlatList stand-in: renders the header + one element per
        // data item via the real renderItem, so search/filter results and card
        // presses are exercised for real instead of stubbed out.
        FlatList: (props: any) => {
          const data = props.data || [];
          const items = data.map((item: any, index: number) => props.renderItem({ item, index }));
          const empty = data.length === 0 ? (props.ListEmptyComponent ?? null) : null;
          return React.createElement(React.Fragment, null, props.ListHeaderComponent ?? null, ...items, empty);
        },
        Pressable: 'Pressable',
        StyleSheet: { create: (v: any) => v },
        TextInput: 'TextInput',
        View: 'View',
      };
      if (name === 'expo-router') return { useRouter: () => ({ push: (p: string) => pushed.push(p) }) };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name.includes('useThemeColor')) return { useThemeColor: () => 'black' };
      if (name.includes('exerciseLibrary')) return { fetchExerciseLibrary: async () => exercises };
      if (name.includes('exerciseFormat')) return exerciseFormatDeps;
      const components: Record<string, string> = {
        'themed-view': 'ThemedView', 'themed-text': 'ThemedText', 'screen-header': 'ScreenHeader', 'icon-symbol': 'IconSymbol',
      };
      for (const [suffix, component] of Object.entries(components)) if (name.endsWith(suffix)) return { [component]: component };
      throw new Error(name);
    },
  });
  let tree: any;
  await renderer.act(async () => { tree = renderer.create(React.createElement(exportsObj.default)); });
  return {
    act: renderer.act,
    pushed,
    visibleNames: () =>
      tree.root.findAllByType('ThemedText')
        .map((n: any) => flatten(n.props.children))
        .filter((t: string) => t && !/^\d+( exercises)?$/.test(t)),
    setQuery: (q: string) => tree.root.findByType('TextInput').props.onChangeText(q),
    setBodyPartFilter: (bp: string) => {
      const pill = tree.root.findAllByType('Pressable').find((p: any) => p.props.accessibilityLabel === bp);
      pill.props.onPress();
    },
    pressCard: (formattedName: string) => {
      const card = tree.root.findAllByType('Pressable').find(
        (p: any) => typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel.startsWith(formattedName)
      );
      card.props.onPress();
    },
    unmount: async () => renderer.act(async () => tree.unmount()),
  };
}

const exJmBench = { id: 'e1', slug: 'ez-barbell-jm-bench-press', name: 'ez barbell jm bench press', category: 'compound', body_part: 'Chest' };
const exSquat = { id: 'e2', slug: 'barbell-squat', name: 'barbell squat', category: 'compound', body_part: 'Legs' };
const exEzMachine = { id: 'e3', slug: 'ez-press-machine', name: 'ez press machine', category: 'compound', body_part: 'Legs' };

test('exercise-library search matches the raw name, case-insensitively, including the JM record', async () => {
  const h = await libraryHost([exJmBench, exSquat, exEzMachine]);
  await h.act(async () => { h.setQuery('ez barbell'); });
  assert.deepEqual(h.visibleNames().filter((t: string) => t.includes('Bench Press') || t.includes('Squat') || t.includes('Press Machine')), ['EZ Barbell JM Bench Press']);

  await h.act(async () => { h.setQuery('jm'); });
  assert.deepEqual(h.visibleNames().filter((t: string) => t.includes('Bench Press') || t.includes('Squat') || t.includes('Press Machine')), ['EZ Barbell JM Bench Press']);

  // Querying with a formatted-looking (mixed-case) form behaves the same, case-insensitively.
  await h.act(async () => { h.setQuery('EZ BARBELL'); });
  assert.deepEqual(h.visibleNames().filter((t: string) => t.includes('Bench Press') || t.includes('Squat') || t.includes('Press Machine')), ['EZ Barbell JM Bench Press']);
  await h.unmount();
});

test('exercise-library body_part filter composes with search instead of overriding it', async () => {
  const h = await libraryHost([exJmBench, exSquat, exEzMachine]);
  await h.act(async () => { h.setBodyPartFilter('Legs'); });
  await h.act(async () => { h.setQuery('ez'); });
  const names = h.visibleNames().filter((t: string) => t.includes('Bench Press') || t.includes('Squat') || t.includes('Press Machine'));
  // "ez barbell jm bench press" matches the text query but is body_part Chest,
  // so the Legs filter must exclude it; only the Legs+ez record should remain.
  assert.deepEqual(names, ['EZ Press Machine']);
  await h.unmount();
});

test('exercise-library card shows the formatted name but navigates using the unchanged raw slug', async () => {
  const h = await libraryHost([exJmBench]);
  h.pressCard('EZ Barbell JM Bench Press');
  assert.deepEqual(h.pushed, ['/exercise-library/ez-barbell-jm-bench-press']);
  assert.ok(h.visibleNames().includes('EZ Barbell JM Bench Press'), 'card text must show the formatted display name');
  await h.unmount();
});

async function detailHost(exercise: any) {
  const React = req('react');
  const renderer = req('react-test-renderer');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const exportsObj: any = {};
  vm.runInNewContext(transpile('app/exercise-library/[slug].tsx'), {
    exports: exportsObj, console,
    require(name: string) {
      if (name === 'react') return React;
      if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Image: 'Image', ScrollView: 'ScrollView', StyleSheet: { create: (v: any) => v }, View: 'View' };
      if (name === 'expo-router') return { useLocalSearchParams: () => ({ slug: exercise.slug }) };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name.includes('useThemeColor')) return { useThemeColor: () => 'black' };
      if (name.includes('exerciseLibrary')) return { getExerciseBySlug: async (slug: string) => (slug === exercise.slug ? exercise : null) };
      if (name.includes('exerciseFormat')) return exerciseFormatDeps;
      const components: Record<string, string> = { 'themed-view': 'ThemedView', 'themed-text': 'ThemedText', 'screen-header': 'ScreenHeader' };
      for (const [suffix, component] of Object.entries(components)) if (name.endsWith(suffix)) return { [component]: component };
      throw new Error(name);
    },
  });
  let tree: any;
  await renderer.act(async () => { tree = renderer.create(React.createElement(exportsObj.default)); });
  return {
    headerTitle: () => tree.root.findByType('ScreenHeader').props.title,
    unmount: async () => renderer.act(async () => tree.unmount()),
  };
}

test('exercise-library detail screen title uses the formatted display name, not the raw stored name', async () => {
  const exercise = {
    slug: 'ez-barbell-jm-bench-press', name: 'ez barbell jm bench press',
    body_part: 'Chest', category: 'compound', difficulty: 'beginner',
    equipment: [], description: null, cues: [], common_mistakes: [],
    primary_muscles: [], secondary_muscles: [], media_id: null,
  };
  const h = await detailHost(exercise);
  assert.equal(h.headerTitle(), 'EZ Barbell JM Bench Press');
  await h.unmount();
});
