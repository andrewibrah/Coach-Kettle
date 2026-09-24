import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import * as validation from '../onboardingValidation.ts';
import * as navigation from '../onboardingNavigation.ts';
import * as submitGuard from '../submitGuard.ts';

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(route: string, initial: any = {}, loading = false, strict = false) {
  const calls: any[] = [];
  const navigations: any[] = [];
  const alerts: any[] = [];
  const haptics: any[] = [];
  const stateAfterUnmount: any[] = [];
  const stateUpdates: any[] = [];
  let unmounted = false;
  const listeners = new Set<() => void>();
  let revision = 0;
  const notify = () => { revision += 1; listeners.forEach((listener) => listener()); };
  let reject = false;
  let pending: Promise<void> | undefined;
  const context = {
    draft: initial, draftLoading: loading, draftSaving: false,
    updateDraft: async (patch: any) => {
      calls.push(patch);
      context.draft = { ...context.draft, ...patch };
      context.draftSaving = true;
      notify();
      try {
        if (pending) await pending;
        if (reject) throw new Error('offline');
      } finally {
        context.draftSaving = false;
        notify();
      }
    },
  };
  const container = ({ children, footer }: any) => React.createElement('Container', null, children, footer);
  const mocks: Record<string, any> = {
    react: { ...React, useState: (initialValue: any) => {
      const [value, setValue] = React.useState(initialValue);
      return [value, (next: any) => {
        stateUpdates.push(next);
        if (unmounted) stateAfterUnmount.push(next);
        setValue(next);
      }];
    } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@/components/onboarding': {
      QuizContainer: container, QuizInput: 'Input', QuizProgress: 'Progress', QuizQuestion: 'Question', QuizButtonGroup: 'Buttons',
      QuizUnitPicker: 'UnitPicker', QuizNumberInputWithUnit: 'NumberInput', QuizOptionList: 'OptionList', QuizLiftAdder: 'LiftAdder', QuizLiftList: 'LiftList',
    },
    '@/contexts/ProfileContext': { useProfile: () => ({ profile: null }) },
    '@/contexts/AuthProvider': { useAuth: () => ({ session: null }) },
    '@/lib/profile': { fetchTrackedLifts: async () => [] },
    '@/components/ui/themed-text': { ThemedText: 'Text' },
    '@/components/ui/themed-view': { ThemedView: 'View' },
    '@/components/ui/icon-symbol': { IconSymbol: 'Icon' },
    '@/contexts/OnboardingContext': { useOnboarding: () => { React.useSyncExternalStore((listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); }, () => revision); return context; } },
    '@/hooks/useThemeColor': { useThemeColor: () => 'black' },
    '@/lib/onboardingValidation': validation,
    '@/lib/onboardingNavigation': navigation,
    'expo-haptics': { impactAsync() { haptics.push('impact'); return Promise.resolve(); }, notificationAsync() { haptics.push('notification'); }, ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' } },
    'expo-router': { router: Object.fromEntries(['push', 'replace', 'dismissTo'].map((method) => [method, (path: string) => navigations.push([method, path])])) },
    'react-native': { View: 'View', ScrollView: 'ScrollView', TouchableOpacity: 'Touch', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, StyleSheet: { create: (x: any) => x }, Alert: { alert: (...args: any[]) => alerts.push(args) } },
    'react-native-reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeIn: {}, FadeOut: {}, Layout: { springify: () => ({}) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
  };
  const load = (url: URL) => {
    const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const module = { exports: {} as any };
    new Function('require', 'module', 'exports', compiled)((name: string) => {
      assert.ok(name in mocks, `Unexpected dependency: ${name}`);
      return mocks[name];
    }, module, module.exports);
    return module;
  };
  // The real shared hook, wired to the same mocked context and react-native.
  mocks['@/lib/submitGuard'] = submitGuard;
  mocks['@/hooks/useOnboardingSubmit'] = load(new URL('../../hooks/useOnboardingSubmit.ts', import.meta.url)).exports;
  const module = load(new URL(`../../app/onboarding/${route}.tsx`, import.meta.url));
  const element = () => strict
    ? React.createElement(React.StrictMode, null, React.createElement(module.exports.default))
    : React.createElement(module.exports.default);
  let renderer: any;
  await act(async () => { renderer = create(element()); });
  const find = (type: string) => renderer.root.findByType(type);
  const input = (placeholder: string) => renderer.root.findAllByType('Input').find((x: any) => x.props.placeholder === placeholder);
  const pressHandler = (label: string) => renderer.root.findAllByType('Touch')
    .find((x: any) => x.props.accessibilityLabel === label).props.onPress;
  return {
    calls, navigations, alerts, haptics, stateAfterUnmount, stateUpdates, context, find, input,
    replaceDraft: async (draft: any) => { await act(async () => { context.draft = draft; notify(); }); },
    setContext: async (patch: any) => { await act(async () => { Object.assign(context, patch); notify(); }); },
    text: () => renderer.root.findAllByType('Text').map((node: any) => node.props.children).flat().join(' '),
    reject: (value: boolean) => { reject = value; },
    pending: (value: Promise<void> | undefined) => { pending = value; },
    change: async (placeholder: string, text: string) => { await act(async () => input(placeholder).props.onChangeText(text)); },
    press: async (label: string) => { await act(async () => pressHandler(label)()); },
    pressHandler,
    button: async (name: string) => { await act(async () => find('Buttons').props[name]()); },
    back: async () => { await act(async () => find('Progress').props.onBack()); },
    refresh: async () => { await act(async () => notify()); },
    close: async () => { await act(async () => { unmounted = true; renderer.unmount(); }); },
  };
}

test('PR strict inputs block Next, Back and Skip, with independent errors and finite preview', async () => {
  const h = await mount('pr-values', { tracked_lifts: ['Squat'] });
  try {
    for (const [weight, reps] of [['100', ''], ['', '5'], ['junk', '2'], ['0', '2'], ['100', '1.5'], ['100', '-1'], ['1e308', '100']]) {
      await h.change('225', weight); await h.change('5', reps);
      await h.button('onContinue'); await h.back(); await h.button('onSkip');
      assert.ok(h.input('225').props.error || h.input('5').props.error);
      assert.equal(h.input('225').props.value, weight);
      assert.equal(h.input('5').props.value, reps);
      assert.equal(h.calls.length, 0); assert.equal(h.navigations.length, 0);
      assert.doesNotMatch(h.text(), /Estimated 1RM|NaN|Infinity/);
    }
    await h.change('225', 'bad'); await h.change('5', 'bad'); await h.button('onContinue');
    await h.change('225', '100');
    assert.equal(h.input('225').props.error, undefined); assert.ok(h.input('5').props.error);
    await h.change('5', '1');
    assert.match(h.text(), /Estimated 1RM 100/);
    await h.button('onSkip'); assert.equal(h.calls.length, 0);
    await h.button('onContinue');
    assert.equal(h.calls[0].pr_values[0].reps, 1);
    assert.deepEqual(h.navigations, [['push', '/onboarding/workout-setup']]);
  } finally { await h.close(); }
});

test('PR Back saves, decrements, dismisses semantically; blank Skip removes PR and filters removed lifts', async () => {
  const h = await mount('pr-values', { tracked_lifts: ['Squat', 'Bench'], pr_values: [{ lift_name: 'Removed', weight_lbs: 100, reps: 1 }, { lift_name: 'Bench', weight_lbs: 80, reps: 3 }] });
  try {
    await h.change('225', '200'); await h.change('5', '5'); await h.button('onContinue');
    assert.equal(h.input('225').props.value, '80');
    await h.change('225', '90'); await h.back();
    assert.equal(h.input('225').props.value, '200');
    assert.equal(h.calls[1].pr_values.find((p: any) => p.lift_name === 'Bench').weight_lbs, 90);
    await h.back(); assert.deepEqual(h.navigations, [['dismissTo', '/onboarding/pr-lifts']]);
    await h.change('225', ''); await h.change('5', ''); await h.button('onSkip');
    assert.deepEqual(h.calls.at(-1).pr_values.map((p: any) => p.lift_name), ['Bench']);
    await h.change('225', ''); await h.change('5', ''); await h.button('onSkip');
    assert.deepEqual(h.calls.at(-1).pr_values, []);
    assert.deepEqual(h.navigations.at(-1), ['push', '/onboarding/workout-setup']);
  } finally { await h.close(); }
});

test('PR rejected writes retain inputs and position; synchronous guard blocks duplicate writes', async () => {
  const h = await mount('pr-values', { tracked_lifts: ['Squat', 'Bench'] });
  try {
    await h.change('225', '120.00'); await h.change('5', '3'); h.reject(true);
    await h.back(); await h.button('onContinue');
    assert.equal(h.input('225').props.value, '120.00'); assert.equal(h.navigations.length, 0); assert.equal(h.alerts.length, 2);
    h.reject(false);
    let release!: () => void;
    h.pending(new Promise<void>((resolve) => { release = resolve; }));
    let first: Promise<void>;
    await act(async () => { const handler = h.find('Buttons').props.onContinue; first = handler(); void handler(); });
    assert.equal(h.calls.length, 3); assert.equal(h.find('Buttons').props.continueLoading, true); assert.equal(h.find('Buttons').props.skipDisabled, true);
    await act(async () => { release(); await first; });
    assert.match(h.find('Question').props.question, /Bench/);
  } finally { await h.close(); }
});

test('no-lifts stale PR cleanup waits for hydration/saving and persistence before one redirect', async () => {
  const h = await mount('pr-values', { tracked_lifts: [], pr_values: [{ lift_name: 'Squat', weight_lbs: 100, reps: 1 }] }, true, true);
  try {
    let release!: () => void;
    h.pending(new Promise<void>((resolve) => { release = resolve; }));
    assert.equal(h.calls.length, 0); assert.equal(h.navigations.length, 0);
    h.context.draftSaving = true; h.context.draftLoading = false; await h.refresh();
    assert.equal(h.calls.length, 0); assert.equal(h.navigations.length, 0);
    h.context.draftSaving = false; await h.refresh(); await h.refresh();
    assert.deepEqual(h.calls, [{ pr_values: [] }]);
    assert.equal(h.navigations.length, 0);
    await act(async () => { release(); });
    await h.refresh(); await h.refresh();
    assert.deepEqual(h.context.draft.pr_values, []);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.navigations, [['replace', '/onboarding/workout-setup']]);
  } finally { await h.close(); }
});

test('stale PR cleanup writes and redirects once during Strict Mode effect replay', async () => {
  const h = await mount('pr-values', { tracked_lifts: [], pr_values: [{ lift_name: 'Squat', weight_lbs: 100, reps: 1 }] }, false, true);
  try {
    await h.refresh(); await h.refresh();
    assert.deepEqual(h.calls, [{ pr_values: [] }]);
    assert.deepEqual(h.navigations, [['replace', '/onboarding/workout-setup']]);
  } finally { await h.close(); }
});

test('failed no-lifts cleanup retains route and draft, then Retry persists the optimistic empty PRs', async () => {
  const retained = { tracked_lifts: [], current_step: 6, focus: 'strength' };
  const h = await mount('pr-values', { ...retained, pr_values: [{ lift_name: 'Squat', weight_lbs: 100, reps: 1 }] }, true, true);
  try {
    h.reject(true); h.context.draftLoading = false; await h.refresh();
    await h.refresh(); await h.refresh();
    assert.equal(h.calls.length, 1); assert.equal(h.alerts.length, 1);
    assert.equal(h.navigations.length, 0);
    assert.deepEqual(h.context.draft, { ...retained, pr_values: [] });
    assert.ok(h.find('View'));
    h.reject(false);
    let release!: () => void;
    h.pending(new Promise<void>((resolve) => { release = resolve; }));
    h.context.draftSaving = true; await h.refresh();
    await act(async () => { h.alerts[0][2].find((button: any) => button.text === 'Retry').onPress(); });
    assert.equal(h.calls.length, 1); assert.equal(h.navigations.length, 0);
    h.context.draftSaving = false; await h.refresh(); await h.refresh();
    assert.deepEqual(h.calls, [{ pr_values: [] }, { pr_values: [] }]);
    assert.equal(h.navigations.length, 0);
    await act(async () => { release(); });
    await h.refresh();
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.navigations, [['replace', '/onboarding/workout-setup']]);
  } finally { await h.close(); }
});

test('already absent/empty PRs redirect once without writing under Strict Mode', async () => {
  for (const prDraft of [{}, { pr_values: [] }]) {
    const h = await mount('pr-values', { tracked_lifts: [], ...prDraft }, false, true);
    try {
      await h.refresh(); await h.refresh();
      assert.deepEqual(h.calls, []);
      assert.deepEqual(h.navigations, [['replace', '/onboarding/workout-setup']]);
    } finally { await h.close(); }
  }
});

test('template add/edit validation, save failure retention, retry and completion failure', async () => {
  const old = { name: 'Existing', lifts: [{ name: 'Row', sets: 1, reps: 1 }] };
  const h = await mount('workout-setup', { workout_templates: [old] });
  try {
    await h.press('Yes, set up templates'); await h.change('Workout name...', 'Legs'); await h.button('onContinue');
    await h.press('Add exercise'); assert.ok(h.input('Exercise name...').props.error);
    await h.change('Exercise name...', 'Squat');
    for (const value of ['junk', '0', '-1', '1.5', '9007199254740992']) {
      await h.change('3', value); await h.change('10', value); await h.press('Add exercise');
      assert.ok(h.input('3').props.error); assert.ok(h.input('10').props.error);
      assert.equal(h.input('3').props.value, value); assert.equal(h.find('Buttons').props.continueDisabled, true);
    }
    await h.change('3', '3'); assert.equal(h.input('3').props.error, undefined); assert.ok(h.input('10').props.error);
    await h.change('10', '5'); await h.press('Add exercise');
    await h.press('Edit Squat'); await h.change('3', '2junk'); await h.press('Save exercise');
    assert.ok(h.input('3').props.error); assert.equal(h.input('3').props.value, '2junk');
    await h.change('3', '2'); await h.press('Save exercise');
    await h.change('Exercise name...', 'Pending input');
    h.reject(true); await h.button('onContinue');
    assert.match(h.find('Question').props.question, /Legs/); assert.equal(h.input('Exercise name...').props.value, 'Pending input');
    assert.equal(h.navigations.length, 0); assert.equal(h.alerts.length, 1);
    h.reject(false); await h.button('onContinue');
    assert.deepEqual(h.calls.at(-1).workout_templates, [old, { name: 'Legs', lifts: [{ name: 'Squat', sets: 2, reps: 5 }] }]);
    h.reject(true); await h.press('Done, finish setup');
    assert.equal(h.find('Question').props.question, 'Workout saved!'); assert.equal(h.navigations.length, 0);
    await h.back(); h.reject(false); await h.press('Skip for now');
    assert.equal(h.calls.at(-1).workout_templates.length, 2);
    assert.deepEqual(h.navigations, [['push', '/onboarding/complete']]);
  } finally { await h.close(); }
});

test('workout saves guard duplicates and external draftSaving blocks transitions', async () => {
  const h = await mount('workout-setup', {}, false, true);
  try {
    h.context.draftSaving = true; await h.refresh();
    await h.press('Yes, set up templates'); await h.press('Skip for now'); await h.back();
    assert.equal(h.calls.length, 0); assert.equal(h.navigations.length, 0);
    h.context.draftSaving = false; await h.refresh();
    await h.press('Yes, set up templates'); await h.change('Workout name...', 'Push'); await h.button('onContinue');
    await h.change('Exercise name...', 'Press'); await h.press('Add exercise');
    let release!: () => void;
    h.pending(new Promise<void>((resolve) => { release = resolve; }));
    let first: Promise<void>;
    await act(async () => { const handler = h.find('Buttons').props.onContinue; first = handler(); void handler(); void h.find('Buttons').props.onSkip(); });
    assert.equal(h.calls.length, 1); assert.equal(h.find('Buttons').props.continueLoading, true);
    assert.equal(h.find('Buttons').props.continueDisabled, true); assert.equal(h.find('Buttons').props.skipDisabled, true);
    await h.back(); assert.match(h.find('Question').props.question, /Push/);
    await act(async () => { release(); await first; });
    assert.equal(h.find('Question').props.question, 'Workout saved!');
    h.pending(undefined);
    await h.press('Done, finish setup');
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.navigations, [['push', '/onboarding/complete']]);
  } finally { await h.close(); }
});

for (const routeAction of ['pr', 'cleanup', 'workout', 'finish']) {
  for (const rejects of [false, true]) {
    test(`${routeAction} ${rejects ? 'reject' : 'resolve'} after unmount has no UI side effects`, async () => {
      const pr = routeAction === 'pr' || routeAction === 'cleanup';
      const h = await mount(pr ? 'pr-values' : 'workout-setup', pr ? {
        tracked_lifts: routeAction === 'pr' ? ['Squat'] : [],
        pr_values: [{ lift_name: 'Squat', weight_lbs: 100, reps: 3 }],
      } : {}, routeAction === 'cleanup', true);
      if (routeAction === 'workout') {
        await h.press('Yes, set up templates'); await h.change('Workout name...', 'Legs'); await h.button('onContinue');
        await h.change('Exercise name...', 'Squat'); await h.press('Add exercise');
      }
      let release!: () => void;
      h.pending(new Promise<void>((resolve) => { release = resolve; }));
      h.reject(rejects);
      let completion: any;
      if (routeAction === 'cleanup') await h.setContext({ draftLoading: false });
      else await act(async () => {
        completion = routeAction === 'finish'
          ? h.pressHandler('Skip for now')()
          : h.find('Buttons').props.onContinue();
      });
      assert.equal(h.calls.length, 1);
      const feedbackCount = h.haptics.length;
      await h.close();
      await act(async () => { release(); await completion; });
      assert.deepEqual(h.navigations, []);
      assert.deepEqual(h.alerts, []);
      assert.deepEqual(h.stateAfterUnmount, []);
      assert.equal(h.haptics.length, feedbackCount);
    });
  }
}

test('pending cleanup loses eligibility when lifts appear', async () => {
  const h = await mount('pr-values', { tracked_lifts: [], pr_values: [{ lift_name: 'Squat', weight_lbs: 100, reps: 1 }] }, true, true);
  try {
    let release!: () => void;
    h.pending(new Promise<void>((resolve) => { release = resolve; }));
    await h.setContext({ draftLoading: false });
    await h.replaceDraft({ tracked_lifts: ['Bench'], pr_values: [] });
    await act(async () => { release(); });
    assert.deepEqual(h.navigations, []);
    assert.match(h.find('Question').props.question, /Bench/);
    assert.equal(h.calls.length, 1);
  } finally { await h.close(); }
});

test('PR content replacement rehydrates, preserves unrelated typing, and reconciles reordered and shorter lists', async () => {
  const h = await mount('pr-values', { tracked_lifts: ['Squat', 'Bench', 'Row'] });
  try {
    await h.button('onContinue');
    await h.change('225', '90.00'); await h.change('5', '3');
    await h.replaceDraft({ ...h.context.draft, focus: 'strength' });
    assert.equal(h.input('225').props.value, '90.00');
    await h.replaceDraft({ tracked_lifts: ['Squat', 'Bench', 'Row'], pr_values: [{ lift_name: 'Bench', weight_lbs: 150, reps: 2 }] });
    assert.equal(h.input('225').props.value, '150'); assert.equal(h.input('5').props.value, '2');
    await h.replaceDraft({ ...h.context.draft, tracked_lifts: ['Bench', 'Row', 'Squat'] });
    assert.match(h.find('Question').props.question, /Bench/);
    assert.equal(h.find('Question').props.subtitle, 'Lift 1 of 3');
    await h.button('onContinue'); await h.button('onContinue');
    await h.replaceDraft({ tracked_lifts: ['Row'] });
    assert.match(h.find('Question').props.question, /Row/);
    assert.equal(h.find('Question').props.subtitle, 'Lift 1 of 1');
  } finally { await h.close(); }
});

test('workout replacement supplies completion templates and preserves the local workout editor', async () => {
  const old = { name: 'Old', lifts: [] };
  const replacement = { name: 'Replacement', lifts: [{ name: 'Row', sets: 2, reps: 8 }] };
  const h = await mount('workout-setup', { workout_templates: [old] }, false, true);
  try {
    await h.press('Yes, set up templates'); await h.change('Workout name...', 'Local'); await h.button('onContinue');
    await h.change('Exercise name...', 'Squat'); await h.press('Add exercise');
    await h.replaceDraft({ workout_templates: [replacement] });
    assert.match(h.find('Question').props.question, /Local/);
    await h.button('onContinue');
    assert.deepEqual(h.calls[0].workout_templates.map((w: any) => w.name), ['Replacement', 'Local']);
    await h.replaceDraft({ workout_templates: [replacement] });
    assert.doesNotMatch(h.text(), /Local|Old/);
    await h.press('Done, finish setup');
    assert.deepEqual(h.calls.at(-1).workout_templates, [replacement]);
    assert.deepEqual(h.navigations, [['push', '/onboarding/complete']]);
  } finally { await h.close(); }
});

test('cleanup Retry callback is inert after unmount', async () => {
  const h = await mount('pr-values', { tracked_lifts: [], pr_values: [{ lift_name: 'Squat', weight_lbs: 100, reps: 1 }] }, true);
  h.reject(true);
  await h.setContext({ draftLoading: false });
  const retry = h.alerts[0][2][0].onPress;
  await h.close();
  await act(async () => { retry(); });
  assert.deepEqual(h.stateAfterUnmount, []);
  assert.equal(h.calls.length, 1);
});

test('workout replacement during a save cannot be overwritten by its stale completion', async () => {
  const h = await mount('workout-setup');
  try {
    await h.press('Yes, set up templates'); await h.change('Workout name...', 'Local'); await h.button('onContinue');
    await h.change('Exercise name...', 'Squat'); await h.press('Add exercise');
    let release!: () => void;
    h.pending(new Promise<void>((resolve) => { release = resolve; }));
    let completion: any;
    await act(async () => { completion = h.find('Buttons').props.onContinue(); });
    const replacement = [{ name: 'New draft', lifts: [] }];
    await h.replaceDraft({ workout_templates: replacement });
    await act(async () => { release(); await completion; });
    await h.back(); await h.back();
    h.pending(undefined);
    await h.press('Skip for now');
    assert.deepEqual(h.calls.at(-1).workout_templates, replacement);
  } finally { await h.close(); }
});

for (const listChange of ['append', 'identity', 'mutate']) {
  for (const rejects of [false, true]) {
    test(`pending PR ${rejects ? 'rejection' : 'completion'} is invalidated by lift list ${listChange}`, async () => {
      const h = await mount('pr-values', {
        tracked_lifts: ['Squat'],
        pr_values: [{ lift_name: 'Squat', weight_lbs: 100, reps: 3 }],
      });
      try {
        let release!: () => void;
        h.pending(new Promise<void>((resolve) => { release = resolve; }));
        h.reject(rejects);
        let completion: any;
        await act(async () => { completion = h.find('Buttons').props.onContinue(); });
        const trackedLifts = listChange === 'identity' ? ['Squat']
          : listChange === 'append' ? ['Squat', 'Bench'] : h.context.draft.tracked_lifts;
        if (listChange === 'mutate') trackedLifts.push('Bench');
        const authoritative = { ...h.context.draft, tracked_lifts: trackedLifts };
        await h.replaceDraft(authoritative);
        const stateUpdateCount = h.stateUpdates.length;
        await act(async () => { release(); await completion; });
        assert.equal(h.stateUpdates.length, stateUpdateCount);
        assert.deepEqual(h.navigations, []);
        assert.deepEqual(h.haptics, []);
        assert.deepEqual(h.alerts, []);
        assert.equal(h.context.draft, authoritative);
        assert.match(h.find('Question').props.question, /Squat/);
        assert.equal(h.find('Question').props.subtitle, `Lift 1 of ${trackedLifts.length}`);
        assert.equal(h.input('225').props.value, '100');
        assert.equal(h.input('5').props.value, '3');
        assert.equal(h.find('Buttons').props.continueDisabled, false);
        assert.equal(h.find('Buttons').props.continueLoading, false);
        h.pending(undefined); h.reject(false);
        await h.button('onContinue');
        if (listChange === 'identity') {
          assert.deepEqual(h.navigations, [['push', '/onboarding/workout-setup']]);
        } else {
          assert.deepEqual(h.navigations, []);
          assert.match(h.find('Question').props.question, /Bench/);
          assert.equal(h.find('Question').props.subtitle, 'Lift 2 of 2');
        }
      } finally { await h.close(); }
    });
  }
}

for (const route of ['age', 'height', 'current-weight', 'goal-weight', 'focus']) {
  test(`${route} guards double submit, disables both buttons and reports busy while the draft saves`, async () => {
    const h = await mount(route, {});
    try {
      const props = () => h.find('Buttons').props;
      assert.equal(props().continueDisabled, false); assert.equal(props().skipDisabled, false);
      let release!: () => void;
      h.pending(new Promise<void>((resolve) => { release = resolve; }));
      let first: Promise<void>;
      await act(async () => { first = props().onSkip(); void props().onSkip(); void props().onContinue(); });
      assert.equal(h.calls.length, 1);
      assert.equal(props().continueDisabled, true); assert.equal(props().skipDisabled, true); assert.equal(props().continueLoading, true);
      await act(async () => { release(); await first; });
      assert.equal(h.navigations.length, 1);
      h.pending(undefined);
      // External saves and hydration block both actions too.
      for (const patch of [{ draftSaving: true }, { draftLoading: true }]) {
        await h.setContext(patch);
        await h.button('onContinue'); await h.button('onSkip');
        assert.equal(h.calls.length, 1); assert.equal(props().continueDisabled, true); assert.equal(props().skipDisabled, true);
        await h.setContext({ draftSaving: false, draftLoading: false });
      }
      // A failed write alerts, stays on the screen and re-enables the buttons.
      h.reject(true);
      await h.button('onSkip');
      assert.equal(h.calls.length, 2); assert.equal(h.navigations.length, 1); assert.equal(h.alerts.length, 1);
      assert.equal(props().continueDisabled, false); assert.equal(props().skipDisabled, false);
    } finally { await h.close(); }
  });
}

test('Continue announces busy to assistive tech while loading', () => {
  const source = readFileSync(new URL('../../components/onboarding/QuizButtons.tsx', import.meta.url), 'utf8');
  assert.match(source, /accessibilityState=\{\{ disabled: disabled \|\| loading, busy: !!loading \}\}/);
});

test('pr-lifts relies on the owner-scoped draft queue and still blocks navigation on a failed write', async () => {
  const source = readFileSync(new URL('../../app/onboarding/pr-lifts.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /writeQueue|enqueueWrite/);
  const h = await mount('pr-lifts', { tracked_lifts: [] });
  try {
    await act(async () => h.find('LiftAdder').props.onAdd('Squat'));
    await act(async () => h.find('LiftAdder').props.onAdd('Bench'));
    assert.deepEqual(h.calls.map((c) => c.tracked_lifts), [['Squat'], ['Squat', 'Bench']]);
    h.reject(true);
    await h.button('onContinue');
    assert.equal(h.navigations.length, 0);
    assert.match(JSON.stringify(h.alerts.at(-1)), /Unable to save lifts/);
    h.reject(false);
    await h.button('onContinue');
    assert.deepEqual(h.calls.at(-1), { tracked_lifts: ['Squat', 'Bench'], pr_values: [], current_step: 6 });
    assert.deepEqual(h.navigations, [['push', navigation.ONBOARDING_ROUTES[6]]]);
  } finally { await h.close(); }
});

test('the five guarded steps share useOnboardingSubmit instead of a copied guard', () => {
  for (const route of ['age', 'height', 'current-weight', 'goal-weight', 'focus']) {
    const source = readFileSync(new URL(`../../app/onboarding/${route}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /= useOnboardingSubmit\(\);/, route);
    assert.doesNotMatch(source, /submitGuard|setSubmitting|Alert\.alert/, route);
  }
});
