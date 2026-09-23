#!/usr/bin/env node
// Opt-in only. Never discovers credentials, reads .env files, or retries writes.
import { pathToFileURL } from 'node:url';
import { Buffer } from 'node:buffer';

export const HELP = `Actual Edge → PostgREST body-metrics verifier (destructive, disposable only).
Required environment (no files are read):
  CK_BM_CONFIRM=YES
  CK_BM_ENVIRONMENT=disposable-local | disposable-staging
  CK_BM_URL=<explicit Supabase base URL, no path/query/credentials>
  CK_BM_TOKEN_A / CK_BM_TOKEN_B=<explicit authenticated user access JWTs>
  CK_BM_USER_A / CK_BM_USER_B=<expected distinct user UUIDs>
  CK_BM_DATES=<3–10 distinct YYYY-MM-DD dates, comma separated>
CK_BM_PUBLIC_KEY=<anon JWT or sb_publishable_ key; NEVER service key>
  (usually required by standard Supabase gateways; anon/publishable key only)
Dates must be in the last 999 UTC days, not future; ALL must be empty for both users.
Requires /auth/v1/user, /functions/v1/body-metrics, and authorized
/rest/v1/body_metrics readback, existing schema/RLS, and an EXCLUSIVE disposable
workspace (no concurrent users/jobs). List capacity ambiguity refuses before writes.
No production defaults. No authentication/session provisioning. No credential logs.
Cleanup deletes ONLY IDs returned by successful writes, never dates. Any ambiguous
mutation suppresses further deletes: aborting fetch does NOT cancel server work.
Manual reconciliation is then required; nonzero exit means NOT verified.
Requests: 10s each, 180s verification budget, 60s cleanup budget, no write retries.
--help performs no network requests. Local fixture tests are NOT R4 proof.
`;

export function loadConfig(env = process.env, now = Date.now()) {
  if (env.CK_BM_CONFIRM !== 'YES') throw new Error('REFUSED: CK_BM_CONFIRM must be YES');
  if (!['disposable-local', 'disposable-staging'].includes(env.CK_BM_ENVIRONMENT)) throw new Error('REFUSED: select disposable environment');
  let url;
  try { url = new URL(env.CK_BM_URL); } catch { throw new Error('REFUSED: explicit base URL required'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['https:', 'http:'].includes(url.protocol)) throw new Error('REFUSED: unsafe base URL');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((env.CK_BM_ENVIRONMENT === 'disposable-local' && !local) || (url.protocol !== 'https:' && !local)) throw new Error('REFUSED: environment/transport mismatch');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const users = ['A', 'B'].map(label => {
    const id = env[`CK_BM_USER_${label}`], token = env[`CK_BM_TOKEN_${label}`];
    let claims;
    try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { /* Refuse below without echoing input. */ }
    if (!uuid.test(id ?? '') || !claims || claims.sub !== id || claims.role !== 'authenticated' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now + 300_000 || /\s/.test(token)) throw new Error('REFUSED: explicit unexpired authenticated sessions and matching expected IDs required');
    return { label, id, token };
  });
  if (users[0].id === users[1].id || users[0].token === users[1].token) throw new Error('REFUSED: two distinct users required');
  const dates = (env.CK_BM_DATES ?? '').split(',');
  const today = new Date(now).toISOString().slice(0, 10);
  const since = new Date(now - 999 * 86400_000).toISOString().slice(0, 10);
  if (dates.length < 3 || dates.length > 10 || new Set(dates).size !== dates.length || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d || d < since || d > today)) throw new Error('REFUSED: designate three or more unique real dates within safe 1000-day visibility window');
  const publicKey = env.CK_BM_PUBLIC_KEY;
  if (publicKey) {
    let anon = false;
    try { anon = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* Publishable key checked next. */ }
    if ((!anon && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)) || /\s/.test(publicKey)) throw new Error('REFUSED: only public anon/publishable API keys accepted');
  }
  return { base: url.origin, environment: env.CK_BM_ENVIRONMENT, users, dates, publicKey };
}

// No assertion may interpolate remote data: errors and reports must stay credential-safe.
const check = (condition, message) => { if (!condition) throw new Error(message); };
const canonical = value => JSON.stringify(value, Object.keys(value ?? {}).sort());
const sameRows = (left, right) => JSON.stringify(left.map(canonical).sort()) === JSON.stringify(right.map(canonical).sort());

export async function runVerification(config, { requestTimeoutMs = 10_000 } = {}) {
  check(Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0 && requestTimeoutMs <= 10_000, 'Invalid request time budget');
  const { base, users: [A, B], dates } = config;
  const report = { ok: false, cleanupVerified: false, environment: config.environment,
    target: base, dates, node: process.version, platform: process.platform, arch: process.arch,
    startedAt: new Date().toISOString(), postgrestVersion: null, checks: [], generated: [],
    reconciliationNeeded: [], failures: [] };
  const baseline = new Map();
  const tracked = new Map();
  let writesStarted = false;
  let unsafeToClean = false;
  let deadline = Date.now() + 180_000;
  const utcDay = new Date().toISOString().slice(0, 10);
  async function request(user, path, body) {
    const remaining = deadline - Date.now();
    check(remaining > 0, 'Phase time budget exhausted');
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remaining)),
        headers: { Authorization: `Bearer ${user.token}`, ...(config.publicKey ? { apikey: config.publicKey } : {}),
          'Content-Type': 'application/json', ...(path.startsWith('/rest/') ? { Prefer: 'count=exact' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      // Only a narrowly parsed, explicitly advertised public version is recorded.
      if (path.startsWith('/rest/')) {
        const advertised = response.headers.get('x-postgrest-version') ?? response.headers.get('server') ?? '';
        const match = advertised.match(/^(?:postgrest\/?\s*)?(\d+\.\d+(?:\.\d+)?)$/i);
        if (match) report.postgrestVersion = match[1];
      }
      return { status: response.status, data, range: response.headers.get('content-range') };
    } catch {
      if (body) unsafeToClean = true;
      throw new Error('Transport/JSON failure (response suppressed; writes are never retried)');
    }
  }
  function rowsValid(rows, user) {
    check(Array.isArray(rows) && rows.every(r => r && typeof r.id === 'string' && r.user_id === user.id && typeof r.measured_date === 'string'), 'Malformed or cross-user readback');
    check(new Set(rows.map(r => r.id)).size === rows.length, 'Duplicate row IDs in readback');
    return rows;
  }
  async function list(user) {
    const response = await request(user, '/functions/v1/body-metrics?action=list&days=1000');
    check(response.status === 200, 'Edge list failed');
    const rows = rowsValid(response.data.entries, user);
    check(rows.length < 1000, 'REFUSED: list is potentially truncated at 1000 rows');
    return rows;
  }
  async function rest(user, date) {
    const since = new Date(Date.now() - 1000 * 86400_000).toISOString().slice(0, 10);
    const response = await request(user, `/rest/v1/body_metrics?select=*&measured_date=${date ? `eq.${date}&limit=2` : `gte.${since}&limit=1000`}`);
    check(response.status === 200 || response.status === 206, 'Authorized PostgREST readback failed');
    const rows = rowsValid(response.data, user);
    const count = response.range?.match(/\/(\d+)$/);
    check(count && Number(count[1]) === rows.length, 'REFUSED: PostgREST count missing or truncated');
    check(rows.every(r => date ? r.measured_date === date : r.measured_date >= since), 'PostgREST date filter mismatch');
    return rows;
  }
  async function snapshot(user) {
    check(new Date().toISOString().slice(0, 10) === utcDay, 'UTC day changed; rerun preflight on a stable calendar window');
    const rows = await list(user);
    check(sameRows(rows, await rest(user)), 'Edge list incomplete or PostgREST full-list mismatch');
    for (const date of dates) check(sameRows(rows.filter(r => r.measured_date === date), await rest(user, date)), 'Edge/PostgREST full-row readback mismatch');
    return rows;
  }
  async function bothSnapshots() { return [await snapshot(A), await snapshot(B)]; }
  function record(user, date, entry) {
    check(entry && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.id) && entry.user_id === user.id && entry.measured_date === date, 'Untrusted write identity; reconciliation needed');
    check(![...baseline.values()].flat().some(r => r.id === entry.id), 'Write returned pre-existing ID; will not delete it');
    check(!tracked.has(entry.id) || tracked.get(entry.id).user === user, 'Write returned another user tracked ID');
    tracked.set(entry.id, { user, date });
  }
  async function upsert(user, date, fields, expected = 200) {
    writesStarted = true;
    let response;
    try {
      response = await request(user, '/functions/v1/body-metrics', { action: 'upsert', measured_date: date, ...fields });
      if (response.status === 200) record(user, date, response.data.entry);
      else if (response.status !== 400) throw new Error('Unexpected write status; commit outcome unknown');
    } catch (error) {
      unsafeToClean = true;
      report.reconciliationNeeded.push({ user: user.label, date, reason: 'Write outcome/identity ambiguous; inspect this date manually, never delete by date' });
      throw error;
    }
    check(response.status === expected, 'Unexpected upsert HTTP status');
    return response.data.entry;
  }
  async function remove(user, id) {
    try {
      const response = await request(user, '/functions/v1/body-metrics', { action: 'delete', id });
      check(response.status === 200 && response.data.ok === true, 'Delete failed');
    } catch (error) {
      unsafeToClean = true;
      report.reconciliationNeeded.push({ user: user.label, id, reason: 'Delete outcome ambiguous; stop mutations and reconcile after server work settles' });
      throw error;
    }
  }
  async function merged(user, date, id) {
    const rows = (await snapshot(user)).filter(r => r.measured_date === date);
    check(rows.length === 1 && rows[0].id === id && rows[0].weight_lbs === 181.25 && rows[0].waist_in === 33.5, 'Sparse updates did not preserve both metrics in exactly one stable-ID row');
    return rows[0];
  }
  try {
    // Authenticate both expected IDs remotely before even reading the writable surface.
    for (const user of [A, B]) {
      const auth = await request(user, '/auth/v1/user');
      if (auth.status !== 200) {
        check(false, config.publicKey
          ? 'REFUSED: server identity does not match expected user'
          : 'REFUSED: server identity check failed; a missing CK_BM_PUBLIC_KEY (anon/publishable key, never service role) is a likely cause on standard Supabase gateways');
      }
      check(auth.data.id === user.id, 'REFUSED: server identity does not match expected user');
    }
    for (const user of [A, B]) {
      const rows = await snapshot(user);
      check(rows.length < 996, 'REFUSED: insufficient list headroom for test rows');
      check(!rows.some(r => dates.includes(r.measured_date)), 'REFUSED: designated date already occupied');
      baseline.set(user.label, rows);
    }
    report.checks.push('Both identities, isolated complete lists, exact PostgREST counts, all designated dates empty');
    // Separate empty dates: weight then waist, and waist then weight.
    for (const [index, first, second] of [[0, { weight_lbs: 181.25 }, { waist_in: 33.5 }], [1, { waist_in: 33.5 }, { weight_lbs: 181.25 }]]) {
      const one = await upsert(A, dates[index], first);
      const firstRows = (await snapshot(A)).filter(r => r.measured_date === dates[index]);
      check(firstRows.length === 1 && firstRows[0].id === one.id && Object.entries(first).every(([k, v]) => firstRows[0][k] === v), 'First sparse write did not persist');
      const two = await upsert(A, dates[index], second);
      check(one.id === two.id, 'Sequential sparse upsert changed row ID');
      await merged(A, dates[index], one.id);
    }
    report.checks.push('Sequential sparse writes in both orders: same ID, one row, both values');
    // Wait for BOTH outcomes before finally cleanup (Promise.all could clean up too soon).
    // Repeated on every spare designated date (index 2+), not just once, so a pass isn't
    // evidence from a single race that may never have actually overlapped.
    let lastConcurrentId;
    for (const date of dates.slice(2)) {
      const concurrent = await Promise.allSettled([
        upsert(A, date, { weight_lbs: 181.25 }), upsert(A, date, { waist_in: 33.5 }),
      ]);
      check(concurrent.every(r => r.status === 'fulfilled'), 'Concurrent write failed; all requests settled before cleanup');
      const concurrentRows = concurrent.map(r => r.value);
      check(concurrentRows[0].id === concurrentRows[1].id, 'Concurrent sparse writes returned different IDs');
      await merged(A, date, concurrentRows[0].id);
      lastConcurrentId = concurrentRows[0].id;
    }
    report.checks.push(`Concurrent disjoint sparse writes (insert race) persisted in one stable-ID row on ${dates.length - 2} designated date(s)`);
    // Concurrent disjoint writes against a row that ALREADY exists (ON CONFLICT DO UPDATE
    // path, where lost updates would actually show up): seed one new field sequentially,
    // then fire two more new fields concurrently at the row the insert race just created.
    const existingDate = dates[dates.length - 1];
    const seeded = await upsert(A, existingDate, { chest_in: 40 });
    check(seeded.id === lastConcurrentId, 'Seed write on already-existing row changed ID');
    const existingConcurrent = await Promise.allSettled([
      upsert(A, existingDate, { hips_in: 36 }), upsert(A, existingDate, { arm_in: 20 }),
    ]);
    check(existingConcurrent.every(r => r.status === 'fulfilled'), 'Concurrent write to existing row failed; all requests settled before cleanup');
    check(existingConcurrent.every(r => r.value.id === seeded.id), 'Concurrent disjoint writes to an existing row returned a different ID');
    const existingRows = (await snapshot(A)).filter(r => r.measured_date === existingDate);
    check(existingRows.length === 1 && existingRows[0].id === seeded.id
      && existingRows[0].chest_in === 40 && existingRows[0].hips_in === 36 && existingRows[0].arm_in === 20,
      'Concurrent disjoint writes to an existing row did not preserve all three values in one row');
    report.checks.push('Concurrent disjoint sparse writes against an already-existing row preserved all values in one stable-ID row');
    for (const fields of [{ weight_lbs: 'invalid', waist_in: 34 }, { weight_lbs: 801, waist_in: 34 }, { weight_lbs: '', waist_in: null }, { weight_lbs: null, waist_in: '   ' }]) {
      const before = await bothSnapshots();
      await upsert(A, dates[0], fields, 400);
      const after = await bothSnapshots();
      check(before.every((rows, i) => sameRows(rows, after[i])), 'Rejected write mutated full rows/timestamps');
    }
    report.checks.push('Invalid+valid and all blank/null return 400 with complete rows/timestamps unchanged');
    const originalId = (await snapshot(A)).find(r => r.measured_date === dates[0]).id;
    await upsert(A, dates[0], { weight_lbs: '', waist_in: null, chest_in: 40 });
    const firstBlankRow = await merged(A, dates[0], originalId);
    check(firstBlankRow.chest_in === 40, 'Valid companion metric did not persist');
    await upsert(A, dates[0], { weight_lbs: null, waist_in: '   ', chest_in: 41 });
    // Compare against the ID captured before any of these writes, not one just re-read
    // off the row after the write — otherwise this can never fail.
    const blankRow = await merged(A, dates[0], originalId);
    check(blankRow.chest_in === 41, 'Valid companion metric did not persist');
    report.checks.push('Blank/null with valid metric preserves stored values');
    const aBeforeSpoof = await snapshot(A);
    // Auth B ignores body user_id A; current handler correctly creates B's own row.
    await upsert(B, dates[0], { user_id: A.id, weight_lbs: 190 });
    check(sameRows(aBeforeSpoof, await snapshot(A)), 'Body owner spoof modified A');
    const bRows = await snapshot(B);
    check(bRows.filter(r => r.measured_date === dates[0]).length === 1, 'Spoof test B-owned row missing');
    const beforeDelete = await bothSnapshots();
    await remove(B, blankRow.id); // Actual contract is HTTP 200 no-op, NOT 403.
    const afterDelete = await bothSnapshots();
    check(beforeDelete.every((rows, i) => sameRows(rows, afterDelete[i])), 'Foreign delete changed rows');
    report.checks.push('Two-user list isolation, spoof scoped to B, foreign delete 200 unchanged');
    await remove(A, blankRow.id);
    check(!(await snapshot(A)).some(r => r.id === blankRow.id), 'Owner whole-row delete did not persist');
    report.checks.push('Owner whole-row delete verified');
  } catch (error) {
    report.failures.push(error.message);
  } finally {
    deadline = Date.now() + 60_000;
    // Only IDs successfully returned and tied to initially empty user/date pairs qualify.
    for (const [id, { user, date }] of tracked) {
      report.generated.push({ id, user: user.label, date });
      // allSettled settles client promises, not server transactions after disconnect.
      // Never race a potentially still-running write with cleanup, even for known IDs.
      if (unsafeToClean) continue;
      try {
        await remove(user, id);
        check(!(await list(user)).some(r => r.id === id) && !(await rest(user, date)).some(r => r.id === id), 'Cleanup ID still present');
      } catch { report.failures.push('Cleanup delete/readback failed; recorded IDs need reconciliation'); }
    }
    if (unsafeToClean) report.failures.push('Automatic cleanup suspended: mutation outcome ambiguous; manually reconcile recorded IDs and designated dates after server work settles');
    if (writesStarted && !unsafeToClean) {
      try {
        for (const user of [A, B]) check(sameRows(baseline.get(user.label), await snapshot(user)), 'Final full-row baseline differs; reconciliation needed');
        report.cleanupVerified = report.reconciliationNeeded.length === 0;
      } catch { report.failures.push('Final baseline restoration could not be verified; reconciliation needed'); }
    }
  }
  report.ok = report.failures.length === 0 && report.cleanupVerified;
  report.finishedAt = new Date().toISOString();
  return report;
}

async function main() {
  try {
    if (process.argv.length === 3 && process.argv[2] === '--help') { console.log(HELP); return; }
    if (process.argv.length !== 2) throw new Error('REFUSED: unknown arguments (use --help)');
    const config = loadConfig();
    console.log(JSON.stringify({ event: 'approved-disposable-target', environment: config.environment, target: config.base, dates: config.dates }));
    const report = await runVerification(config);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
