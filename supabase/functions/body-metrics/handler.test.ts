import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real Edge handler; only runtime bootstrap/auth/database boundary are isolated.
// Captured writes prove the contract, not deployed PostgREST persistence.
function host(options: { unauthorized?: boolean; failWrite?: boolean } = {}) {
  let handler: (request: Request) => Promise<Response>;
  const writes: any[] = [];
  const deletes: any[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: 'fixture-user' } }, error: null }) },
    from(table: string) {
      assert.equal(table, 'body_metrics');
      return { upsert(row: any, upsertOptions: any) {
        writes.push({ row, options: upsertOptions });
        return { select: () => ({ single: async () => ({ data: options.failWrite ? null : row, error: options.failWrite ? new Error('database unavailable') : null }) }) };
      }, delete() {
        const filters: any[] = [];
        deletes.push(filters);
        const query = { eq(key: string, value: string) { filters.push([key, value]); return query; }, then(resolve: any) { return Promise.resolve({ error: null }).then(resolve); } };
        return query;
      } };
    },
  };
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: {}, Request, Response, URL, console,
    Deno: { env: { get: () => 'fixture-not-a-secret' } }, require(name: string) {
      if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name.includes('supabase-js')) return { createClient: () => client };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { writes, deletes, post: (body: any) => handler!(new Request('https://fixture.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ action: 'upsert', measured_date: '2026-09-07', ...body }),
  })) };
}

test('partial same-day write omits blank fields instead of replacing previous measurements', async () => {
  const api = host();
  assert.equal((await api.post({ weight_lbs: 185, waist_in: null })).status, 200);
  assert.equal((await api.post({ weight_lbs: null, waist_in: 34 })).status, 200);
  assert.equal(api.writes[0].row.weight_lbs, 185);
  assert.equal(api.writes[1].row.waist_in, 34);
  assert.equal('weight_lbs' in api.writes[1].row, false);
  assert.equal('notes' in api.writes[1].row, false);
  assert.equal(api.writes[1].row.user_id, 'fixture-user');
});

test('invalid measurement returns a useful 400 without any write', async () => {
  for (const arm_in of [35, 'nonsense', true, [12]]) {
    const api = host();
    const response = await api.post({ arm_in });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /arm_in/);
    assert.equal(api.writes.length, 0);
  }
});

test('empty or null-only measurement submissions are rejected without writing a junk row', async () => {
  for (const body of [{}, { weight_lbs: null, waist_in: ' ' }]) {
    const api = host();
    assert.equal((await api.post(body)).status, 400);
    assert.equal(api.writes.length, 0);
  }
});

const bounds = { weight_lbs: [50, 800], body_fat_pct: [2, 60], waist_in: [15, 80], chest_in: [20, 80], hips_in: [20, 80], arm_in: [5, 30], thigh_in: [10, 50], neck_in: [8, 25] };
test('authoritative handler accepts bounds/trimmed decimals and rejects every invalid field before writing', async () => {
  for (const [key, [lo, hi]] of Object.entries(bounds)) {
    for (const value of [lo, hi, ` ${lo + 0.25} `]) {
      const api = host();
      assert.equal((await api.post({ [key]: value })).status, 200);
      assert.equal(api.writes[0].row[key], Number(value));
    }
    for (const value of [lo - 0.01, hi + 0.01, '12junk', '0x40', '1e2', 'NaN', 'Infinity', true, [], {}]) {
      const api = host();
      assert.equal((await api.post({ weight_lbs: 180, [key]: value })).status, 400, `${key}: ${value}`);
      assert.equal(api.writes.length, 0);
    }
  }
});
test('real dates and collect-all-errors reject rollover without writes', async () => {
  for (const measured_date of ['2026-02-30', '2023-02-29', '2026-04-31', '0000-01-01', ' 2026-01-01 ']) {
    const api = host();
    assert.equal((await api.post({ measured_date, weight_lbs: 180 })).status, 400);
    assert.equal(api.writes.length, 0);
  }
  const api = host();
  const response = await api.post({ measured_date: '2024-02-29', weight_lbs: 180, arm_in: 4, thigh_in: 51 });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.errors.arm_in && body.errors.thigh_in);
});
test('null/blank/omitted metrics stay absent; notes only rejected, explicit empty notes retained alongside metric', async () => {
  const api = host();
  assert.equal((await api.post({ weight_lbs: 180, waist_in: ' \t ', arm_in: null, notes: '' })).status, 200);
  assert.equal('waist_in' in api.writes[0].row, false);
  assert.equal('arm_in' in api.writes[0].row, false);
  assert.equal(api.writes[0].row.notes, '');
  assert.equal((await api.post({ notes: 'only notes' })).status, 400);
  assert.equal(api.writes.length, 1);
});

test('authentication, owner-derived writes, database failures and whole-row delete contract stay intact', async () => {
  const denied = host({ unauthorized: true });
  assert.equal((await denied.post({ weight_lbs: 180 })).status, 401);
  assert.equal(denied.writes.length, 0);
  const api = host();
  assert.equal((await api.post({ user_id: 'attacker', weight_lbs: 180 })).status, 200);
  assert.equal(api.writes[0].row.user_id, 'fixture-user');
  assert.equal(api.writes[0].options.onConflict, 'user_id,measured_date');
  assert.equal((await api.post({ action: 'delete', id: 'row-id', user_id: 'attacker' })).status, 200);
  assert.deepEqual(api.deletes, [[['id', 'row-id'], ['user_id', 'fixture-user']]]);
  const failed = host({ failWrite: true });
  assert.equal((await failed.post({ weight_lbs: 180 })).status, 500);
});

test('client, authoritative handler and actual SQL schema bounds stay in parity', async () => {
  const schema = readFileSync(new URL('../../migrations/0036_progress_tracking.sql', import.meta.url), 'utf8');
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../../lib/bodyMetricValidation.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  for (const field of exports.BODY_METRIC_FIELDS) {
    assert.deepEqual(bounds[field.key as keyof typeof bounds], [field.min, field.max]);
    assert.ok(schema.includes(`${field.key} BETWEEN ${field.min} AND ${field.max}`));
  }
});
