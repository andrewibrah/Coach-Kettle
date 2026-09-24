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

// Two-user isolation. The fake applies ONLY the handler's own filters (no RLS
// emulation), so a missing `.eq('user_id', caller)` would leak B's rows here;
// RLS itself is proven separately in supabase/tests/body_metrics_isolation.sql.
const A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const ENV: Record<string, string> = {
  SUPABASE_URL: 'https://fixture.invalid',
  SUPABASE_ANON_KEY: 'fixture-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role-key',
};
const TRAVERSAL = `${A}/body/../../${B}/body/b.jpg`;

function world() {
  let handler: (request: Request) => Promise<Response>;
  const clients: { key: string; authorization: string | null }[] = [];
  const ops: { client: { key: string; authorization: string | null }; target: string; op: string; filters: [string, unknown][]; path?: string }[] = [];
  const db: Record<string, any[]> = {
    body_metrics: [
      { id: 'metric-a', user_id: A, measured_date: '2026-09-01', weight_lbs: 180 },
      { id: 'metric-b', user_id: B, measured_date: '2026-09-02', weight_lbs: 150 },
    ],
    body_photos: [
      { id: 'photo-a', user_id: A, captured_date: '2026-09-01', storage_path: `${A}/body/1700000000000_aaaaaa.jpg` },
      { id: 'photo-b', user_id: B, captured_date: '2026-09-01', storage_path: `${B}/body/1700000000000_bbbbbb.jpg` },
      { id: 'photo-legacy', user_id: A, captured_date: '2026-09-01', storage_path: TRAVERSAL },
    ],
  };
  const objects = new Set([`${A}/body/1700000000000_aaaaaa.jpg`, `${B}/body/1700000000000_bbbbbb.jpg`, `${B}/body/b.jpg`]);
  let nextId = 0;
  function createClient(_url: string, key: string, options: any = {}) {
    const client = { key, authorization: options?.global?.headers?.Authorization ?? null };
    clients.push(client);
    const match = (table: string, filters: [string, unknown][]) => db[table].filter((row) => filters.every(([k, v]) => row[k] === v));
    return {
      auth: { getUser: async (token: string) => ({ data: { user: token === 'token-A' ? { id: A } : token === 'token-B' ? { id: B } : null }, error: null }) },
      from(table: string) {
        const filters: [string, unknown][] = [];
        const record = (op: string) => { ops.push({ client, target: table, op, filters }); };
        const reader = (op: string, run: () => any) => {
          const q: any = {
            eq(k: string, v: unknown) { filters.push([k, v]); return q; },
            gte() { return q; }, order() { return q; }, limit() { return q; },
            maybeSingle: async () => { record(op); return { data: run()[0] ?? null, error: null }; },
            single: async () => { record(op); const rows = run(); return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: new Error('not single') }; },
            then(resolve: any, reject: any) { record(op); return Promise.resolve({ data: run(), error: null }).then(resolve, reject); },
          };
          return q;
        };
        return {
          select: () => reader('select', () => match(table, filters)),
          upsert(row: any) {
            return { select: () => reader('upsert', () => {
              const existing = db[table].find((r) => r.user_id === row.user_id && r.measured_date === row.measured_date);
              if (existing) { Object.assign(existing, row); return [existing]; }
              const created = { id: `new-${nextId++}`, ...row };
              db[table].push(created);
              return [created];
            }) };
          },
          insert(row: any) {
            return { select: () => reader('insert', () => { const created = { id: `new-${nextId++}`, ...row }; db[table].push(created); return [created]; }) };
          },
          delete: () => reader('delete', () => {
            const doomed = match(table, filters);
            db[table] = db[table].filter((row) => !doomed.includes(row));
            return doomed;
          }),
        };
      },
      storage: { from: (bucket: string) => ({
        createSignedUrl: async (path: string) => { ops.push({ client, target: bucket, op: 'sign', filters: [], path }); return { data: { signedUrl: `signed:${path}` }, error: null }; },
        remove: async (paths: string[]) => {
          for (const path of paths) { ops.push({ client, target: bucket, op: 'remove', filters: [], path }); objects.delete(path); }
          return { data: [], error: null };
        },
      }) },
    };
  }
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: {}, Request, Response, URL, console,
    Deno: { env: { get: (name: string) => ENV[name] } }, require(name: string) {
      if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name.includes('supabase-js')) return { createClient };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const headers = { Authorization: 'Bearer token-A' };
  return {
    db, objects, clients, ops,
    get: async (action: string) => (await handler!(new Request(`https://fixture.invalid/?action=${action}&days=1000`, { headers }))).json(),
    post: (body: any) => handler!(new Request('https://fixture.invalid', { method: 'POST', headers, body: JSON.stringify(body) })),
  };
}

test('isolation: every row and storage operation runs on the caller-scoped anon client, pinned to the verified user', async () => {
  const api = world();
  await api.get('list');
  await api.get('latest');
  await api.get('photos');
  assert.equal((await api.post({ action: 'upsert', measured_date: '2026-09-03', weight_lbs: 181 })).status, 200);
  assert.equal((await api.post({ action: 'delete', id: 'metric-a' })).status, 200);
  assert.equal((await api.post({ action: 'add_photo', storage_path: `${A}/body/1700000000001_cccccc.jpg`, captured_date: '2026-09-03' })).status, 200);
  assert.equal((await api.post({ action: 'delete_photo', id: 'photo-a' })).status, 200);
  assert.ok(api.clients.length > 0);
  for (const client of api.clients) assert.deepEqual(client, { key: ENV.SUPABASE_ANON_KEY, authorization: 'Bearer token-A' });
  const tableOps = api.ops.filter((op) => op.target !== 'workout-media');
  assert.deepEqual([...new Set(tableOps.map((op) => `${op.target}:${op.op}`))].sort(),
    ['body_metrics:delete', 'body_metrics:select', 'body_metrics:upsert', 'body_photos:delete', 'body_photos:insert', 'body_photos:select']);
  for (const op of tableOps) {
    if (op.op === 'upsert' || op.op === 'insert') continue; // owner comes from the written row, asserted below
    assert.ok(op.filters.some(([k, v]) => k === 'user_id' && v === A), `${op.target}:${op.op} not pinned to caller`);
  }
  assert.ok(api.db.body_metrics.some((row) => row.measured_date === '2026-09-03' && row.user_id === A));
  assert.ok(api.db.body_photos.some((row) => row.storage_path === `${A}/body/1700000000001_cccccc.jpg` && row.user_id === A));
  assert.deepEqual(api.ops.filter((op) => op.target === 'workout-media').map((op) => op.op).sort(), ['remove', 'sign']);
});

test('isolation: user A cannot read, update or delete user B rows; A still manages its own', async () => {
  const api = world();
  assert.deepEqual((await api.get('list')).entries.map((row: any) => row.id), ['metric-a']);
  assert.equal((await api.get('latest')).entry.id, 'metric-a');
  assert.deepEqual((await api.get('photos')).photos.map((row: any) => row.user_id), [A, A]);
  // Same date as B's row plus a spoofed owner: must land on A's own row, B untouched.
  assert.equal((await api.post({ action: 'upsert', measured_date: '2026-09-02', weight_lbs: 800, user_id: B })).status, 200);
  assert.deepEqual(api.db.body_metrics.find((row) => row.id === 'metric-b'), { id: 'metric-b', user_id: B, measured_date: '2026-09-02', weight_lbs: 150 });
  assert.ok(api.db.body_metrics.some((row) => row.user_id === A && row.measured_date === '2026-09-02' && row.weight_lbs === 800));
  assert.equal((await api.post({ action: 'delete', id: 'metric-b', user_id: B })).status, 200);
  assert.ok(api.db.body_metrics.some((row) => row.id === 'metric-b'), 'B row deleted by A');
  assert.equal((await api.post({ action: 'delete_photo', id: 'photo-b' })).status, 404);
  assert.ok(api.db.body_photos.some((row) => row.id === 'photo-b'), 'B photo row deleted by A');
  assert.ok(api.objects.has(`${B}/body/1700000000000_bbbbbb.jpg`), 'B object removed by A');
  // Positive controls.
  assert.equal((await api.post({ action: 'delete', id: 'metric-a' })).status, 200);
  assert.equal(api.db.body_metrics.some((row) => row.id === 'metric-a'), false);
  assert.equal((await api.post({ action: 'delete_photo', id: 'photo-a' })).status, 200);
  assert.equal(api.objects.has(`${A}/body/1700000000000_aaaaaa.jpg`), false);
});

test('isolation: foreign or traversal photo paths are never recorded, signed or removed', async () => {
  const api = world();
  for (const storage_path of [`${B}/body/x.jpg`, TRAVERSAL, `${A}/../${B}/x.jpg`, `${A}/body/..`, `${A}/body/.`, `${A}/body/`,
    `${A}/body/x/../y.jpg`, `${A}/body/a\\..\\b.jpg`, `${A}/body/%2e%2e/x.jpg`, `${A}/bodyx.jpg`, `/${A}/body/x.jpg`]) {
    const response = await api.post({ action: 'add_photo', storage_path, captured_date: '2026-09-03' });
    assert.equal(response.status, 400, storage_path);
  }
  assert.equal(api.ops.some((op) => op.op === 'insert'), false);
  assert.equal((await api.post({ action: 'add_photo', storage_path: `${A}/body/1700000000002_dd-EE.jpg`, captured_date: '2026-09-03' })).status, 200);
  // A legacy row that predates the strict check must not be signed or used to remove B's object.
  const legacy = (await api.get('photos')).photos.find((row: any) => row.id === 'photo-legacy');
  assert.equal(legacy.signed_url, null);
  assert.equal((await api.post({ action: 'delete_photo', id: 'photo-legacy' })).status, 200);
  assert.equal(api.db.body_photos.some((row) => row.id === 'photo-legacy'), false);
  assert.equal(api.ops.some((op) => op.path === TRAVERSAL), false, 'traversal path reached storage');
  assert.ok(api.objects.has(`${B}/body/b.jpg`));
});
