// Offline execution of the actual HomeScreen sendMessage closure, not a copied route.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { decideAndParse } from '../structuredGate.ts';
import { validateWorkoutRow } from '../workoutValidation.ts';
import { createSessionOwnership } from '../sessionOwnership.ts';
import { createSubmitGuard } from '../submitGuard.ts';
import { performedRows, isPendingSet, resolveEditedPerformance } from '../performedSets.ts';
import { sourceModule, sourceClosure } from './workoutIdentityHarness.ts';

const rules = sourceModule('lib/workoutRules.ts');
const buildRowsFromApi = sourceClosure('buildRowsFromApi', {});
const toApiRows = sourceClosure('toApiRows', {});

export async function runWorkoutRoute(input: string, initialRows: any[] = [], chatResponse?: any, simultaneousSubmissions = 1, replayAfterSettled = false, overrides: Record<string, any> = {}) {
  const source = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'sendMessage') matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(matches.length, 1, 'actual route must contain exactly one sendMessage');
  const declaration = matches[0];
  assert.ok(declaration.initializer && ts.isArrowFunction(declaration.initializer));
  const code = ts.transpileModule(`exports.send = ${declaration.initializer.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  let rows = structuredClone(initialRows);
  const rowTransitions: any[][] = [];
  const ownership = createSessionOwnership('offline-session');
  const draftRowsRef = { current: rows };
  let messageInput = input;
  const calls: { method: string; data?: any }[] = [];
  const record = (method: string) => (data?: any) => { calls.push({ method, data }); };
  const deliberateProviderError = new Error('offline fixture forbids AI');
  const unexpectedErrors: unknown[] = [];
  // The route catches its own failures. Preserve diagnostics but rethrow any
  // unexpected caught failure after execution; exempt only our provider fixture
  // by identity, never all errors with a matching name/message.
  const diagnostic = (method: string) => (...args: unknown[]) => {
    calls.push({ method, data: args });
    if (!args.includes(deliberateProviderError)) unexpectedErrors.push(args[1] ?? args[0]);
  };
  const exports: { send?: () => Promise<void> } = {};
  vm.runInNewContext(code, {
    exports, submissionGuard: sourceClosure('submissionGuard', { createSubmitGuard }), validateWorkoutRow, ownership, renderOwner: ownership.capture(), getWorkoutDraftGeneration: () => 0, canUseSession: () => true, draftRowsRef, decideAndParse, performedRows, isPendingSet, resolveEditedPerformance, messageInput: input, loading: false, workoutActive: true,
    commitPendingAndGet: () => rows,
    getLastExerciseFromRows: rules.getLastExerciseFromRows,
    setRows: (value: any) => { rows = typeof value === 'function' ? value(rows) : value; draftRowsRef.current = rows; rowTransitions.push(structuredClone(rows)); },
    setMessageInput: (value: string) => { messageInput = value; },
    setLoading: record('loading'), showToast: record('toast'),
    setAiBubbleText: record('bubble'),
    // Match the actual answer branch's fire-and-forget storage contract.
    saveWorkoutChatQA: async (question: string, answer: string, timestamp: number) => {
      calls.push({ method: 'saveWorkoutChatQA', data: { question, answer, timestamp } });
    },
    api: {
      chat: async () => {
        calls.push({ method: 'chat' });
        if (chatResponse !== undefined) return chatResponse;
        throw deliberateProviderError;
      },
      logSet: async (data: any) => { calls.push({ method: 'logSet', data }); return {}; },
    },
    queueLiveRows: async (data: any[]) => { for (const row of data) calls.push({ method:'logSet', data:{...row,sessionId:'offline-session',rowId:row.id,revision:1,operationKey:`put:${row.id}:1`,dateISO:'2026-10-08'} }); },
    syncSkeletonFilledRow: record('syncSkeleton'), triggerRestTimer: record('rest'),
    celebratePR: record('pr'), handleEndWorkoutWithReview: record('end'), onEndWorkout: record('end'),
    makeId: rules.makeId, nextSetNumberForExercise: rules.nextSetNumberForExercise,
    isCompoundExercise: () => true, workoutId: 'offline-session', workoutDateISO: '2026-10-08',
    Platform: { OS: 'web' }, scrollToBottom: () => {}, scrollToRowIndex: () => {},
    FeatureGateError: class extends Error {}, showAiLimitAlert: record('limit'),
    toApiRows,
    buildRowsFromApi: (r: any[]) => { calls.push({ method: 'buildRowsFromApi' }); return buildRowsFromApi(r); },
    console: { warn: diagnostic('warning'), error: diagnostic('error') },
    ...overrides,
  });
  assert.ok(exports.send);
  await Promise.all(Array.from({ length: simultaneousSubmissions }, () => exports.send!()));
  if (replayAfterSettled) await exports.send!();
  if (unexpectedErrors.length) throw unexpectedErrors[0];
  return { rows, messageInput, calls, rowTransitions };
}
