import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Real Edge handler and shared resolver; only clock/auth/DB transport replaced.
// These tests do not prove PostgREST behavior or database transaction atomicity.
const owner = 'verified-owner';
const macro = (calories = 2200) => ({ calories, protein_g: 150, carbs_g: 250, fat_g: 70 });
const saved = (extra = {}) => ({ id: 'saved-set', user_id: owner, source: 'manual', base_target: macro(), updated_at: '2026-09-01T00:00:00Z', ...extra });
const legacy = { id: 'legacy', user_id: owner, updated_at: '2026-09-01T00:00:00Z', training_calories: 3000, training_protein_g: 180, training_carbs_g: 350, training_fat_g: 80, rest_calories: 1800, rest_protein_g: 120, rest_carbs_g: 200, rest_fat_g: 60, fiber_g_min: 25, saturated_fat_g_max: 30 };
function host(options: any = {}) {
  let handler: (req: Request) => Promise<Response>;
  const calls: any[] = [], writes: any[] = [];
  const rows: any = { nutrition_target_sets: saved(), nutrition_target_day_overrides: [], nutrition_targets: legacy, profiles: { training_days: [3], training_days_per_week: 1 }, notification_preferences: { timezone: 'UTC' }, daily_nutrition_summaries: null, daily_feedback: null, behavior_events: [], behavior_state: null, ...options.rows };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: owner } }, error: null }) },
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      if (name === 'read_nutrition_target_set') return {
        data: rows.nutrition_target_sets === null ? null : { ...rows.nutrition_target_sets, day_overrides: rows.nutrition_target_day_overrides },
        error: ['nutrition_target_sets:read', 'nutrition_target_day_overrides:read'].includes(options.fail) ? { message: 'read failure' } : null,
      };
      if (name === 'persist_coach_feedback') return { data: args.p_report,
        error: options.fail === 'commit' ? { message: 'secret SQL internal detail' } : null };
      return { data: options.totals === undefined ? { ...macro(), fiber_g: 25, saturated_fat_g: 10, log_count: 1 } : options.totals, error: options.fail === 'totals' ? { message: 'read failure' } : null };
    },
    from(table: string) {
      const call: any = { table, op: 'read', filters: [] }; calls.push(call);
      const result = () => ({ data: call.op === 'write' ? call.row : rows[table], count: options.workoutCount === undefined ? 1 : options.workoutCount, error: options.fail === `${table}:${call.op}` ? { message: 'fixture failure' } : null });
      const q: any = { select: () => q, eq: (key: string, value: any) => { call.filters.push([key, value]); return q; }, gte: () => q, lte: () => q, order: () => q,
        upsert: (row: any) => { call.op = 'write'; call.row = JSON.parse(JSON.stringify(row)); writes.push(call); return q; },
        maybeSingle: async () => result(), single: async () => result(), then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject) };
      return q;
    },
  };
  const RealDate = Date;
  class Clock extends RealDate { constructor(value?: any) { super(value === undefined ? options.now ?? '2026-09-16T12:00:00Z' : value); } static now() { return new RealDate(options.now ?? '2026-09-16T12:00:00Z').getTime(); } }
  function load(url: URL): any {
    const exports = {};
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, Request, Response, URL, Date: Clock, Intl, console: { error() {} }, Deno: { env: { get: () => 'fixture' } }, require(name: string) {
      if (name.includes('/http/server.ts')) return { serve: (fn: typeof handler) => { handler = fn; } };
      if (name.includes('supabase-js')) return { createClient: () => client };
      if (name.startsWith('.')) return load(new URL(name, url));
      throw new Error(`Unexpected dependency ${name}`);
    } });
    return exports;
  }
  load(new URL('./index.ts', import.meta.url));
  return { calls, writes, request: (body: any = { action: 'generate' }, method = 'POST', auth = 'Bearer fixture', query = '') => handler!(new Request(`https://fixture.invalid/${query}`, { method, headers: auth ? { Authorization: auth } : {}, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })) };
}

test('generation has exactly one atomic persistence RPC and no table writes', async () => {
  const api = host();
  await api.request({ action: 'generate', user_id: 'spoofed' });
  const commits = api.calls.filter(c => c.name === 'persist_coach_feedback');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].args.p_user_id, owner);
  assert.equal(commits[0].args.p_report.harshness_level, undefined);
  assert.equal(commits[0].args.p_report.streak_days, undefined);
  assert.equal(api.writes.length, 0);
});

for (const table of ['profiles', 'notification_preferences']) test(`${table} read errors stop feedback before writes`, async () => {
  const api = host({ fail: `${table}:read` });
  assert.equal((await api.request()).status, 500);
  assert.equal(api.writes.length, 0);
});

test('atomic persistence failure returns safe error and no separate writes', async () => {
  const api = host({ fail: 'commit' });
  const res = await api.request();
  assert.equal(res.status, 500);
  assert.doesNotMatch(JSON.stringify(await res.json()), /secret|SQL|internal detail/);
  assert.equal(api.writes.length, 0);
});

test('state read failure is not a successful empty state', async () => {
  const api = host({ fail: 'behavior_state:read' });
  assert.equal((await api.request({ action: 'state' })).status, 500);
  assert.equal(api.writes.length, 0);
});

for (const date of ['2026-02-30', '2026-13-01', '0000-01-01']) test(`invalid calendar date ${date} is rejected before queries`, async () => {
  const api = host();
  assert.equal((await api.request({ action: 'generate', date })).status, 400);
  assert.equal(api.calls.length, 0);
});

for (const fail of ['nutrition_target_sets:read', 'nutrition_target_day_overrides:read', 'nutrition_targets:read', 'workouts:read', 'totals']) test(`${fail} evidence error cannot produce feedback`, async () => {
  const api = host({ fail });
  assert.equal((await api.request()).status, 500);
  assert.equal(api.writes.length, 0);
});
for (const fail of ['daily_feedback:read', 'daily_nutrition_summaries:read']) test(`${fail} historical read error is not absence`, async () => {
  const api = host({ fail });
  assert.equal((await api.request({ action: 'generate', date: '2026-09-15' })).status, 500);
  assert.equal(api.writes.length, 0);
});
test('no food evidence has no nutrition grade or invented success', async () => {
  const api = host({ totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, saturated_fat_g: 0, log_count: 0 } });
  const res = await api.request({ action: 'generate', user_id: 'spoofed' });
  assert.equal(res.status, 200);
  const feedback = (await res.json()).feedback;
  assert.equal(feedback.user_id, owner);
  assert.equal(feedback.nutrition_grade, null);
  assert.equal(feedback.nutrition_score, null);
  assert.equal(feedback.nutrition_color, null);
  assert.match(feedback.needs_improvement, /Not enough matching-date nutrition evidence/);
  assert.ok(api.writes.every(c => c.row.user_id === owner));
});

const historicalSnapshot = { user_id: owner, summary_date: '2026-09-15', is_training_day: false, calorie_target: 1900, protein_target: 130, carb_target: 220, fat_target: 60 };

test('history uses the saved snapshot, never changed current targets/schedule, and leaves snapshot untouched', async () => {
  const results = [];
  for (const calories of [3000, 5000]) {
    const api = host({ rows: { nutrition_target_sets: saved({ base_target: macro(calories) }), daily_nutrition_summaries: historicalSnapshot, profiles: { training_days: [2] } } });
    const res = await api.request({ action: 'generate', date: '2026-09-15' });
    assert.equal(res.status, 200);
    const report = (await res.json()).feedback;
    assert.match(report.needs_improvement, /300 above/);
    assert.equal(report.workout_grade, '✓');
    assert.equal(api.writes.some(c => c.table === 'daily_nutrition_summaries'), false);
    assert.equal(api.calls.some(c => c.table === 'nutrition_target_sets'), false);
    assert.equal(api.writes.some(c => c.table.startsWith('behavior_')), false);
    results.push(report);
  }
  assert.deepEqual(results[0], results[1]);
});

test('history without usable complete target snapshot fails closed', async () => {
  for (const snapshot of [null, { ...historicalSnapshot, fat_target: null }, { ...historicalSnapshot, calorie_target: 0 }]) {
    const api = host({ rows: { daily_nutrition_summaries: snapshot } });
    const res = await api.request({ action: 'generate', date: '2026-09-15' });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /HISTORICAL_TARGET_SNAPSHOT_UNAVAILABLE/);
    assert.equal(api.writes.length, 0);
  }
});

test('existing historical report is returned unchanged without automatic rewrites', async () => {
  const report = { user_id: owner, feedback_date: '2026-09-15', did_well: 'Original report', nutrition_score: 78 };
  const api = host({ fail: 'totals', rows: { daily_feedback: report } });
  const res = await api.request({ action: 'generate', date: '2026-09-15' });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).feedback, report);
  assert.equal(api.writes.length, 0);
});

test('actual persisted weekday override wins over split, base and legacy', async () => {
  const api = host({ rows: { nutrition_target_sets: saved({ training_day_target: macro(2400) }), nutrition_target_day_overrides: [{ target_set_id: 'saved-set', user_id: owner, day_of_week: 3, source: 'manual', updated_at: '2026-09-01T00:00:00Z', target: macro(2600) }] } });
  assert.equal((await api.request()).status, 200);
  const summary = api.calls.find(c => c.name === 'persist_coach_feedback').args.p_summary;
  assert.equal(summary.calorie_target, 2600);
  assert.equal(summary.protein_target, 150);
  assert.equal(summary.is_training_day, true);
  const read = api.calls.find(c => c.name === 'read_nutrition_target_set');
  assert.equal(read.args.p_user_id, owner);
  assert.equal(api.calls.some(c => c.table === 'nutrition_target_day_overrides'), false);
});
