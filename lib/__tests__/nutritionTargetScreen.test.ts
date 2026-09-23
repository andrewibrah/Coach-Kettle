import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
// @ts-ignore renderer ships without declarations
import Renderer, { act } from 'react-test-renderer';
import * as storage from '../nutritionTargetStorage.ts';
import * as targets from '../nutritionTargets.ts';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const macro = { calories: 2100, protein_g: 150, carbs_g: 220, fat_g: 70 };
const saved = { id: 's', user_id: 'u', source: 'manual', base_target: macro, training_day_target: null, rest_day_target: null };
async function harness(initial: any) {
  const state: any = { targets: null, savedTargets: null, weeklyGoals: {}, todayTarget: {}, syncStatus: 'synced', ...initial };
  const alerts: any[] = [], toasts: any[] = []; let request: any;
  state.saveTargets = async (req: any) => { request = req; state.savedTargets = { ...saved, base_target: req.targets.base, training_day_target: req.targets.training_day ?? null, rest_day_target: req.targets.rest_day ?? null }; };
  state.importWeeklyGoals = async (confirmed: boolean) => { request = storage.buildWeeklyImportSaveRequest(state.weeklyGoals, state.savedTargets, confirmed); };
  const deps: any = {
    react: React,
    'react-native': { View: 'View', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: (x: any) => x }, Alert: { alert: (...args: any[]) => alerts.push(args) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/contexts/NutritionContext': { useNutrition: () => state },
    '@/lib/nutritionTargetStorage': storage, '@/lib/nutritionTargets': targets,
    '@/lib/nutrition': { isRetryableNutritionError: () => false },
    '@/hooks/useThemeColor': { useThemeColor: () => 'black' },
    '@/hooks/useToast': { useToast: () => ({ toast: null, showToast: (...args: any[]) => toasts.push(args) }) },
  };
  for (const [file, name] of [['themed-view', 'ThemedView'], ['themed-text', 'ThemedText'], ['screen-header', 'ScreenHeader'], ['Toast', 'Toast']]) deps['@/components/ui/' + file] = { [name]: name };
  const exports: any = {};
  const source = readFileSync(new URL('../../app/(tabs)/nutrition/targets.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, require: (name: string) => deps[name] });
  let root: any; await act(async () => { root = Renderer.create(React.createElement(exports.default)); });
  return { state, alerts, toasts, get request() { return request; }, text: () => JSON.stringify(root.toJSON()),
    press: async (label: string) => act(async () => root.root.findByProps({ accessibilityLabel: label }).props.onPress()),
    inputs: () => root.root.findAllByType('TextInput'),
    update: async () => act(async () => root.update(React.createElement(exports.default))),
    close: async () => act(async () => root.unmount()) };
}
test('hybrid-only and both-row accounts display accepted values and provenance, with honest missing macros and edit prefill', async () => {
  for (const legacy of [null, { training_calories: 9999, rest_calories: 9999 }]) {
    const h = await harness({ targets: legacy, savedTargets: { ...saved, base_target: { calories: 2100 } } });
    try {
      assert.match(h.text(), /2100 cal/); assert.doesNotMatch(h.text(), /9999/);
      assert.match(h.text(), /Saved to your account/); assert.match(h.text(), /—/);
      await h.press('Edit daily targets');
      const values = h.inputs().map((x: any) => x.props.value);
      assert.equal(values.filter((x: any) => x === '2100').length, 2);
      assert.equal(values.includes('158'), false);
      assert.equal(h.inputs().filter((x: any) => x.props.placeholder === 'Protein g').every((x: any) => x.props.value === ''), true);
    } finally { await h.close(); }
  }
});
test('saved hybrid row arriving after initial load exits automatic empty setup', async () => {
  const h = await harness({});
  try {
    h.state.savedTargets = saved;
    await h.update();
    assert.equal(h.text().includes('2100 cal'), true);
    assert.equal(h.text().includes('Saved to your account'), true);
  } finally { await h.close(); }
});
test('first import guides daily setup, explicit save displays accepted state, then confirmed import preserves local weekdays', async () => {
  const h = await harness({ weeklyGoals: { 1: macro } });
  try {
    await h.press('Import device goals to account');
    assert.match(JSON.stringify(h.alerts), /daily targets first/i);
    assert.equal(h.request, undefined);
    await act(async () => h.alerts[0][2].find((x: any) => x.text === 'Set daily targets').onPress());
    const dailyCalories = h.inputs().filter((x: any) => x.props.placeholder === 'Calories').slice(-2);
    await act(async () => dailyCalories[0].props.onChangeText('2300'));
    await h.press('Save nutrition targets');
    assert.match(h.text(), /2300 cal/); assert.match(h.text(), /Saved to your account/);
    assert.equal(h.request.targets.base.calories, 2300);
    await h.press('Import device goals to account');
    await act(async () => h.alerts.at(-1)[2].find((x: any) => x.text === 'Import to account').onPress());
    assert.equal(h.request.targets.base.calories, 2300);
    assert.deepEqual(h.request.targets.day_overrides.map((x: any) => x.day_of_week), [1]);
    assert.equal(h.state.weeklyGoals[1].calories, 2100);
  } finally { await h.close(); }
});
