import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { BODY_METRIC_FIELDS } from '../bodyMetricValidation.ts';

const require = createRequire(import.meta.url);
function loadValidation() {
  const path = new URL('../bodyMetricValidation.ts', import.meta.url);
  assert.ok(existsSync(path), 'strict body validator must exist');
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  return exports;
}

test('strict schema validates all endpoints, decimals, blanks, junk and real calendar dates', () => {
  const { validateBodyMetricInput: validate, BODY_METRIC_FIELDS: fields } = loadValidation();
  const date = { measured_date: '2024-02-29' };
  assert.equal(fields.length, 8);
  for (const f of fields) {
    for (const value of [f.min, f.max, ` ${f.min + 0.25} `]) {
      const result = validate({ ...date, [f.key]: value });
      assert.equal(result.valid, true, `${f.key}: ${value}`);
      assert.equal(result.payload[f.key], Number(value));
    }
    for (const value of [f.min - 0.01, f.max + 0.01, '12abc', '0x40', '1e2', 'NaN', 'Infinity', true, [], {}]) {
      const result = validate({ ...date, weight_lbs: 180, [f.key]: value });
      assert.equal(result.valid, false, `${f.key}: ${value}`);
      assert.ok(result.errors[f.key]);
      assert.equal(result.payload, undefined);
    }
  }
  for (const measured_date of ['2023-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-01', ' 2026-01-01 ']) {
    assert.equal(validate({ measured_date, weight_lbs: 180 }).valid, false, measured_date);
  }
  for (const body of [{}, { weight_lbs: ' \t ', waist_in: null }, { notes: 'only notes' }]) {
    assert.equal(validate({ ...date, ...body }).valid, false);
  }
  const mixed = validate({ ...date, weight_lbs: '180', arm_in: '4', thigh_in: '51' });
  assert.ok(mixed.errors.arm_in && mixed.errors.thigh_in);
  const sparse = validate({ ...date, weight_lbs: ' 180.25 ', waist_in: ' ', notes: '' });
  assert.equal(JSON.stringify(sparse.payload), JSON.stringify({ ...date, weight_lbs: 180.25, notes: '' }));
});

// Actual React route, isolated native UI and network boundaries; not a device test.
async function routeHost() {
  const React = require('react');
  const renderer = require('react-test-renderer');
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let owner = 'user-a';
  let resolveSave: () => void = () => {};
  let rejectSave: (error: Error) => void = () => {};
  const calls: any[] = [];
  const deletes: { id: string; resolve: () => void; reject: (error: Error) => void }[] = [];
  const alerts: any[][] = [];
  const loads: string[] = [];
  let nextLoad: Promise<any[]> | undefined;
  const notices: string[] = [];
  const exports: any = {};
  const source = readFileSync(new URL('../../app/(tabs)/progress/body.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, console, require(name: string) {
      if (name === 'react') return React;
      if (name === 'react-native') return { ActivityIndicator: 'ActivityIndicator', Alert: { alert(_title: string, _message: string, buttons: any[]) { alerts.push(buttons); } }, Pressable: 'Pressable', RefreshControl: 'RefreshControl', ScrollView: 'ScrollView', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (v: any) => v } };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 0 }) };
      if (name.includes('AuthProvider')) return { useAuth: () => ({ session: owner ? { user: { id: owner } } : null }) };
      if (name.includes('bodyMetricValidation')) return loadValidation();
      if (name.includes('bodyMetrics')) return {
        fetchBodyMetrics: async () => {
          loads.push(owner);
          if (nextLoad) { const result = nextLoad; nextLoad = undefined; return result; }
          return [{ id: `${owner}-entry`, measured_date: '2026-09-21', weight_lbs: 180 }];
        },
        deleteBodyMetric: (id: string) => new Promise<void>((resolve, reject) => { deletes.push({ id, resolve, reject }); }),
        upsertBodyMetric: (input: any) => { calls.push(input); return new Promise<void>((resolve, reject) => { resolveSave = resolve; rejectSave = reject; }); },
      };
      if (name.includes('workoutRules')) return { todayISO: () => '2026-09-21' };
      if (name.includes('useThemeColor')) return { useThemeColor: () => 'black' };
      if (name.includes('useToast')) return { useToast: () => ({ toast: null, showToast: (s: string) => notices.push(s), hideToast() {} }) };
      const components: Record<string, string> = { 'themed-view': 'ThemedView', 'themed-text': 'ThemedText', 'screen-header': 'ScreenHeader', Toast: 'Toast' };
      for (const [suffix, component] of Object.entries(components)) if (name.endsWith(suffix)) return { [component]: component };
      throw new Error(name);
    },
  });
  let tree: any;
  await renderer.act(async () => { tree = renderer.create(React.createElement(exports.default)); });
  const input = (i: number) => tree.root.findAllByType('TextInput')[i];
  const save = () => tree.root.findAllByType('Pressable').find((p: any) => p.props.accessibilityLabel === 'Save body measurements').props.onPress();
  return { calls, notices, input, save, deletes, alerts, loads, act: renderer.act,
    inlineAlertTexts: () => tree.root.findAllByProps({ accessibilityRole: 'alert' }).map((n: any) => n.children.join('')),
    allTexts: () => tree.root.findAllByType('ThemedText').map((n: any) => (n.children ?? []).join('')),
    deferNextLoad: () => {
      let resolve!: (entries: any[]) => void;
      nextLoad = new Promise<any[]>((done) => { resolve = done; });
      return resolve;
    },
    snapshot: () => JSON.stringify(tree.toJSON(), (key, value) => key === '_owner' ? undefined : value),
    longPress: () => tree.root.findAllByType('Pressable').find((p: any) => p.props.onLongPress).props.onLongPress(),
    confirm: () => alerts[alerts.length - 1].find((button) => button.style === 'destructive').onPress,
    resolve: () => resolveSave(), reject: () => rejectSave(new Error('offline')),
    changeOwner: async (nextOwner = 'user-b') => { owner = nextOwner; await renderer.act(async () => tree.update(React.createElement(exports.default))); },
    unmount: async () => renderer.act(async () => tree.unmount()),
  };
}

for (const transition of ['owner change', 'unmount', 'owner round trip', 'sign out']) {
  test(`real route ignores delete confirmation after ${transition}`, async () => {
    const h = await routeHost();
    try {
      await h.act(async () => h.longPress());
      const confirm = h.confirm();
      if (transition === 'unmount') await h.unmount();
      else {
        await h.changeOwner(transition === 'sign out' ? '' : 'user-b');
        if (transition === 'owner round trip') await h.changeOwner('user-a');
      }
      const before = h.snapshot();
      const loadCount = h.loads.length;
      await h.act(async () => { void confirm(); });
      assert.equal(h.deletes.length, 0);
      assert.equal(h.loads.length, loadCount);
      assert.equal(h.snapshot(), before);
      assert.deepEqual(h.notices, []);
    } finally { if (transition !== 'unmount') await h.unmount(); }
  });
}

for (const transition of ['owner change', 'unmount']) {
  for (const outcome of ['resolve', 'reject'] as const) {
    test(`real route ignores pending delete ${outcome} after ${transition}`, async () => {
      const h = await routeHost();
      try {
        await h.act(async () => h.longPress());
        await h.act(async () => { void h.confirm()(); });
        assert.equal(h.deletes.length, 1);
        if (transition === 'unmount') await h.unmount();
        else {
          await h.changeOwner();
          await h.act(async () => h.input(0).props.onChangeText('190'));
        }
        const before = h.snapshot();
        const loadCount = h.loads.length;
        await h.act(async () => h.deletes[0][outcome](new Error('old delete failed')));
        assert.equal(h.loads.length, loadCount, 'stale delete must not refresh');
        assert.deepEqual(h.notices, [], 'stale delete must not toast');
        assert.equal(h.snapshot(), before, 'stale delete must not publish state');
      } finally { if (transition !== 'unmount') await h.unmount(); }
    });
  }
}

for (const transition of ['owner change', 'unmount']) {
  test(`real route ignores delete-triggered refresh publication after ${transition}`, async () => {
    const h = await routeHost();
    try {
      await h.act(async () => h.longPress());
      await h.act(async () => { void h.confirm()(); });
      const finishLoad = h.deferNextLoad();
      await h.act(async () => h.deletes[0].resolve());
      assert.equal(h.loads.length, 2);
      if (transition === 'unmount') await h.unmount();
      else await h.changeOwner();
      const before = h.snapshot();
      const loadCount = h.loads.length;
      await h.act(async () => finishLoad([]));
      assert.equal(h.snapshot(), before);
      assert.equal(h.loads.length, loadCount);
      assert.deepEqual(h.notices, []);
    } finally { if (transition !== 'unmount') await h.unmount(); }
  });
}

test('real route preserves cancellation, deduplicates pending deletes and refreshes owned success', async () => {
  const h = await routeHost();
  try {
    await h.act(async () => h.longPress());
    const cancel = h.alerts[0].find((button) => button.style === 'cancel');
    await h.act(async () => cancel.onPress?.());
    assert.equal(h.deletes.length, 0);
    await h.act(async () => h.longPress());
    const confirm = h.confirm();
    await h.act(async () => { void confirm(); void confirm(); });
    assert.equal(h.deletes.length, 1);
    assert.equal(h.deletes[0].id, 'user-a-entry');
    assert.equal(h.loads.length, 1);
    await h.act(async () => h.deletes[0].resolve());
    assert.equal(h.loads.length, 2);
    assert.deepEqual(h.notices, []);
    // The owned failure reports once and releases the guard for a retry.
    await h.act(async () => h.longPress());
    await h.act(async () => { void h.confirm()(); });
    assert.equal(h.deletes.length, 2);
    await h.act(async () => h.deletes[1].reject(new Error('delete offline')));
    assert.deepEqual(h.notices, ['delete offline']);
    assert.equal(h.loads.length, 2);
    await h.act(async () => h.longPress());
    await h.act(async () => { void h.confirm()(); });
    assert.equal(h.deletes.length, 3);
    await h.act(async () => h.deletes[2].resolve());
    assert.equal(h.loads.length, 3);
  } finally { await h.unmount(); }
});

test('real route blocks mixed invalid input and retains every field after failure', async () => {
  const h = await routeHost();
  await h.act(async () => { void h.save(); });
  assert.equal(h.calls.length, 0);
  await h.act(async () => { h.input(0).props.onChangeText('180abc'); h.input(5).props.onChangeText('12.5'); });
  await h.act(async () => { void h.save(); });
  assert.equal(h.calls.length, 0);
  assert.equal(h.input(5).props.value, '12.5');
  const values = ['180.25', '20', '32', '40', '40', '12.5', '22', '15'];
  await h.act(async () => values.forEach((value, index) => h.input(index).props.onChangeText(value)));
  await h.act(async () => { void h.save(); void h.save(); });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].waist_in, 32);
  await h.act(async () => h.reject());
  values.forEach((value, index) => assert.equal(h.input(index).props.value, value));
  assert.equal(h.notices.length, 1);
  for (let i = 0; i < 8; i++) assert.ok(h.input(i).props.accessibilityLabel);
  await h.unmount();
});

test('real route ignores previous-owner and unmounted save completions', async () => {
  const h = await routeHost();
  await h.act(async () => h.input(0).props.onChangeText('180'));
  await h.act(async () => { void h.save(); });
  await h.changeOwner();
  assert.equal(h.input(0).props.value, '');
  await h.act(async () => h.input(0).props.onChangeText('190'));
  await h.act(async () => h.resolve());
  assert.equal(h.input(0).props.value, '190');
  await h.act(async () => { void h.save(); });
  await h.unmount();
  await h.act(async () => h.reject());
  assert.equal(h.notices.length, 0);
});

test('real route sends only supplied metrics and clears form only after success', async () => {
  const h = await routeHost();
  await h.act(async () => h.input(5).props.onChangeText(' 12.5 '));
  await h.act(async () => { void h.save(); });
  assert.equal(JSON.stringify(h.calls[0]), JSON.stringify({ measured_date: '2026-09-21', arm_in: 12.5 }));
  assert.equal(h.input(5).props.value, ' 12.5 ');
  await h.act(async () => h.resolve());
  for (let i = 0; i < 8; i++) assert.equal(h.input(i).props.value, '');
  await h.unmount();
});

// Outside values are just below min / above max (min-0.1 / max+0.1).
for (let idx = 0; idx < BODY_METRIC_FIELDS.length; idx++) {
  const field = BODY_METRIC_FIELDS[idx];
  for (const [label, value] of [['below min', field.min - 0.1], ['above max', field.max + 0.1]] as const) {
    test(`real route blocks ${field.key} ${label}: no request, text kept, inline error shown`, async () => {
      const h = await routeHost();
      const text = String(value);
      await h.act(async () => h.input(idx).props.onChangeText(text));
      await h.act(async () => { void h.save(); });
      assert.equal(h.calls.length, 0);
      assert.equal(h.input(idx).props.value, text);
      const texts = h.inlineAlertTexts();
      assert.ok(texts.some((t: string) => t.includes(field.label)), `expected inline error for ${field.key}, got ${JSON.stringify(texts)}`);
      await h.unmount();
    });
  }

  test(`real route accepts ${field.key} at exact min/max: sends only that field`, async () => {
    for (const boundary of [field.min, field.max]) {
      const h = await routeHost();
      await h.act(async () => h.input(idx).props.onChangeText(String(boundary)));
      await h.act(async () => { void h.save(); });
      assert.equal(h.calls.length, 1);
      assert.equal(JSON.stringify(h.calls[0]), JSON.stringify({ measured_date: '2026-09-21', [field.key]: boundary }));
      await h.unmount();
    }
  });
}

test('real route renders each field\'s supported-range hint and the circumference guidance', async () => {
  const h = await routeHost();
  const texts = h.allTexts();
  for (const f of BODY_METRIC_FIELDS) {
    assert.ok(texts.includes(`Supported: ${f.min}–${f.max} ${f.unit}`), `missing range hint for ${f.key}`);
  }
  assert.ok(texts.some((t: string) => t.includes('wrap the tape around the limb')), 'missing arm/thigh circumference guidance');
  await h.unmount();
});

test('real route clears only the edited field\'s inline error on change, keeps other field errors', async () => {
  const h = await routeHost();
  const weightIdx = BODY_METRIC_FIELDS.findIndex((f) => f.key === 'weight_lbs');
  const neckIdx = BODY_METRIC_FIELDS.findIndex((f) => f.key === 'neck_in');
  await h.act(async () => {
    h.input(weightIdx).props.onChangeText('9999');
    h.input(neckIdx).props.onChangeText('9999');
  });
  await h.act(async () => { void h.save(); });
  assert.equal(h.calls.length, 0);
  let texts = h.inlineAlertTexts();
  assert.ok(texts.some((t: string) => t.includes(BODY_METRIC_FIELDS[weightIdx].label)), 'expected weight error before edit');
  assert.ok(texts.some((t: string) => t.includes(BODY_METRIC_FIELDS[neckIdx].label)), 'expected neck error before edit');
  await h.act(async () => h.input(weightIdx).props.onChangeText('180'));
  texts = h.inlineAlertTexts();
  assert.ok(!texts.some((t: string) => t.includes(BODY_METRIC_FIELDS[weightIdx].label)), 'edited field error should clear');
  assert.ok(texts.some((t: string) => t.includes(BODY_METRIC_FIELDS[neckIdx].label)), 'other field error should remain');
  await h.unmount();
});

test('real route sends nothing when one field is in-range decimal and another is out of range', async () => {
  const h = await routeHost();
  const weightIdx = BODY_METRIC_FIELDS.findIndex((f) => f.key === 'weight_lbs');
  const neckIdx = BODY_METRIC_FIELDS.findIndex((f) => f.key === 'neck_in');
  await h.act(async () => {
    h.input(weightIdx).props.onChangeText('180.25');
    h.input(neckIdx).props.onChangeText('999');
  });
  await h.act(async () => { void h.save(); });
  assert.equal(h.calls.length, 0);
  assert.equal(h.input(weightIdx).props.value, '180.25');
  assert.equal(h.input(neckIdx).props.value, '999');
  await h.unmount();
});
