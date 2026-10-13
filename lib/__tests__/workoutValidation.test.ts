import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceClosure, sourceModule } from './workoutIdentityHarness.ts';
import { runWorkoutRoute } from './inSessionHarness.ts';
import { decideAndParse } from '../structuredGate.ts';
import { numericValue, validateWorkoutRow, isStrengthEvidence } from '../workoutValidation.ts';
import * as edgeContract from '../../supabase/functions/_shared/workoutValidation.ts';
for (const input of ['Bench NaN 8', 'Bench Infinity 8', 'Bench 100 NaN', 'Bench 100 Infinity', 'Run 5 min HR -1', 'Run 5 min HR 8oops', 'Run 5 min level -1', 'Run 5oops min']) {
  test(`actual parser/composer numeric integrity ${input}`, async () => {
    assert.equal(decideAndParse(input, {}).kind, 'validation');
    const result = await runWorkoutRoute(input);
    assert.equal(result.messageInput, input); assert.equal(result.rows.length, 0);
    assert.equal(result.calls.filter(c => ['chat', 'logSet', 'rest', 'pr'].includes(c.method)).length, 0);
  });
}
test('numeric JSON values use finite semantics, not scientific-notation string rejection', () => {
  assert.deepEqual(numericValue(1e22), { kind: 'known', value: 1e22 });
  assert.deepEqual(numericValue(1e-7), { kind: 'known', value: 1e-7 });
  assert.equal(numericValue('1e22').kind, 'invalid');
});
test('cardio optional decimal quantities are not prefix-truncated', () => {
  const result = decideAndParse('Run 5 min HR 120.5 level 2.5', {});
  assert.equal(result.kind, 'fast');
  if (result.kind !== 'fast') throw new Error('Expected cardio');
  assert.equal(result.rows[0].heartRate, 120.5); assert.equal(result.rows[0].level, 2.5);
});
test('parser rejects negative cardio quantities instead of stripping the sign', () => {
  assert.equal(decideAndParse('Run -5 min', {}).kind, 'validation');
});
for (const value of ['', null, undefined, '0', 0, '-1', -1, '8.5', 'NaN', NaN, Infinity, '8oops', '100kg', '100oz', '.5', '9007199254740992']) {
  test(`shared app/Edge parity for ${String(value)}`, () => {
    assert.deepEqual(numericValue(value), edgeContract.numericValue(value));
    assert.deepEqual(numericValue(value, true), edgeContract.numericValue(value, true));
    assert.equal(validateWorkoutRow({ exercise: 'Bench', weightLbs: value, reps: '8' }), edgeContract.validateWorkoutRow({ exercise: 'Bench', weightLbs: value, reps: '8' }));
  });
}
test('known zero is different from unknown and zero reps are not strength evidence', () => {
  assert.equal(numericValue('').kind, 'unknown'); assert.equal(numericValue('0').kind, 'known');
  assert.equal(isStrengthEvidence({ exercise: 'Pushups', weightLbs: '0', reps: '12' }), true);
  assert.equal(isStrengthEvidence({ exercise: 'Pushups', weightLbs: '0', reps: '0' }), false);
});
for (const set of [0, '0', '00', 1, '01', undefined, '0oops', '00junk', '1oops', '1e2', '0.0', -1, null, '']) {
  test(`client/Edge set-number evidence parity ${JSON.stringify(set)}`, () => {
    const row = { exercise: 'Bench', weightLbs: '100', reps: '8', set };
    const valid = set === undefined || [0, '0', '00', 1, '01'].includes(set as never);
    const eligible = valid && set !== 0 && set !== '0' && set !== '00';
    assert.equal(validateWorkoutRow(row, true) === null, valid);
    assert.equal(edgeContract.validateWorkoutRow(row, true) === null, valid);
    assert.equal(isStrengthEvidence(row), eligible);
    assert.equal(edgeContract.isStrengthEvidence(row), eligible);
  });
}
test('actual AI response rejects malformed row and keeps original composer without performed effects', async () => {
  const input = 'Bench and squat 100 8';
  const result = await runWorkoutRoute(input, [], { rows: [{ exercise: 'Bench', set: 1, weightLbs: '100', reps: '8oops' }] });
  assert.equal(result.rows.length, 0); assert.equal(result.messageInput, input);
  assert.equal(result.calls.filter(c => ['logSet', 'rest', 'pr'].includes(c.method)).length, 0);
});
test('zero reps are retained but trigger no live PR/rest/performed write', async () => {
  const result = await runWorkoutRoute('Bench 100 0');
  assert.equal(result.rows[0].reps, '0');
  assert.equal(result.calls.filter(c => ['logSet', 'rest', 'pr'].includes(c.method)).length, 0);
});
const rules = sourceModule('lib/workoutRules.ts');
test('actual blur keeps invalid edit and does not set rows', () => {
  const calls: string[] = [];
  sourceClosure('commitCellEdit', {
    useCallback: (fn: any) => fn, editingCell: { rowId: 'one', field: 'reps' },
    applyPendingEdit: (rows: any[]) => ({ nextRows: rows, changed: false, invalid: true }),
    draftRowsRef: { current: [] }, rows: [],
    setRows: () => calls.push('rows'), setEditingCell: () => calls.push('clear'), setEditValue: () => calls.push('text'),
  })();
  assert.deepEqual(calls, []);
});
test('actual modal invalid backdrop keeps raw fields, feedback and no save/close', () => {
  const slots = [' ', 'NaN', '-1', 'literal']; let index = 0; const calls: any[] = [];
  const jsx = (type: any, props: any) => ({ type, props });
  const module = sourceModule('components/modals/EditSetModal.tsx', {
    react: { __esModule: true, default: {}, useEffect: () => {}, useState: () => {
      const i = index++; return [slots[i] ?? '', (value: any) => { calls.push(['state', value]); }];
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { KeyboardAvoidingView: 'KeyboardAvoidingView', Modal: 'Modal', Platform: { OS: 'web' }, Pressable: 'Pressable', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (x: any) => x } },
    '@/components/ui/themed-text': { ThemedText: 'Text' }, '@/hooks/useThemeColor': { useThemeColor: () => 'black' },
    '@/lib/workoutValidation': sourceModule('lib/workoutValidation.ts'),
  });
  const tree = module.EditSetModal({ visible: true, row, onSave: () => calls.push('save'), onClose: () => calls.push('close') });
  tree.props.children.props.children.props.onPress();
  assert.ok(!calls.includes('save') && !calls.includes('close'));
  assert.ok(calls.some(c => Array.isArray(c) && c[0] === 'state' && String(c[1]).includes('Exercise')));
});
const row = { id: 'one', exercise: 'Bench', set: 1, weightLbs: '100', reps: '8', notes: '', timestamp: 1 };
for (const [field, value] of [['reps', '8.5'], ['reps', '8oops'], ['weightLbs', 'NaN'], ['weightLbs', '-1'], ['exercise', ' '], ['set', '1oops']] as const) {
  test(`actual inline rejects ${field}=${value} retaining row and feedback`, () => {
    const messages: string[] = [];
    const result = sourceClosure('applyPendingEdit', {
      useCallback: (fn: any) => fn, editingCell: { rowId: 'one', field }, editValue: value,
      normalizeExercise: rules.normalizeExercise, resequenceSets: rules.resequenceSets,
      showToast: (message: string) => messages.push(message),
    })([row]);
    assert.equal(result.changed, false);
    assert.equal(result.invalid, true);
    assert.equal(result.nextRows[0], row);
    assert.ok(messages.length);
  });
}
test('actual modal save route rejects invalid numbers before mutator', () => {
  let mutations = 0;
  sourceClosure('handleSaveSet', { withPendingRows: () => mutations++, showToast: () => {} })({ ...row, reps: '-1' });
  assert.equal(mutations, 0);
});
