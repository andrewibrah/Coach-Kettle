import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { sourceModule } from './workoutIdentityHarness.ts';
const node = (type: any, props: any) => ({ type, props });
const common: any = {
  'react/jsx-runtime': { jsx: node, jsxs: node },
  react: { useCallback: (fn: any) => fn, useEffect: () => {}, useRef: (current: any) => ({ current }), useState: (current: any) => [current, () => {}], useContext: () => 0 },
  'react-native': Object.fromEntries(['ActivityIndicator','Modal','Pressable','ScrollView','Text','TextInput','View'].map(key => [key, key]).concat([['StyleSheet', { create: (value: any) => value }], ['Platform', { OS: 'web' }], ['Keyboard', { dismiss: () => {} }]])),
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  '@/hooks/useThemeColor': { useThemeColor: () => 'black' },
  '@/hooks/useToast': { useToast: () => ({ toast: null }) },
  '@/hooks/useLargeTextLayout': { useLargeTextLayout: () => ({ scaleSpace: (x: any) => x }) },
  'expo-router/js-tabs': { BottomTabBarHeightContext: {} },
  'expo-haptics': {},
};
for (const [path, name] of [['media/MediaPickerBubble','MediaPickerBubble'], ['media/ReflectionInput','ReflectionInput'], ['ui/icon-symbol','IconSymbol'], ['ui/themed-text','ThemedText'], ['ui/themed-view','ThemedView'], ['ui/Toast','Toast']]) common[`@/components/${path}`] = { [name]: name };
common['@/lib/mediaUpload'] = {};
function descendants(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...[tree.props?.children].flat(3).flatMap(descendants)];
}
function modal(phase: string, onClose: any, onRetry: any = () => {}) {
  return descendants(sourceModule('components/modals/SessionReviewModal.tsx', common).SessionReviewModal({ visible: true, loading: true, review: null, workoutTitle: 'Push', savePhase: phase, onClose, onRetry }));
}

function routeProps(component: string, context: any) {
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.JsxSelfClosingElement[] = [];
  const visit = (n: ts.Node) => { if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === component) matches.push(n); ts.forEachChild(n, visit); }; visit(ast);
  assert.equal(matches.length, 1); const exports: any = {};
  vm.runInNewContext(ts.transpileModule(`exports.node = ${matches[0].getText(ast)};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: () => ({ jsx: node }), [component]: component, ...context,
  });
  return exports.node.props;
}

test('actual HomeScreen wires finalization to BottomBar and review close guard plus retry', () => {
  let mutations = 0; const noOp = () => {};
  const context: any = Object.fromEntries(['setMessageInput','sendMessage','onStartWorkout','onEndWorkout','onClearRows','showStartToast','setReviewModalVisible','setSessionReview'].map(name => [name, noOp]));
  Object.assign(context, { ownership: { busy: true }, finalizing: true, savePhase: 'saving', rows: [],
    workoutActive: true, loading: false, messageInput: '', startToastOpen: false,
    reviewModalVisible: true, reviewLoading: false, sessionReview: null, title: 'Push', savedWorkoutIdRef: { current: 'original' }, session: null, canUseSession: () => true, ownsPresentation: () => true,
    router: { push: noOp }, api: { updateWorkoutMeta: noOp },
    setReviewModalVisible: () => mutations++, setSessionReview: () => mutations++,
  });
  assert.equal(routeProps('WorkoutBottomBar', context).finalizing, true);
  const props = routeProps('SessionReviewModal', context);
  assert.equal(props.savePhase, 'saving'); props.onClose(); assert.equal(mutations, 0);
  assert.equal(typeof props.onRetry, 'function');
});

test('actual review header close and platform dismiss cannot bypass saving', async () => {
  let closes = 0; const nodes = modal('saving', () => closes++);
  const close = nodes.find(n => n.props?.accessibilityLabel === 'Close session review');
  await close.props.onPress();
  nodes.find(n => n.type === 'Modal').props.onRequestClose?.();
  assert.equal(closes, 0);
  assert.equal(close.props.disabled, true);
});

test('actual failed-save review never claims saved; offers retry instead', () => {
  let retries = 0; const nodes = modal('failed', () => {}, () => retries++);
  const text = nodes.map(n => n.props?.children).filter(v => typeof v === 'string').join(' ');
  assert.doesNotMatch(text, /Workout saved/);
  const retry = nodes.find(n => n.props?.accessibilityLabel === 'Retry saving workout');
  assert.ok(retry); retry.props.onPress(); assert.equal(retries, 1);
});

test('actual BottomBar freezes composer and End callback during finalization', () => {
  let calls = 0;
  const nodes = descendants(sourceModule('components/workout/WorkoutBottomBar.tsx', common).WorkoutBottomBar({ workoutActive: true, loading: false, finalizing: true, messageInput: 'Bench 100 5', onEndWorkout: () => calls++, sendMessage: () => calls++ }));
  const end = nodes.find(n => n.props?.accessibilityLabel === 'End workout'); end.props.onPress();
  const send = nodes.find(n => n.props?.accessibilityLabel === 'Send set'); send.props.onPress();
  assert.equal(calls, 0);
  assert.equal(end.props.disabled, true);
  assert.equal(nodes.find(n => n.type === 'TextInput').props.editable, false);
});
