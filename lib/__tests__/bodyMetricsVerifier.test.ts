// Local HTTP fixtures test the runner only; NOT actual Edge/PostgREST/R4 proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
// @ts-ignore Standalone Node executable intentionally has no app declarations.
import { loadConfig, runVerification } from '../../scripts/verify-body-metrics-persistence.mjs';

const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
const dates = [0, 1, 2].map(n => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10));
const jwt = (id: string, role = 'authenticated') => `e30.${Buffer.from(JSON.stringify({ sub: id, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture-not-signed`;
function setup(base: string) {
  return { CK_BM_CONFIRM: 'YES', CK_BM_ENVIRONMENT: 'disposable-local', CK_BM_URL: base,
    CK_BM_TOKEN_A: jwt(ids[0]), CK_BM_TOKEN_B: jwt(ids[1]), CK_BM_USER_A: ids[0], CK_BM_USER_B: ids[1], CK_BM_DATES: dates.join(',') };
}

// Explicitly MOCKED persistence. Never use this server as evidence of PostgREST behavior.
async function fixture(mode = '') {
  const rows: any[] = mode === 'preexisting' ? [{ id: randomUUID(), user_id: ids[0], measured_date: new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10), weight_lbs: 175, notes: 'must survive', updated_at: 'untouched' }] : [];
  const requests: { path: string; body: any; user: string }[] = [];
  let tick = 0;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://fixture');
    // JWT generation must not depend on crossing a wall-clock second mid-run.
    const user = JSON.parse(Buffer.from(req.headers.authorization!.split('.')[1], 'base64url').toString()).sub;
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ path: url.pathname, body, user });
    res.setHeader('content-type', 'application/json');
    const send = (data: any, status = 200) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (url.pathname === '/auth/v1/user') {
      if (mode === 'auth-rejects') return send({ error: 'unauthorized' }, 401);
      return send({ id: mode === 'wrong-user' ? ids[1] : user });
    }
    if (url.pathname === '/rest/v1/body_metrics') {
      let result = rows.filter(r => r.user_id === user);
      const date = url.searchParams.get('measured_date');
      if (date?.startsWith('eq.')) result = result.filter(r => r.measured_date === date.slice(3));
      if (date?.startsWith('gte.')) result = result.filter(r => r.measured_date >= date.slice(4));
      if (mode === 'short-list' && date?.startsWith('gte.')) result = [{ id: randomUUID(), user_id: user, measured_date: new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10) }];
      if (mode === 'rest-mismatch' && result.length) result = [];
      if (mode === 'rest-occupied') result = [{ id: randomUUID(), user_id: user, measured_date: dates[0] }];
      assert.ok(['2', '1000'].includes(url.searchParams.get('limit')!));
      if (mode !== 'rest-no-count') res.setHeader('content-range', `0-${Math.max(0, result.length - 1)}/${result.length + (mode === 'rest-truncated' ? 1 : 0)}`);
      return send(result);
    }
    if (req.method === 'GET') {
      assert.equal(url.searchParams.get('days'), '1000');
      if (mode === 'truncated') return send({ entries: Array.from({ length: 1000 }, (_, i) => ({ id: `preexisting-${i}`, user_id: user, measured_date: '2099-01-01' })) });
      if (mode === 'occupied') return send({ entries: [{ id: randomUUID(), user_id: user, measured_date: dates[0] }] });
      if (mode === 'leaked-list') return send({ entries: [{ id: randomUUID(), user_id: ids[1], measured_date: '2099-01-01' }] });
      return send({ entries: rows.filter(r => r.user_id === user) });
    }
    if (body.action === 'delete') {
      // 'foreign-delete-succeeds' simulates a bug where delete ignores ownership.
      const index = rows.findIndex(r => r.id === body.id && (mode === 'foreign-delete-succeeds' || r.user_id === user));
      if (index >= 0 && mode !== 'cleanup-noop') rows.splice(index, 1);
      return send({ ok: true });
    }
    const fields = ['weight_lbs', 'waist_in', 'chest_in', 'hips_in', 'arm_in'];
    const provided = fields.filter(k => body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== '');
    if (!provided.length || provided.some(k => typeof body[k] !== 'number' || body[k] < 15 || body[k] > 800)) {
      if (mode === 'invalid-mutates' && rows[0]) rows[0].updated_at = 'changed-on-400';
      return send({ error: 'fixture validation' }, 400);
    }
    // 'spoof-honors-body-user' simulates a bug where the server trusts the body's
    // user_id over the authenticated bearer identity.
    const owner = mode === 'spoof-honors-body-user' && body.user_id ? body.user_id : user;
    // 'concurrent-split-ids' simulates a non-atomic upsert on the concurrency-test
    // date: every write there creates a brand-new row instead of finding the existing one.
    let row = mode === 'concurrent-split-ids' && body.measured_date === dates[2]
      ? undefined
      : rows.find(r => r.user_id === owner && r.measured_date === body.measured_date);
    if (!row) {
      row = { id: randomUUID(), user_id: owner, measured_date: body.measured_date, weight_lbs: null, waist_in: null, chest_in: null, body_fat_pct: null, hips_in: null, arm_in: null, thigh_in: null, neck_in: null, notes: null, created_at: 'fixture-created' };
      rows.push(row);
    }
    if (mode === 'replace-not-merge') { row.weight_lbs = null; row.waist_in = null; }
    // 'blank-write-new-id' simulates a bug where a blank/null-preserving write (here,
    // specifically the chest_in=41 write) replaces the row with a new ID instead of
    // updating it in place.
    if (mode === 'blank-write-new-id' && rows.includes(row) && body.chest_in === 41) {
      // Keep every existing value (so any other invariant still holds) but swap the ID,
      // isolating the one thing M7 must catch: a same-content row under a new ID.
      const old = row;
      rows.splice(rows.indexOf(row), 1);
      row = { ...old, id: randomUUID() };
      rows.push(row);
    }
    for (const field of provided) row[field] = body[field];
    row.updated_at = row.measured_at = `fixture-tick-${++tick}`;
    if ((mode === 'lost-response' && tick === 1) || (mode === 'lost-update' && tick === 2) || (mode === 'lost-concurrent' && tick === 5)) { req.socket.destroy(); return; }
    if ((mode === 'late-update' && tick === 2) || (mode === 'lost-concurrent' && tick === 6)) {
      await new Promise(resolve => setTimeout(resolve, 150));
      row.waist_in = 33.5;
    }
    return send({ entry: row });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { rows, requests, config: loadConfig(setup(`http://127.0.0.1:${port}`)), close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(err => err ? reject(err) : resolve()); }) };
}

test('MOCK HTTP fixture: full run preserves sparse metrics and cleans only generated IDs', async () => {
  const f = await fixture();
  try {
    const report = await runVerification(f.config);
    assert.equal(report.ok, true);
    assert.equal(report.cleanupVerified, true);
    assert.equal(f.rows.length, 0);
    assert.ok(f.requests.some(r => r.path === '/rest/v1/body_metrics'));
    assert.ok(f.requests.some(r => r.body?.user_id === ids[0] && r.user === ids[1]));
    assert.ok(f.requests.filter(r => r.body?.action === 'delete').every(r => r.body.id && !r.body.measured_date));
  } finally { await f.close(); }
});


const script = fileURLToPath(new URL('../../scripts/verify-body-metrics-persistence.mjs', import.meta.url));

for (const mode of ['wrong-user', 'truncated', 'occupied', 'leaked-list', 'rest-no-count', 'rest-truncated', 'rest-occupied', 'short-list']) {
  test(`MOCK preflight ${mode}: refuses before any POST`, async () => {
    const f = await fixture(mode);
    try {
      const report = await runVerification(f.config);
      assert.equal(report.ok, false);
      assert.equal(f.requests.filter(r => r.body).length, 0);
    } finally { await f.close(); }
  });
}
for (const mode of ['replace-not-merge', 'invalid-mutates', 'rest-mismatch', 'cleanup-noop']) {
  test(`MOCK ${mode}: detects regression and attempts recorded-ID cleanup`, async () => {
    const f = await fixture(mode);
    try {
      const report = await runVerification(f.config);
      assert.equal(report.ok, false);
      assert.ok(report.generated.length > 0);
      assert.ok(f.requests.some(r => r.body?.action === 'delete'));
      if (mode !== 'cleanup-noop') assert.equal(f.rows.length, 0);
      else assert.equal(report.cleanupVerified, false);
    } finally { await f.close(); }
  });
}
test('MOCK lost successful response: report reconciliation, never discover/delete by date', async () => {
  const f = await fixture('lost-response');
  try {
    const report = await runVerification(f.config);
    assert.equal(report.ok, false);
    assert.equal(report.cleanupVerified, false);
    assert.equal(report.reconciliationNeeded.length, 1);
    assert.equal(f.rows.length, 1);
    assert.equal(f.requests.filter(r => r.body?.action === 'delete').length, 0);
    assert.equal(report.generated.length, 0);
  } finally { await f.close(); }
});

test('MOCK foreign-delete-succeeds: detects cross-user delete regression', async () => {
  const f = await fixture('foreign-delete-succeeds');
  try {
    const report = await runVerification(f.config);
    assert.equal(report.ok, false);
    assert.ok(report.failures.some(m => /[Ff]oreign delete/.test(m)), JSON.stringify(report.failures));
  } finally { await f.close(); }
});

test('MOCK spoof-honors-body-user: detects cross-user write-ownership regression', async () => {
  const f = await fixture('spoof-honors-body-user');
  try {
    const report = await runVerification(f.config);
    assert.equal(report.ok, false);
  } finally { await f.close(); }
});

test('MOCK concurrent-split-ids: detects concurrent-write ID-stability regression', async () => {
  const f = await fixture('concurrent-split-ids');
  try {
    const report = await runVerification(f.config);
    assert.equal(report.ok, false);
    assert.ok(report.failures.some(m => /ID/.test(m)), JSON.stringify(report.failures));
  } finally { await f.close(); }
});

test('MOCK blank-write-new-id: detects blank/null-preservation ID-stability regression', async () => {
  const f = await fixture('blank-write-new-id');
  try {
    const report = await runVerification(f.config);
    assert.equal(report.ok, false);
    assert.ok(report.failures.some(m => /stable-ID row/.test(m)), JSON.stringify(report.failures));
  } finally { await f.close(); }
});

test('MOCK auth-rejects without CK_BM_PUBLIC_KEY: refusal names the missing key as a likely cause', async () => {
  const f = await fixture('auth-rejects');
  try {
    const report = await runVerification(f.config);
    assert.equal(report.ok, false);
    assert.ok(report.failures.some(m => /CK_BM_PUBLIC_KEY/.test(m)), JSON.stringify(report.failures));
  } finally { await f.close(); }
});

test('setup guards reject unsafe targets, credentials, dates, and sessions without network', () => {
  const valid = setup('http://127.0.0.1:54321');
  assert.equal(loadConfig(valid).users.length, 2);
  const cases = [
    { CK_BM_CONFIRM: 'yes' }, { CK_BM_ENVIRONMENT: 'production' }, { CK_BM_URL: '' },
    { CK_BM_URL: 'https://user:password@example.com' }, { CK_BM_URL: 'https://example.com?key=secret' },
    { CK_BM_URL: 'http://example.com', CK_BM_ENVIRONMENT: 'disposable-staging' },
    { CK_BM_URL: 'https://example.com' }, { CK_BM_URL: 'http://127.0.0.1:54321/functions/v1' },
    { CK_BM_TOKEN_A: jwt(ids[0], 'service_role') }, { CK_BM_PUBLIC_KEY: jwt(ids[0], 'service_role') },
    { CK_BM_PUBLIC_KEY: 'sb_secret_never-print' }, { CK_BM_USER_A: ids[1] },
    { CK_BM_USER_B: ids[0], CK_BM_TOKEN_B: jwt(ids[0]) },
    { CK_BM_DATES: dates.slice(0, 2).join(',') }, { CK_BM_DATES: [dates[0], dates[0], dates[2]].join(',') },
    { CK_BM_DATES: ['2000-01-01', ...dates].join(',') }, { CK_BM_DATES: ['2099-01-01', ...dates].join(',') },
    { CK_BM_DATES: ['2026-02-30', ...dates].join(',') },
    { CK_BM_DATES: Array.from({ length: 11 }, (_, n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)).join(',') },
  ];
  for (const overrides of cases) assert.throws(() => loadConfig({ ...valid, ...overrides }), /REFUSED/);
});


for (const mode of ['lost-update', 'late-update']) {
  test(`MOCK ${mode}: ambiguous in-flight update must never race cleanup of known ID`, async () => {
    const f = await fixture(mode);
    try {
      const start = performance.now();
      const report = await runVerification(f.config, { requestTimeoutMs: 50 });
      assert.equal(report.ok, false);
      assert.equal(report.cleanupVerified, false);
      assert.ok(report.reconciliationNeeded.length > 0);
      assert.equal(report.generated.length, 1);
      assert.equal(f.requests.filter(r => r.body?.action === 'delete').length, 0);
      await new Promise(resolve => setTimeout(resolve, 180));
      assert.equal(f.rows.length, 1);
      assert.ok(performance.now() - start < 2000, 'bounded timeout, no retry');
    } finally { await f.close(); }
  });
}

test('MOCK concurrent lost response: settle both client requests, never race server writes with cleanup', async () => {
  const f = await fixture('lost-concurrent');
  try {
    const report = await runVerification(f.config, { requestTimeoutMs: 50 });
    assert.equal(report.ok, false);
    assert.equal(report.cleanupVerified, false);
    assert.equal(report.reconciliationNeeded.length, 2);
    assert.equal(report.generated.length, 2);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(f.rows.length, 3);
    assert.equal(f.requests.filter(r => r.body?.action === 'delete').length, 0);
  } finally { await f.close(); }
});

test('MOCK pre-existing off-date row survives successful run byte-for-byte', async () => {
  const f = await fixture('preexisting');
  try {
    const baseline = JSON.stringify(f.rows);
    const protectedId = f.rows[0].id;
    const start = performance.now();
    const report = await runVerification(f.config);
    assert.equal(report.ok, true);
    assert.equal(JSON.stringify(f.rows), baseline);
    assert.ok(f.requests.filter(r => r.body?.action === 'delete').every(r => r.body.id !== protectedId));
    assert.ok(f.requests.length < 500, 'bounded request count');
    assert.ok(performance.now() - start < 5000, 'local fixture performance budget');
  } finally { await f.close(); }
});

test('CLI help is safe and missing explicit setup refuses without exposing secrets', () => {
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8', env: {} });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /CK_BM_CONFIRM/);
  const refusal = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { CK_BM_TOKEN_A: 'NEVER_PRINT_THIS' } });
  assert.equal(refusal.status, 1);
  assert.match(refusal.stderr, /REFUSED/);
  assert.doesNotMatch(refusal.stderr + refusal.stdout, /NEVER_PRINT_THIS/);
});
