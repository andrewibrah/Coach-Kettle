import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Executes the real handler; only Deno bootstrap, auth and DB transport are mocked.
// This is not Deno/PostgREST or transactional database proof.
const user = '11111111-1111-4111-8111-111111111111';
const stamp = '2026-09-15T12:00:00+00:00';
const payload = () => ({ action: 'save_set', source: 'manual', targets: { base: { calories: 2500.125 } }, provenance: { user_confirmed: true, edited_after_suggestion: false } });
const setId = '22222222-2222-4222-8222-222222222222';
// Exact columns from to_jsonb(saved) plus the RPC's projected child fields.
const snapshot = () => ({ saved_target_set_id: setId, user_id: user, source: 'manual', updated_at: stamp, targets: { id: setId, user_id: user, source: 'manual', updated_at: stamp, created_at: stamp, base_target: { calories: 2500.125 }, training_day_target: null, rest_day_target: null, day_overrides: [], provenance: payload().provenance, suggestion_id: null, macro_preference: null, explanation: null, derivation_inputs_snapshot: null, stale_after: null } });
function host(options: any = {}) {
  let handler: (req: Request) => Promise<Response>;
  const calls: any[] = [], direct: any[] = [], tokens: string[] = [], logs: any[] = [];
  const client = {
    auth: { getUser: async (token: string) => { tokens.push(token); return { data: { user: options.unauthorized ? null : { id: user } }, error: options.unauthorized ? { message: 'private auth' } : null }; } },
    rpc: async (name: string, args: any) => { calls.push({ name, args: JSON.parse(JSON.stringify(args)) }); if (options.rpcThrows) throw new Error('private provider'); return options.rpcResult ?? { data: name === 'read_nutrition_target_set' ? options.parentRow ?? snapshot().targets : snapshot(), error: options.childError ?? null }; },
    from(table: string) {
      direct.push({ table });
      let operation = 'select', row: any;
      const result = () => ({ data: table === 'nutrition_target_day_overrides' ? options.interleavedChildren ?? [] : options.parentRow ?? row ?? snapshot().targets, error: table === 'nutrition_target_day_overrides' ? options.childError ?? null : null });
      const chain: any = {
        select: () => chain, eq: () => chain,
        upsert: (value: any) => { operation = 'upsert'; row = { id: 'set-id', ...value }; direct.push({ operation, row }); return chain; },
        delete: () => { operation = 'delete'; direct.push({ operation }); return chain; },
        insert: (value: any) => { operation = 'insert'; direct.push({ operation, row: value }); return chain; },
        single: async () => result(), maybeSingle: async () => result(),
        then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
      };
      return chain;
    },
  };
  const code = ts.transpileModule(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: {}, Request, Response, URL, crypto, console: { error: (...args: any[]) => logs.push(args) }, Deno: { env: { get: () => 'fixture' } }, require(name: string) {
    if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
    if (name.includes('supabase-js')) return { createClient: () => client };
    if (name.includes('nutritionTargetLoading')) {
      const exports: any = {};
      vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../_shared/nutritionTargetLoading.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
      return exports;
    }
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { calls, direct, tokens, logs, request: (body: any = payload(), method = 'POST', auth: string | null = 'Bearer fixture', query = '') => handler!(new Request(`https://fixture.invalid/${query}`, { method, headers: auth === null ? {} : { Authorization: auth }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) })) };
}

test('child failure cannot produce old partial-write success', async () => {
  const api = host({ childError: { message: 'private child failure' }, rpcResult: { data: null, error: { code: 'XX000', message: 'private child failure' } } });
  const response = await api.request();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error' });
  assert.equal(api.direct.length, 0);
});

test('malformed overrides are rejected whole, not filtered after parent write', async () => {
  const api = host();
  const body: any = payload();
  body.targets.day_overrides = [{ day_of_week: 8, target: { calories: 1000 } }];
  assert.equal((await api.request(body)).status, 400);
  assert.equal(api.calls.length, 0);
  assert.equal(api.direct.length, 0);
});

test('malformed RPC receipts never report success', async () => {
  const bad: any[] = [null, {}, [], 'ok', { ...snapshot(), targets: null }, { ...snapshot(), user_id: 'other' }, { ...snapshot(), updated_at: null }, { ...snapshot(), saved_target_set_id: '' }];
  for (const change of [{ id: 'wrong' }, { user_id: 'other' }, { source: 'local_draft' }, { updated_at: 'wrong' }, { day_overrides: null }, { base_target: {} }]) bad.push({ ...snapshot(), targets: { ...snapshot().targets, ...change } });
  for (const data of bad) {
    const api = host({ rpcResult: { data, error: null } });
    assert.equal((await api.request()).status, 500, JSON.stringify(data));
    assert.equal(api.direct.length, 0);
  }
});

for (const [name, mutate] of [
  ['missing created_at', (r: any) => { delete r.targets.created_at; }],
  ['unconfirmed provenance', (r: any) => { r.targets.provenance.user_confirmed = false; }],
  ['numeric explanation', (r: any) => { r.targets.explanation = 7; }],
  ['invalid child timestamp', (r: any) => { r.targets.day_overrides = [{ day_of_week: 0, target: { calories: 1800 }, source: 'manual', updated_at: 'not-a-date' }]; }],
] as const) {
  test(`committed receipt rejects ${name}`, async () => {
    const receipt = snapshot();
    mutate(receipt);
    const api = host({ rpcResult: { data: receipt, error: null } });
    const response = await api.request();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
    assert.equal(api.calls.length, 1);
    assert.equal(api.direct.length, 0);
    assert.deepEqual(api.logs, []);
  });
}

test('receipt matrix validates every committed column without coercion or repair', async () => {
  const cases: any[] = [];
  const mutate = (fn: (r: any) => void) => { const r: any = snapshot(); fn(r); cases.push(r); };
  for (const key of Object.keys(snapshot())) mutate(r => { delete r[key]; });
  for (const key of Object.keys(snapshot().targets)) mutate(r => { delete r.targets[key]; });
  mutate(r => { r.saved_target_set_id = r.targets.id = 'not-a-uuid'; });
  mutate(r => { r.user_id = r.targets.user_id = '33333333-3333-4333-8333-333333333333'; });
  mutate(r => { r.source = r.targets.source = 'local_draft'; });
  for (const value of [null, 7, '', 'not-a-date', '7', '2026-09-15']) {
    mutate(r => { r.updated_at = r.targets.updated_at = value; });
    mutate(r => { r.targets.created_at = value; });
  }
  for (const value of [7, false, {}, []]) {
    mutate(r => { r.targets.macro_preference = value; });
    mutate(r => { r.targets.suggestion_id = value; });
  }
  for (const value of ['', '   ']) mutate(r => { r.targets.suggestion_id = value; });
  for (const value of [null, [], {}, { user_confirmed: false, edited_after_suggestion: false }, { user_confirmed: true }, { user_confirmed: true, edited_after_suggestion: 'false' }, { user_confirmed: true, edited_after_suggestion: false, imported_from_existing: null }, { user_confirmed: true, edited_after_suggestion: false, extra: true }]) mutate(r => { r.targets.provenance = value; });
  mutate(r => { r.source = r.targets.source = 'imported_existing'; });
  mutate(r => { r.source = r.targets.source = 'backend_suggested'; r.targets.stale_after = stamp; r.targets.provenance.edited_after_suggestion = true; });
  for (const value of [null, 7, 'not-a-date']) mutate(r => { r.source = r.targets.source = 'backend_suggested'; r.targets.stale_after = value; });
  mutate(r => { r.targets.stale_after = stamp; });
  const explanation = { summary: '', assumptions: [], missing_inputs: [], calculation_basis: '' };
  for (const value of [7, [], {}, { ...explanation, summary: 7 }, { ...explanation, assumptions: [7] }, { ...explanation, missing_inputs: null }, { ...explanation, safety_notes: 'bad' }, { ...explanation, extra: true }]) mutate(r => { r.targets.explanation = value; });
  for (const value of [7, [], { weight_kg: 80 }, { age_range: 7 }, { height_cm_present: 'true' }, { weight_kg_present: null }, { training_days_per_week: '3' }, { user_entered_calorie_target: Infinity }]) mutate(r => { r.targets.derivation_inputs_snapshot = value; });
  for (const key of ['base_target', 'training_day_target', 'rest_day_target']) {
    for (const value of [[], {}, { calories: '2000' }, { calories: 0 }, { calories: Infinity }, { calories: 2000, protein_g: null }, { calories: 2000, carbs_g: -1 }, { calories: 2000, fat_g: false }, { calories: 2000, extra: 1 }]) mutate(r => { r.targets[key] = value; });
  }
  mutate(r => { r.targets.base_target = null; });
  const child = { day_of_week: 0, target: { calories: 1800 }, source: 'manual', updated_at: stamp };
  for (const key of Object.keys(child)) mutate(r => { const o: any = { ...child }; delete o[key]; r.targets.day_overrides = [o]; });
  for (const change of [{ day_of_week: '0' }, { day_of_week: -1 }, { day_of_week: 7 }, { day_of_week: 0.5 }, { target: null }, { source: 'unknown' }, { updated_at: null }, { updated_at: 7 }]) mutate(r => { r.targets.day_overrides = [{ ...child, ...change }]; });
  mutate(r => { r.targets.day_overrides = [child, child]; });
  mutate(r => { r.targets.day_overrides = Array.from({ length: 8 }, (_, day_of_week) => ({ ...child, day_of_week })); });
  for (const receipt of cases) {
    const before = JSON.stringify(receipt);
    const api = host({ rpcResult: { data: receipt, error: null } });
    const response = await api.request();
    assert.equal(response.status, 500, before);
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
    assert.equal(JSON.stringify(receipt), before);
    assert.equal(api.calls.length, 1);
    assert.equal(api.direct.length, 0);
    assert.deepEqual(api.logs, []);
  }
});

test('SQL-shaped receipts preserve explicit nulls, metadata and historical children byte-for-byte', async () => {
  for (const source of ['manual', 'backend_suggested', 'imported_existing']) {
    for (const parent of ['base_target', 'training_day_target', 'rest_day_target']) {
      for (const metadata of [false, true]) {
        const receipt: any = snapshot();
        receipt.source = receipt.targets.source = source;
        receipt.targets.base_target = null;
        receipt.targets[parent] = { calories: 2500.125, protein_g: 0.125 };
        if (source === 'backend_suggested') receipt.targets.stale_after = '2026-11-14T12:00:00.123456+00:00';
        if (source === 'imported_existing') receipt.targets.provenance.imported_from_existing = true;
        if (metadata) {
          receipt.targets.macro_preference = 'future-custom-string';
          receipt.targets.suggestion_id = 'suggestion-not-a-uuid';
          receipt.targets.explanation = { summary: '', assumptions: ['estimate'], missing_inputs: [], calculation_basis: '' };
          receipt.targets.derivation_inputs_snapshot = { age_range: '', sex: 'other', height_cm_present: false, weight_kg_present: true, activity_level: 'custom', goal_type: 'custom', training_days_per_week: 2.5, user_entered_calorie_target: 0, macro_preference: '' };
        }
        receipt.targets.day_overrides = [{ day_of_week: 6, target: { calories: 1800.125 }, source: 'local_draft', updated_at: '2025-01-01T00:00:00.123456+00:00' }];
        const before = JSON.stringify(receipt);
        const api = host({ rpcResult: { data: receipt, error: null } });
        const response = await api.request();
        assert.equal(response.status, 200);
        assert.equal(await response.text(), before);
        assert.equal(JSON.stringify(receipt), before);
        assert.equal(api.calls.length, 1);
        assert.equal(api.direct.length, 0);
      }
    }
  }
});

for (const target of [{ calories: 1800, protein_g: 0 }, { calories: 0 }]) {
  test(`omitted overrides preserve historical zero target ${JSON.stringify(target)} unchanged`, async () => {
    for (const source of ['manual', 'backend_suggested', 'imported_existing', 'local_draft']) {
      const receipt: any = snapshot();
      receipt.targets.day_overrides = [{ day_of_week: 1, target, source, updated_at: '2025-01-01T00:00:00+00:00' }];
      const before = JSON.stringify(receipt);
      const api = host({ rpcResult: { data: receipt, error: null } });
      const response = await api.request();
      assert.equal(response.status, 200);
      assert.equal(await response.text(), before);
      assert.equal(JSON.stringify(receipt), before);
      assert.equal('day_overrides' in api.calls[0].args.p_payload.targets, false);
      assert.equal(api.calls.length, 1);
      assert.equal(api.direct.length, 0);
      assert.deepEqual(api.logs, []);
    }
  });

  test(`explicit overrides cannot submit or receive historical zero target ${JSON.stringify(target)}`, async () => {
    const body: any = payload();
    body.targets.day_overrides = [{ day_of_week: 1, target }];
    const invalid = host();
    assert.equal((await invalid.request(body)).status, 400);
    assert.equal(invalid.calls.length, 0);
    for (const overrides of [[], [{ day_of_week: 1, target: { calories: 1800 } }]]) {
      body.targets.day_overrides = overrides;
      const receipt: any = snapshot();
      receipt.targets.day_overrides = [{ day_of_week: 1, target, source: 'manual', updated_at: stamp }];
      const api = host({ rpcResult: { data: receipt, error: null } });
      const response = await api.request(body);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'Internal server error' });
      assert.equal(api.calls.length, 1);
      assert.equal(api.direct.length, 0);
      assert.deepEqual(api.logs, []);
    }
  });
}

test('preserved historical children still reject malformed shapes and numeric types safely', async () => {
  for (const target of [null, [], {}, { protein_g: 0 }, { calories: '0' }, { calories: false }, { calories: null }, { calories: Infinity }, { calories: NaN }, { calories: -1 }, { calories: 1800, protein_g: '0' }, { calories: 1800, protein_g: null }, { calories: 0, extra: 0 }]) {
    const receipt: any = snapshot();
    receipt.targets.day_overrides = [{ day_of_week: 1, target, source: 'local_draft', updated_at: stamp }];
    const api = host({ rpcResult: { data: receipt, error: null } });
    const response = await api.request();
    assert.equal(response.status, 500, JSON.stringify(target));
    assert.deepEqual(await response.json(), { error: 'Internal server error' });
    assert.equal(api.calls.length, 1);
    assert.equal(api.direct.length, 0);
    assert.deepEqual(api.logs, []);
  }
});

test('legacy get_set keeps nullable provenance without fabricating confirmation', async () => {
  const row = { ...snapshot().targets, provenance: null, source: 'local_draft' };
  const api = host({ parentRow: row });
  const response = await api.request(null, 'GET', 'Bearer fixture', '?action=get_set');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { has_saved_targets: true, updated_at: stamp, target_set: row });
  assert.deepEqual(api.calls, [{ name: 'read_nutrition_target_set', args: { p_user_id: user } }]);
  assert.deepEqual(api.direct, []);
});

test('get_set cannot mix A parent with children committed by B on same id', async () => {
  const child = { id: 'a-child', target_set_id: setId, user_id: user, day_of_week: 2, target: { calories: 2100 }, source: 'manual', updated_at: stamp };
  const row = { ...snapshot().targets, base_target: { calories: 2100 }, day_overrides: [child] };
  const api = host({ parentRow: row, interleavedChildren: [{ ...child, id: 'b-child', target: { calories: 2500 }, updated_at: '2026-09-16T12:00:00Z' }] });
  const response = await api.request(null, 'GET', 'Bearer fixture', '?action=get_set&user_id=spoof');
  assert.equal(response.status, 200);
  const { id, target_set_id, user_id, ...projected } = child;
  assert.deepEqual(await response.json(), { has_saved_targets: true, updated_at: stamp, target_set: { ...row, day_overrides: [projected] } });
  assert.deepEqual(api.calls, [{ name: 'read_nutrition_target_set', args: { p_user_id: user } }]);
  assert.equal(api.direct.length, 0);
});

test('get_set empty is not a transport or ownership error', async () => {
  const empty = host({ rpcResult: { data: null, error: null } });
  assert.deepEqual(await (await empty.request(null, 'GET', 'Bearer fixture', '?action=get_set')).json(), { has_saved_targets: false });
  for (const data of [{}, { ...snapshot().targets, user_id: 'other' }, { ...snapshot().targets, day_overrides: null }]) {
    const api = host({ rpcResult: { data, error: null } });
    assert.equal((await api.request(null, 'GET', 'Bearer fixture', '?action=get_set')).status, 500);
  }
});

test('get_set fails instead of disguising child query failure as empty overrides', async () => {
  const api = host({ childError: { message: 'private child query' } });
  const response = await api.request(null, 'GET', 'Bearer fixture', '?action=get_set');
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Internal server error' });
  assert.deepEqual(api.logs, []);
});

test('strict invalid request matrix has zero RPC and zero direct DML', async () => {
  const cases: any[] = [null, [], {}, 'not-json'];
  const mutate = (fn: (b: any) => void) => { const b: any = payload(); fn(b); cases.push(b); };
  for (const source of [null, 'local_draft', 'bogus', 1, true, ['manual']]) mutate(b => { b.source = source; });
  mutate(b => { delete b.source; });
  for (const provenance of [null, [], {}, { user_confirmed: true }, { user_confirmed: 'true', edited_after_suggestion: false }, { user_confirmed: false, edited_after_suggestion: false }, { user_confirmed: true, edited_after_suggestion: 'false' }, { user_confirmed: true, edited_after_suggestion: false, imported_from_existing: null }, { user_confirmed: true, edited_after_suggestion: false, secret: true }]) mutate(b => { b.provenance = provenance; });
  mutate(b => { b.source = 'backend_suggested'; b.provenance.edited_after_suggestion = true; });
  mutate(b => { b.source = 'imported_existing'; });
  for (const targets of [null, [], {}, { day_overrides: [] }, { unknown: {} }, { base: null }, { base: [] }]) mutate(b => { b.targets = targets; });
  for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g']) {
    for (const value of [null, '2000', true, [], {}, 0, -1]) mutate(b => { b.targets.base[key] = value; });
  }
  mutate(b => { delete b.targets.base.calories; });
  mutate(b => { b.targets.base.extra = 1; });
  mutate(b => { b.targets.rest_day = { calories: '1000' }; });
  for (const overrides of [null, {}, 'bad', [null], [{}], Array.from({ length: 8 }, (_, i) => ({ day_of_week: i, target: { calories: 1 } })), [{ day_of_week: 1, target: { calories: 1 } }, { day_of_week: 1, target: { calories: 2 } }]]) mutate(b => { b.targets.day_overrides = overrides; });
  for (const day of ['1', true, null, -1, 7, 1.5]) mutate(b => { b.targets.day_overrides = [{ day_of_week: day, target: { calories: 1 } }]; });
  for (const change of [{ source: 'local_draft' }, { source: 'invalid' }, { source: null }, { updated_at: null }, { target: { calories: 1, protein_g: 0 } }, { extra: true }]) mutate(b => { b.targets.day_overrides = [{ day_of_week: 0, target: { calories: 1 }, ...change }]; });
  for (const suggestion_id of [null, '', '   ', 1]) mutate(b => { b.suggestion_id = suggestion_id; });
  for (const macro_preference of [null, 1, {}]) mutate(b => { b.macro_preference = macro_preference; });
  for (const derivation_inputs of [null, [], { weight_kg: 80 }, { height_cm_present: 'true' }, { weight_kg_present: 1 }, { training_days_per_week: '3' }, { user_entered_calorie_target: null }, { age_range: 30 }]) mutate(b => { b.derivation_inputs = derivation_inputs; });
  const explanation = { summary: '', assumptions: [], missing_inputs: [], calculation_basis: '' };
  for (const e of [null, [], {}, { ...explanation, summary: 3 }, { ...explanation, assumptions: [1] }, { ...explanation, missing_inputs: null }, { ...explanation, safety_notes: 'bad' }, { ...explanation, extra: true }]) mutate(b => { b.explanation = e; });
  for (const key of ['user_id', 'p_user_id', 'target_set_id', 'extra']) mutate(b => { b[key] = 'spoofed'; });
  // Raw JSON exercises numeric overflow, which JSON.stringify(Infinity) would mask as null.
  cases.push(JSON.stringify(payload()).replace('2500.125', '1e400'));
  for (const body of cases) {
    const api = host();
    assert.equal((await api.request(body)).status, 400, JSON.stringify(body));
    assert.equal(api.calls.length, 0);
    assert.equal(api.direct.length, 0);
    assert.deepEqual(api.logs, []);
  }
});

test('one RPC uses verified identity and preserves omitted, empty and populated overrides exactly', async () => {
  for (const overrides of [undefined, [], [{ day_of_week: 0, target: { calories: 123456.789, protein_g: 0.125 }, source: 'manual', updated_at: 'client metadata' }], Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, target: { calories: 1 } }))]) {
    const body: any = payload();
    body.targets.base = { calories: 999999.875, protein_g: 0.001, carbs_g: 2222.125, fat_g: 1234.875 };
    if (overrides !== undefined) body.targets.day_overrides = overrides;
    const receipt: any = snapshot();
    receipt.targets.base_target = { calories: 3000.375 }; // Must return DB snapshot, not rebuild from request.
    receipt.targets.day_overrides = [{ day_of_week: 6, target: { calories: 1800 }, source: 'local_draft', updated_at: stamp }];
    const api = host({ rpcResult: { data: receipt, error: null } });
    const response = await api.request(body);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), receipt);
    assert.deepEqual(api.tokens, ['fixture']);
    assert.deepEqual(api.calls, [{ name: 'save_nutrition_target_set_atomic', args: { p_user_id: user, p_payload: body } }]);
    assert.equal(api.direct.length, 0);
  }
});

test('SQL validation and unexpected RPC errors are safe and never logged', async () => {
  for (const [code, status] of [['22023', 400], ['23505', 500], ['42501', 500], ['XX000', 500]]) {
    const api = host({ rpcResult: { data: snapshot(), error: { code, message: 'private provider payload token' } } });
    const res = await api.request();
    assert.equal(res.status, status);
    assert.deepEqual(await res.json(), { error: status === 400 ? 'Invalid target set' : 'Internal server error' });
    assert.equal(api.calls.length, 1);
    assert.equal(api.direct.length, 0);
    assert.deepEqual(api.logs, []);
  }
  const api = host({ rpcThrows: true });
  assert.equal((await api.request()).status, 500);
  assert.deepEqual(api.logs, []);
});

test('authentication rejects missing and unverified bearer before writes', async () => {
  for (const auth of [null, 'Bearer forged']) {
    const api = host({ unauthorized: true });
    assert.equal((await api.request(payload(), 'POST', auth)).status, 401);
    assert.equal(api.calls.length, 0);
    assert.equal(api.direct.length, 0);
    assert.deepEqual(api.tokens, auth === null ? [] : ['forged']);
  }
});

test('actual client builders remain accepted including JSON-omitted optional fields', async () => {
  const source = readFileSync(new URL('../../../lib/nutritionTargetStorage.ts', import.meta.url), 'utf8');
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  const requests = [exports.buildManualSaveRequest({ calories: 2000.5 }, undefined), exports.buildManualSaveRequest({ calories: 2000 }, { calories: 1800 }, { suggestionId: 'sug', editedAfterSuggestion: false }), exports.buildManualSaveRequest(undefined, { calories: 1800 }, { suggestionId: 'sug', editedAfterSuggestion: true }), exports.buildImportSaveRequest({ training_calories: 2400 })];
  for (const req of requests) {
    const api = host();
    const body = JSON.parse(JSON.stringify({ action: 'save_set', ...req }));
    assert.equal((await api.request(body)).status, 200);
    assert.deepEqual(api.calls[0].args.p_payload, body);
  }
});

test('valid metadata types are retained, not narrowed beyond SQL contract', async () => {
  const body: any = payload();
  body.suggestion_id = 'suggestion'; body.macro_preference = 'future-custom-string';
  body.derivation_inputs = { age_range: '', sex: 'other', height_cm_present: false, weight_kg_present: true, activity_level: 'custom', goal_type: 'custom', training_days_per_week: 2.5, user_entered_calorie_target: 0, macro_preference: '' };
  body.explanation = { summary: '', assumptions: ['estimate'], missing_inputs: [], calculation_basis: '', safety_notes: [] };
  const api = host();
  assert.equal((await api.request(body)).status, 200);
  assert.deepEqual(api.calls[0].args.p_payload, body);
});

test('legacy save/override/get, suggestion and preflight retain their envelopes', async () => {
  for (const action of ['save', 'override']) {
    const api = host();
    const res = await api.request({ action, training_calories: '2000.6', rest_calories: -1 });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.targets.training_calories, 2001);
    assert.equal(data.targets.user_id, user);
    assert.equal('rest_calories' in data.targets, false);
    assert.equal(api.calls.length, 0);
    assert.equal(api.direct[0].table, 'nutrition_targets');
  }
  const api = host();
  assert.deepEqual(await (await api.request(null, 'GET')).json(), { targets: snapshot().targets });
  const suggestion = await (await api.request({ action: 'suggest', user_entered_calorie_target: 2000 })).json();
  assert.equal(suggestion.source, 'backend_suggested');
  assert.equal(suggestion.targets.base.calories, 2000);
  assert.equal(api.calls.length, 0);
  const preflight = host();
  assert.equal((await preflight.request(null, 'OPTIONS', null)).status, 200);
  assert.equal(preflight.tokens.length, 0);
});
