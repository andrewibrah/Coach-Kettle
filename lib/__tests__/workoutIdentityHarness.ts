import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { performedRows, isPendingSet, isPerformedRow, resolveEditedPerformance } from '../performedSets.ts';
import { numericValue, numericText, validateWorkoutRow } from '../workoutValidation.ts';
import { createSessionOwnership, settleOptionalReview } from '../sessionOwnership.ts';
import { createSubmitGuard } from '../submitGuard.ts';
const { serializeWorkoutRows } = sourceModule('lib/workoutSerialization.ts', { './performedSets': { performedRows } });

export function sourceModule(path: string, dependencies: Record<string, any> = {}) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: (name: string) => { assert.ok(name in dependencies, `missing offline dependency ${name}`); return dependencies[name]; }, console, setTimeout, clearTimeout });
  return exports;
}

export function sourceClosure(name: string, context: Record<string, any>) {
  // Retained I2/P1 fixtures have no concurrent requests. Supply the real new
  // ownership dependency without altering their original assertions. P2 race
  // fixtures explicitly provide shared ownership + the actual invalidation closure.
  context.workoutId ??= 'offline-session';
  context.showToast ??= () => {};
  context.ownership ??= createSessionOwnership('offline-baseline');
  context.renderOwner ??= context.ownership.capture();
  context.invalidateResponses ??= () => context.ownership.invalidateRequests();
  context.settleOptionalReview ??= settleOptionalReview;
  context.getWorkoutDraftGeneration ??= () => 0;
  context.draftGeneration ??= 0;
  // Permissive-guard fixtures need no re-stamp; P4 auth tests pass the real closure.
  context.restampOwner ??= () => {};
  // Retained fixtures double only the durable IO boundary; dedicated P4 tests
  // execute the real ledger/transport. Preserve their original effect captures.
  context.queueAbandon ??= async () => {};
  context.queueLiveRows ??= async (rows: any[], operation = 'put') => {
    for (const row of rows) {
      const receipt = await context.api?.logSet?.({ ...row, sessionId:context.workoutId,
        rowId:row.id, dateISO:context.workoutDateISO, revision:1,
        operationKey:`${operation}:${row.id}:1`, operation });
      if (receipt?.pr && context.ownership.isCurrent(context.renderOwner)) context.celebratePR?.(receipt.pr);
    }
  };

  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('route.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: (ts.VariableDeclaration | ts.FunctionDeclaration)[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name) && node.name.text === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(matches.length, 1);
  const exports: any = {};
  const match = matches[0];
  const expression = ts.isVariableDeclaration(match) ? match.initializer!.getText(ast) : match.getText(ast);
  const code = ts.transpileModule(`exports.run = ${expression};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  // Existing closure fixtures predate persisted auth provenance. Defaults live
  // in this VM only; auth regressions override them with real captured guards.
  vm.runInNewContext(code, { exports, canUseSession: () => true, canStartSession: () => true,
    sessionProvenanceRef: { current: { ownerId: 'offline-owner', generation: context.draftGeneration } },
    recoveryOwnerRef: { current: { ownerId: 'offline-owner', generation: context.draftGeneration } },
    submissionGuard: createSubmitGuard({ once: true }), numericValue, numericText, validateWorkoutRow, performedRows, isPendingSet, isPerformedRow, resolveEditedPerformance, serializeWorkoutRows, ...context });
  return exports.run;
}

export function renderWorkoutCard(row: any) {
  const node = (type: any, props: any) => ({ type, props });
  const gesture: any = new Proxy({}, { get: () => () => gesture });
  const card = sourceModule('components/workout/WorkoutCard.tsx', {
    'react/jsx-runtime': { jsx: node, jsxs: node, Fragment: 'Fragment' },
    react: { useCallback: (fn: any) => fn, useEffect: () => {}, useRef: (current: any) => ({ current }) },
    'react-native': { View: 'View', Pressable: 'Pressable', TextInput: 'TextInput', Keyboard: {}, StyleSheet: { create: (value: any) => value } },
    'react-native-gesture-handler': { Gesture: { Pan: () => gesture, Tap: () => gesture, Exclusive: () => gesture }, GestureDetector: 'GestureDetector' },
    'react-native-reanimated': { __esModule: true, default: { View: 'Animated.View' }, useAnimatedStyle: (fn: any) => fn(), useSharedValue: (value: any) => ({ value }), withSpring: (value: any) => value, runOnJS: (fn: any) => fn },
    'expo-haptics': {},
    '@/components/ui/themed-text': { ThemedText: 'ThemedText' },
    '@/hooks/useThemeColor': { useThemeColor: () => 'black' },
    '@/hooks/useLargeTextLayout': { useLargeTextLayout: () => ({ isLargeText: false, scaleSpace: (value: any) => value }) },
    '@/lib/performedSets': { isPerformedRow: (r: any) => performedRows([r]).length === 1 },
  });
  return card.WorkoutCard({ row, rowIndex: 0, rowHeight: 100, activeDragIndex: { value: -1 }, dragTranslationY: { value: 0 }, measuredRowHeight: { value: 100 } });
}

export async function runEnd(rows: any[], helpers: Record<string, any> = {}, failReview = false) {
  const calls: any[] = [];
  const noOp = () => {};
  const run = sourceClosure('handleEndWorkoutWithReview', {
    ...helpers, workoutId: 'session', savedWorkoutIdRef: { current: null }, selectedPart: 'Push',
    showToast: (text: string) => calls.push({ method: 'toast', text }),
    setReviewModalVisible: noOp, setReviewLoading: noOp, setSessionReview: noOp, setSavePhase: noOp,
    api: { generateSessionReview: async (rows: any[]) => { calls.push({ method: 'review', rows }); if (failReview) throw new Error('offline review'); return { rating: 5, strengths: [], weakness: '', nextSessionNote: '' }; } },
    buildWorkoutToSave: (rows: any[]) => ({ id: 'session', rows }),
    saveWorkoutLocalFirst: async (payload: any) => { calls.push({ method: 'save', payload }); return { synced: true }; },
    clearWorkoutDraft: async () => {}, endWorkoutSession: noOp, setRows: noOp, setMessageInput: noOp,
    setEditingCell: noOp, setEditValue: noOp, Platform: { OS: 'web' }, console: { error: noOp },
  });
  await run(rows);
  return calls;
}
