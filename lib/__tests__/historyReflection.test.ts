import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file: string, dependencies: Record<string, any>) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}

// ---------------------------------------------------------------------------
// Pure helper unit tests (lib/historyReflection.ts)
// ---------------------------------------------------------------------------

test('trimReflectionForSave trims whitespace', () => {
  const { trimReflectionForSave } = load('lib/historyReflection.ts', {});
  assert.equal(trimReflectionForSave('  hello  '), 'hello');
  assert.equal(trimReflectionForSave(''), '');
});

test('reflectionAfterCancel reverts to the last-saved text, not the original load value', () => {
  const { reflectionAfterCancel } = load('lib/historyReflection.ts', {});
  assert.equal(reflectionAfterCancel('Saved B'), 'Saved B');
});

test('reflectionAfterSaveResult updates saved+draft and closes the editor on success', () => {
  const { reflectionAfterSaveResult } = load('lib/historyReflection.ts', {});
  // Compare structurally: the returned object is a literal constructed inside
  // the vm sandbox, so it is not prototype-identical to a test-realm object.
  assert.equal(JSON.stringify(reflectionAfterSaveResult('Saved B', true)), JSON.stringify({ saved: 'Saved B', draft: 'Saved B', editing: false }));
});

test('reflectionAfterSaveResult leaves state untouched on failure (editor stays open)', () => {
  const { reflectionAfterSaveResult } = load('lib/historyReflection.ts', {});
  assert.equal(reflectionAfterSaveResult('Saved B', false), null);
});

// ---------------------------------------------------------------------------
// Controlled-render test of the actual screen (app/history/[id].tsx)
//
// Reproduces finding F18: Cancel after a successful save reverted to the
// text that was loaded from the server, discarding the save, because
// `workout.reflection` was never updated after a successful PATCH.
// ---------------------------------------------------------------------------

type Tree = { type: any; props: Record<string, any>; children: any[] } | string | null | undefined;

function findAll(tree: Tree, predicate: (node: any) => boolean, out: any[] = []): any[] {
  if (!tree || typeof tree !== 'object') return out;
  if (predicate(tree)) out.push(tree);
  for (const child of tree.children ?? []) {
    if (Array.isArray(child)) child.forEach((c) => findAll(c, predicate, out));
    else findAll(child, predicate, out);
  }
  return out;
}

function findByLabel(tree: Tree, label: string) {
  const matches = findAll(tree, (n) => n?.props?.accessibilityLabel === label);
  assert.equal(matches.length, 1, `expected exactly one node with accessibilityLabel="${label}", found ${matches.length}`);
  return matches[0];
}

function tryFindByLabel(tree: Tree, label: string) {
  const matches = findAll(tree, (n) => n?.props?.accessibilityLabel === label);
  return matches[0];
}

function findTextInput(tree: Tree) {
  const matches = findAll(tree, (n) => n.type === 'TextInput');
  assert.equal(matches.length, 1, `expected exactly one TextInput, found ${matches.length}`);
  return matches[0];
}

function textContent(node: Tree): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  return (node.children ?? []).map(textContent).join('');
}

function makeHarness() {
  const states: any[] = [];
  const effectDeps: any[] = [];
  let cursor = 0;
  let tree: Tree = null;
  let renderFn: () => Tree = () => null;

  function rerender() {
    cursor = 0;
    tree = renderFn();
  }

  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: props || {}, children }),
    useState(initial: any) {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      const setState = (v: any) => {
        const next = typeof v === 'function' ? v(states[i]) : v;
        if (!Object.is(next, states[i])) {
          states[i] = next;
          rerender();
        }
      };
      return [states[i], setState];
    },
    useRef(initial: any) {
      const i = cursor++;
      if (!(i in states)) states[i] = { current: initial };
      return states[i];
    },
    useCallback(fn: any) { cursor++; return fn; },
    useMemo(fn: any) { cursor++; return fn(); },
    useEffect(fn: any, deps?: any[]) {
      const i = cursor++;
      const prev = effectDeps[i];
      const changed = !prev || !deps || prev.length !== deps.length || deps.some((d, idx) => !Object.is(d, prev[idx]));
      effectDeps[i] = deps;
      if (changed) fn();
    },
  };

  return {
    react: { ...react, default: react },
    mount(renderComponent: () => Tree) {
      renderFn = renderComponent;
      rerender();
    },
    rerender,
    getTree: () => tree,
  };
}

async function flush(times = 12) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

async function setupScreen(opts: {
  initialReflection: string;
  updateOk: boolean | Array<boolean>;
  /** When true, a failed save resolves `{ ok: false }` instead of throwing. */
  resolveFalseInsteadOfThrow?: boolean;
  /** When provided, updateWorkoutMeta returns this promise directly (caller controls timing/resolution). */
  deferWith?: Promise<any>;
  /** Mutable route-id box; when passed, `useLocalSearchParams` reads `routeIdBox.current` on every render. */
  routeIdBox?: { current: string };
  workouts?: Array<{ id: string; part: string; rows: any[]; reflection: string; media: any[] }>;
}) {
  const harness = makeHarness();
  const updateCalls: Array<{ id: string; reflection: string }> = [];
  let okQueue = Array.isArray(opts.updateOk) ? [...opts.updateOk] : null;

  const toastCalls: Array<[string, string]> = [];
  const toastApi = {
    toast: null,
    showToast: (msg: string, type: string) => toastCalls.push([msg, type]),
    hideToast: () => {},
  };

  const historyReflection = load('lib/historyReflection.ts', {});
  const workoutRow = { exercise: 'Bench', weightLbs: 185, reps: 8, notes: '', timestamp: null };
  const workouts = opts.workouts ?? [
    { id: 'w1', part: 'Push Day', rows: [workoutRow], reflection: opts.initialReflection, media: [] },
  ];
  const routeIdBox = opts.routeIdBox ?? { current: workouts[0].id };

  const api = load('app/history/[id].tsx', {
    react: harness.react,
    'react-native': {
      ActivityIndicator: 'ActivityIndicator',
      Pressable: 'Pressable',
      ScrollView: 'ScrollView',
      StyleSheet: { create: (s: any) => s },
      Text: 'Text',
      TextInput: 'TextInput',
      View: 'View',
    },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'expo-router': {
      Stack: Object.assign('Stack', { Screen: 'Stack.Screen' }),
      useLocalSearchParams: () => ({ id: routeIdBox.current }),
      useRouter: () => ({ back: () => {} }),
    },
    '@/contexts/AuthProvider': { useAuth: () => ({ session: { user: { id: 'u1' } } }) },
    '@/components/media/MediaPickerBubble': { MediaPickerBubble: 'MediaPickerBubble' },
    '@/components/ui/icon-symbol': { IconSymbol: 'IconSymbol' },
    '@/components/ui/Toast': { Toast: 'Toast' },
    '@/hooks/useThemeColor': { useThemeColor: () => '#000' },
    '@/hooks/useToast': { useToast: () => toastApi },
    '@/lib/historyReflection': historyReflection,
    '@/lib/api': {
      api: {
        getHistory: async () => workouts,
        updateWorkoutMeta: async (id: string, meta: { reflection?: string }) => {
          updateCalls.push({ id, reflection: meta.reflection ?? '' });
          if (opts.deferWith) return opts.deferWith;
          const ok = okQueue ? okQueue.shift() ?? true : (opts.updateOk as boolean);
          if (!ok) {
            if (opts.resolveFalseInsteadOfThrow) return { ok: false };
            throw new Error('simulated failure');
          }
          return { ok: true };
        },
      },
    },
    '@/lib/mediaUpload': {
      deleteMedia: async () => {},
      getMediaSignedUrls: async () => ({}),
      getSignedUrl: async () => '',
      pickMedia: async () => [],
      uploadAndRecordMedia: async () => ({}),
    },
  });

  harness.mount(() => api.default());
  await flush();

  return { harness, updateCalls, toastCalls, workouts, routeIdBox };
}

function pressEdit(tree: Tree) {
  const btn = tryFindByLabel(tree, 'Add reflection') ?? findByLabel(tree, 'Edit reflection');
  btn.props.onPress();
}

function setDraft(tree: Tree, text: string) {
  findTextInput(tree).props.onChangeText(text);
}

async function pressSave(tree: Tree) {
  await findByLabel(tree, 'Save reflection').props.onPress();
}

/** Fires Save without awaiting completion, so the caller can control timing. */
function triggerSave(tree: Tree): Promise<void> {
  return findByLabel(tree, 'Save reflection').props.onPress();
}

function pressCancel(tree: Tree) {
  findByLabel(tree, 'Cancel editing reflection').props.onPress();
}

test('Cancel after a successful save keeps the saved text (F18 regression)', async () => {
  const { harness, updateCalls } = await setupScreen({ initialReflection: 'Original A', updateOk: true });

  // Edit and save "Saved B".
  pressEdit(harness.getTree());
  setDraft(harness.getTree(), '  Saved B  ');
  await pressSave(harness.getTree());
  await flush();

  assert.deepEqual(updateCalls, [{ id: 'w1', reflection: 'Saved B' }]);
  assert.match(textContent(harness.getTree()), /Saved B/);

  // Start a new edit, type something else, then Cancel.
  pressEdit(harness.getTree());
  setDraft(harness.getTree(), 'Unsaved C');
  pressCancel(harness.getTree());

  const rendered = textContent(harness.getTree());
  assert.match(rendered, /Saved B/, 'Cancel must restore the last SAVED text');
  assert.doesNotMatch(rendered, /Original A/, 'Cancel must not revert to the stale pre-save text');
  assert.doesNotMatch(rendered, /Unsaved C/, 'Cancel must discard the unsaved edit');

  // The edit box itself must be closed (no Save/Cancel controls left showing).
  assert.equal(findAll(harness.getTree(), (n) => n?.props?.accessibilityLabel === 'Cancel editing reflection').length, 0);
});

test('saving an empty reflection is allowed and clears the saved text', async () => {
  const { harness, updateCalls } = await setupScreen({ initialReflection: 'Something', updateOk: true });

  pressEdit(harness.getTree());
  setDraft(harness.getTree(), '   ');
  await pressSave(harness.getTree());
  await flush();

  assert.deepEqual(updateCalls, [{ id: 'w1', reflection: '' }]);
  assert.match(textContent(harness.getTree()), /No reflection added yet/);
});

test('a failed save leaves the editor open with the draft intact and does not update the saved text', async () => {
  const { harness, updateCalls, toastCalls } = await setupScreen({ initialReflection: 'Original A', updateOk: false });

  pressEdit(harness.getTree());
  setDraft(harness.getTree(), 'Attempted B');
  await pressSave(harness.getTree());
  await flush();

  assert.equal(updateCalls.length, 1);
  assert.ok(toastCalls.some(([, type]) => type === 'error'));
  // Editor should still be open (Cancel control present) since the save failed.
  assert.equal(findAll(harness.getTree(), (n) => n?.props?.accessibilityLabel === 'Cancel editing reflection').length, 1);

  pressCancel(harness.getTree());
  assert.match(textContent(harness.getTree()), /Original A/);
});

test('duplicate Save presses while a save is in flight are blocked', async () => {
  const { harness, updateCalls } = await setupScreen({ initialReflection: '', updateOk: true });

  pressEdit(harness.getTree());
  setDraft(harness.getTree(), 'Once only');

  const first = pressSave(harness.getTree());
  const second = pressSave(harness.getTree());
  await Promise.all([first, second]);
  await flush();

  assert.equal(updateCalls.length, 1, 'a second Save press while saving must be a no-op');
});

test('a save that resolves { ok: false } without throwing leaves the editor open, keeps the draft, and does not update the saved text', async () => {
  // Distinct from the "failed save" test above (which rejects); this exercises
  // the `res?.ok === true` check itself, without relying on a thrown error to
  // short-circuit the handler. A version that skipped the ok check (assumed
  // success whenever the call didn't throw) would fail every assertion here.
  const { harness, updateCalls, toastCalls } = await setupScreen({
    initialReflection: 'Original A',
    updateOk: false,
    resolveFalseInsteadOfThrow: true,
  });

  pressEdit(harness.getTree());
  setDraft(harness.getTree(), 'Attempted B');
  await pressSave(harness.getTree());
  await flush();

  assert.equal(updateCalls.length, 1);
  assert.ok(toastCalls.some(([, type]) => type === 'error'));
  assert.equal(
    findAll(harness.getTree(), (n) => n?.props?.accessibilityLabel === 'Cancel editing reflection').length,
    1,
    'editor must stay open when the server reports ok:false'
  );
  assert.equal(findTextInput(harness.getTree()).props.value, 'Attempted B', 'the draft must be retained, not clobbered');

  pressCancel(harness.getTree());
  assert.match(textContent(harness.getTree()), /Original A/, 'the saved text must be unchanged since the save did not succeed');
});

test('the reflection input is disabled while a save is in flight, and re-enabled once it settles', async () => {
  let resolveSave: (v: any) => void = () => {};
  const deferred = new Promise((res) => { resolveSave = res; });
  const { harness } = await setupScreen({ initialReflection: '', updateOk: true, deferWith: deferred });

  pressEdit(harness.getTree());
  setDraft(harness.getTree(), 'In flight');
  assert.equal(findTextInput(harness.getTree()).props.editable, true, 'input starts editable');

  const pending = triggerSave(harness.getTree());
  await flush();

  assert.equal(findTextInput(harness.getTree()).props.editable, false, 'input must be disabled while a save is in flight');

  resolveSave({ ok: true });
  await pending;
  await flush();

  pressEdit(harness.getTree());
  assert.equal(findTextInput(harness.getTree()).props.editable, true, 'input must be editable again once the save settles');
});

test('a late save response after navigating to a different workout does not corrupt the new route, and does not leave saving stuck', async () => {
  let resolveSave: (v: any) => void = () => {};
  const deferred = new Promise((res) => { resolveSave = res; });
  const routeIdBox = { current: 'w1' };
  const { harness, updateCalls } = await setupScreen({
    initialReflection: '',
    updateOk: true,
    deferWith: deferred,
    routeIdBox,
    workouts: [
      { id: 'w1', part: 'Push Day', rows: [], reflection: 'W1 saved', media: [] },
      { id: 'w2', part: 'Pull Day', rows: [], reflection: 'W2 saved', media: [] },
    ],
  });

  assert.match(textContent(harness.getTree()), /W1 saved/);

  // Start editing+saving w1, but the response won't arrive yet.
  pressEdit(harness.getTree());
  setDraft(harness.getTree(), 'W1 unsaved edit');
  const pendingSave = triggerSave(harness.getTree());
  await flush();

  // Navigate to a different workout while the w1 save is still in flight.
  // (The editor stays open across the route change — a separate, pre-existing
  // UI quirk outside this task's scope — but the load effect still refreshes
  // the reflection draft/saved text to w2's own data via the TextInput value.)
  routeIdBox.current = 'w2';
  harness.rerender();
  await flush();

  assert.match(textContent(harness.getTree()), /Pull Day/, 'the new route must load normally while the old save is pending');
  assert.equal(findTextInput(harness.getTree()).props.value, 'W2 saved', "w2's own reflection must load, unaffected by w1's pending save");

  // Now the late w1 response arrives.
  resolveSave({ ok: true });
  await pendingSave;
  await flush();

  assert.deepEqual(updateCalls, [{ id: 'w1', reflection: 'W1 unsaved edit' }]);

  // The editor (still open from before navigating) must keep showing w2's own
  // text — the late w1 response must not overwrite it.
  assert.equal(findTextInput(harness.getTree()).props.value, 'W2 saved', "the late w1 response must not leak into the w2 view");

  // Saving must not be stuck on w2 because of the w1 response landing.
  assert.equal(findTextInput(harness.getTree()).props.editable, true, 'reflectionSaving must have been cleared even though the route changed mid-save');
  assert.equal(tryFindByLabel(harness.getTree(), 'Save reflection')?.props?.disabled, false, 'the Save button must not be stuck disabled');
});
