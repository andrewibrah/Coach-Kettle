import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const owner = 'verified-owner';
const macro = { calories: 2000, protein_g: 100, carbs_g: 250, fat_g: 60 };
function fixture() {
  return { meals: Array.from({ length: 28 }, (_, i) => ({
    date: `2026-09-${13 + Math.floor(i / 4)}`, day_of_week: Math.floor(i / 4), is_training_day: false,
    meal_slot: ['breakfast', 'lunch', 'dinner', 'snack'][i % 4], title: 'Fixture only', description: '',
    calories: 500, protein_g: 25, carbs_g: 62.5, fat_g: 15, fiber_g: 5,
    items: [{ name: 'Test oats', grams: 100, calories: 500, protein_g: 25, carbs_g: 62.5, fat_g: 15 }],
  })) };
}
function host(options: any = {}) {
  let handler: any;
  const calls: any[] = [], replacements: any[] = [];
  const rows: any = { profiles: { training_days: [], dietary_allergies: [] }, notification_preferences: { timezone: 'UTC' }, nutrition_target_sets: { id: 'set', user_id: owner, source: 'manual', base_target: macro }, nutrition_target_day_overrides: [], nutrition_targets: null, meal_plans: null, planned_meals: [], food_logs: [], ...options.rows };
  const client = { auth: { getUser: async () => ({ data: { user: options.unauthorized ? null : { id: owner } } }) },
    rpc: async (name: string, args: any) => {
      if (name === 'read_nutrition_target_set') {
        calls.push({ rpc: name, args });
        return { data: rows.nutrition_target_sets === null ? null : { ...rows.nutrition_target_sets, day_overrides: rows.nutrition_target_day_overrides },
          error: ['nutrition_target_sets', 'nutrition_target_day_overrides'].includes(options.fail) ? {} : null };
      }
      if (name === 'read_meal_plan') {
        calls.push({ rpc: name, args });
        const data = structuredClone({ plan: rows.meal_plans, meals: rows.planned_meals });
        if (options.interleave) { rows.meal_plans = options.interleave.plan; rows.planned_meals = options.interleave.meals; }
        return { data: options.readMalformed ? null : data, error: options.rpcError || ['meal_plans', 'planned_meals'].includes(options.fail) ? {} : null };
      }
      replacements.push({ name, args }); return { data: { plan: { id: 'committed', user_id: owner }, meals_inserted: 28 }, error: options.rpcError ? {} : null }; },
    from(table: string) {
      const call: any = { table, filters: [] }; calls.push(call);
      const result = () => {
        const data = structuredClone(rows[table]);
        // Commit replacement between the old handler's parent and child reads.
        if (table === 'meal_plans' && options.interleave) {
          rows.meal_plans = options.interleave.plan;
          rows.planned_meals = options.interleave.meals;
        }
        return { data, error: options.fail === table ? {} : null };
      };
      const q: any = { select: () => q, eq: (k: any, v: any) => { call.filters.push([k, v]); return q; }, order: () => q, limit: () => q, gte: () => q, maybeSingle: async () => result(), then: (yes: any, no: any) => Promise.resolve(result()).then(yes, no) };
      return q;
    } };
  class Clock extends Date { constructor(value?: any) { super(value ?? '2026-09-16T12:00:00Z'); } static now() { return new Date('2026-09-16T12:00:00Z').getTime(); } }
  const context = vm.createContext({});
  function load(url: URL): any {
    const exports = vm.runInContext('({})', context);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const globals = {
      exports, Request, Response, URL, Date: Clock, TextEncoder, TextDecoder, AbortController, setTimeout: (fn: any, ms: number) => setTimeout(fn, options.timeout ? 1 : ms), clearTimeout,
      console: { error() {} }, Deno: { env: { get: (key: string) => key === 'OPENAI_API_KEY' && options.missingKey ? undefined : 'fixture' } },
      fetch: async (_url: string, init: any) => {
        if (options.networkError) throw new Error('private provider transport failure');
        if (options.timeout) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
        if (options.providerStatus) return new Response('private provider error', { status: options.providerStatus });
        if (options.oversize) return new Response('x'.repeat(270000));
        return new Response(JSON.stringify({ choices: [{ finish_reason: options.finishReason ?? 'stop', message: { content: options.content ?? JSON.stringify(options.plan ?? fixture()) } }] }));
      }, require(name: string) {
        if (name.includes('/http/server.ts')) return { serve: (fn: any) => { handler = fn; } };
        if (name.includes('supabase-js')) return { createClient: () => client };
        if (name.includes('entitlements')) return { requireEntitlement: async () => { if (options.gateError) throw new Error(); return { tier: options.free ? 'free' : 'pro' }; } };
        return load(new URL(name, url));
      },
    };
    Object.assign(context, globals);
    vm.runInContext(`(function(exports, require) { ${code}\n})`, context)(exports, globals.require);
    return exports;
  }
  load(new URL('./index.ts', import.meta.url));
  return { calls, replacements, request: (body: any = { action: 'generate' }, method = 'POST', url = 'https://fixture.invalid') => handler(new Request(url, { method, headers: { Authorization: 'Bearer fixture' }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) })) };
}
test('GET empty is success, failure is unavailable, and owner is auth-pinned', async () => {
  const api = host();
  const response = await api.request(undefined, 'GET', 'https://fixture.invalid?user_id=attacker');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { plan: null, meals: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(api.calls)), [{ rpc: 'read_meal_plan', args: { p_user_id: owner } }]);
  for (const options of [{ rpcError: true }, { readMalformed: true },
    { rows: { meal_plans: { id: 'p', user_id: 'other' } } },
    { rows: { meal_plans: { id: 'p', user_id: owner }, planned_meals: [{ user_id: 'other', plan_id: 'p' }] } },
    { rows: { meal_plans: { id: 'p', user_id: owner }, planned_meals: [{ user_id: owner, plan_id: 'wrong' }] } }]) {
    const failure = await host(options).request(undefined, 'GET');
    assert.equal(failure.status, 503);
    assert.equal((await failure.json()).code, 'MEAL_PLAN_UNAVAILABLE');
  }
  const unauth = host({ unauthorized: true });
  assert.equal((await unauth.request(undefined, 'GET')).status, 401);
  assert.equal(unauth.calls.length, 0);
});
test('GET never mixes old parent snapshot with replacement children sharing its ID', async () => {
  const generation = (revision: string) => ({
    plan: { id: 'same-parent', user_id: owner, targets_snapshot: { revision }, notes: revision },
    meals: fixture().meals.map(m => ({ ...m, plan_id: 'same-parent', user_id: owner, title: revision })),
  });
  const before = generation('A'), after = generation('B');
  const api = host({ rows: { meal_plans: before.plan, planned_meals: before.meals }, interleave: after });
  const response = await api.request(undefined, 'GET');
  assert.equal(response.status, 200);
  const { plan, meals } = await response.json();
  assert.equal(meals.length, 28);
  assert.equal(plan.notes, plan.targets_snapshot.revision);
  assert.ok(meals.every((m: any) => m.title === plan.targets_snapshot.revision), 'mixed parent/child generations');
});
for (const [label, options] of Object.entries({ missingKey: { missingKey: true }, network: { networkError: true }, truncated: { finishReason: 'length' }, invalidWeek: { plan: { meals: fixture().meals.map(m => ({ ...m, date: '2026-09-20' })) } }, provider429: { providerStatus: 429 }, timeout: { timeout: true }, oversize: { oversize: true }, malformed: { content: '{' }, incomplete: { plan: { meals: [] } }, duplicate: { plan: { meals: Array(28).fill(fixture().meals[0]) } }, invalidTotals: { plan: { meals: fixture().meals.map(m => ({ ...m, calories: 123 })) } } })) {
  test(`${label}: unavailable without replacement`, async () => { const api = host(options); const res = await api.request(); assert.equal(res.status, 503); assert.equal((await res.json()).code, 'MEAL_PLAN_UNAVAILABLE'); assert.equal(api.replacements.length, 0); });
}
test('each meal date uses its approved override and training flag', async () => {
  const plan = fixture();
  for (const meal of plan.meals.filter(m => m.day_of_week === 3)) {
    meal.is_training_day = true;
    meal.calories = 600; meal.items[0].calories = 600;
  }
  const api = host({ plan, rows: {
    profiles: { training_days: [3], training_days_per_week: 1, dietary_allergies: [] },
    nutrition_target_day_overrides: [{ user_id: owner, target_set_id: 'set', day_of_week: 3, source: 'manual', target: { ...macro, calories: 2400 } }],
  } });
  assert.equal((await api.request({ action: 'recalibrate' })).status, 200);
  const args = api.replacements[0].args;
  assert.equal(args.p_notes, 'Recalibrated from last 7 days logged.');
  assert.deepEqual(JSON.parse(JSON.stringify(args.p_targets_snapshot.days.map((d: any) => d.target.calories))), [2000,2000,2000,2400,2000,2000,2000]);
  assert.equal(args.p_targets_snapshot.days[3].is_training_day, true);
  assert.ok(api.calls.filter(c => c.table).every(c => c.filters.some(([k, v]: any[]) => k === 'user_id' && v === owner)));
});
test('RPC failure reports unavailable, not a fabricated commit', async () => {
  const api = host({ rpcError: true });
  const response = await api.request();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'MEAL_PLAN_UNAVAILABLE');
  assert.equal(api.replacements.length, 1);
});
test('valid provider plan uses owner-scoped atomic replacement with seven authoritative dates', async () => {
  const api = host(); const res = await api.request(); assert.equal(res.status, 200);
  assert.equal(api.replacements.length, 1); assert.equal(api.replacements[0].name, 'replace_meal_plan');
  assert.equal(api.replacements[0].args.p_user_id, owner); assert.equal(api.replacements[0].args.p_targets_snapshot.days.length, 7);
});
for (const [label, options, body, method, status] of [
  ['auth', { unauthorized: true }, undefined, 'POST', 401], ['free', { free: true }, undefined, 'POST', 403],
  ['entitlement failure', { gateError: true }, undefined, 'POST', 503], ['ownership', {}, { action: 'generate', user_id: 'other' }, 'POST', 400],
  ['unknown action', {}, { action: 'oops' }, 'POST', 400], ['invalid JSON', {}, '{', 'POST', 400], ['body size', {}, 'x'.repeat(9000), 'POST', 400],
  ['GET error', { fail: 'meal_plans' }, undefined, 'GET', 503], ['GET children error', { rows: { meal_plans: { id: 'p' } }, fail: 'planned_meals' }, undefined, 'GET', 503],
  ['allergy', { rows: { profiles: { dietary_allergies: ['peanut'] } } }, undefined, 'POST', 503], ['target read error', { fail: 'nutrition_target_sets' }, undefined, 'POST', 503],
  ['profile error', { fail: 'profiles' }, undefined, 'POST', 503], ['timezone error', { fail: 'notification_preferences' }, undefined, 'POST', 503],
  ['override error', { fail: 'nutrition_target_day_overrides' }, undefined, 'POST', 503], ['legacy error', { fail: 'nutrition_targets' }, undefined, 'POST', 503],
  ['recalibrate log error', { fail: 'food_logs' }, { action: 'recalibrate' }, 'POST', 503],
  ['missing targets', { rows: { nutrition_target_sets: null } }, undefined, 'POST', 409],
] as any[]) test(label, async () => { const api = host(options); assert.equal((await api.request(body, method)).status, status); assert.equal(api.replacements.length, 0); });
