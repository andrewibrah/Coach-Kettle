import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Isolate real backend function declarations: no server startup, credentials,
// database writes or invented remote receipts. Inputs below are test fixtures.
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
function load(name: string, globals: Record<string, unknown> = {}) {
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration, `Missing backend function ${name}`);
  const js = ts.transpileModule(declaration.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${js}; ${name}`, globals);
}
test('totals RPC failure is not fabricated as zero intake', async () => {
  const getTotals = load('getNutritionTotals');
  await assert.rejects(getTotals({ rpc: async () => ({ data: null, error: new Error('fixture unavailable') }) }, 'fixture-user', '2026-09-07'));
});

test('totals require a real aggregate row and retain its atomic log count', async () => {
  const getTotals = load('getNutritionTotals');
  await assert.rejects(getTotals({ rpc: async () => ({ data: null, error: null }) }, 'fixture-user', '2026-09-07'));
  const row = { calories: 100, protein_g: 10, carbs_g: 10, fat_g: 2, fiber_g: 1, saturated_fat_g: 0, log_count: 1 };
  const totals = await getTotals({ rpc: async (_: any, args: any) => {
    assert.equal(args.p_date, '2026-09-07'); return { data: [row], error: null };
  } }, 'fixture-user', '2026-09-07');
  assert.equal(totals.log_count, 1);
});

const buildNarrative = load('buildNarrative');
test('partial logs describe recorded gaps without calling the whole day a success or prescribing extra food', () => {
  const report = buildNarrative({ tone: 'accountability', nutritionColor: 'red', workoutDone: false,
    wasWorkoutDay: true, gaps: { calorie_gap: -1500, protein_gap_g: -100 }, streak: 0, badStreak: 3 });
  assert.match(report.needs_improvement, /recorded|logged/i);
  assert.match(report.needs_improvement, /incomplete/i);
  assert.doesNotMatch(JSON.stringify(report), /Under-fueling|Add a 200|Stop debating|non-negotiable|days in a row/);
});

const base = { tone: 'supportive', nutritionColor: null, workoutDone: false, wasWorkoutDay: false, gaps: {}, streak: 0, badStreak: 0 };

test('absent nutrition evidence never becomes a zero-gap calorie success', () => {
  const report = buildNarrative(base);
  assert.doesNotMatch(JSON.stringify(report), /close to target|You logged|Nothing flagged|Hit your macros/);
  assert.match(report.needs_improvement, /not enough|unavailable/i);
});

function workoutClient(count: number | null, error: unknown, writes: string[] = []) {
  return { from(table: string) {
    const query: any = {
      select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: { training_days: [1], training_calories: 2000, training_protein_g: 150, timezone: 'UTC' }, error: null }),
      then: (resolve: any) => resolve({ count, error }),
      upsert: (value: any) => {
        writes.push(table);
        const result: any = { then: (resolve: any) => resolve({ data: value, error: null }), select: () => result, single: async () => ({ data: value, error: null }) };
        return result;
      },
    };
    return query;
  }};
}
test('workout query errors and missing counts are not absence evidence', async () => {
  for (const error of [{ message: 'fixture offline' }, null]) {
    const get = load('getWorkoutDoneForDate', { admin: workoutClient(null, error) });
    await assert.rejects(() => get('fixture-user', '2026-09-07'), /workout evidence/i);
  }
});
test('a successful workout count distinguishes absent from completed', async () => {
  for (const count of [0, 1]) {
    const get = load('getWorkoutDoneForDate', { admin: workoutClient(count, null) });
    assert.equal(await get('fixture-user', '2026-09-07'), count > 0);
  }
});
test('unavailable workout evidence aborts regeneration before any writes or behavior changes', async () => {
  for (const error of [{ message: 'fixture offline' }, null]) {
    const writes: string[] = [];
    let behaviorChanges = 0;
    const admin = workoutClient(null, error, writes);
    const generate = load('generateFeedback', {
      admin, todayInTz: () => '2026-09-08',
      dayOfWeekFromDate: () => 1,
      getNutritionTotals: async () => ({ calories: 0, protein: 0, carbs: 0, fat: 0, log_count: 0 }),
      getWorkoutDoneForDate: load('getWorkoutDoneForDate', { admin }),
      gradeNutrition: () => ({ color: 'green', score: 100, calorieGap: 0, proteinGap: 0 }),
      updateBehaviorState: async () => { behaviorChanges++; return { level: 1, goodStreak: 0, badStreak: 1 }; },
      buildNarrative: () => [],
    });
    await assert.rejects(() => generate(admin, 'fixture-user', '2026-09-07'), /workout evidence/i);
    assert.equal(behaviorChanges, 0);
    assert.deepEqual(writes, []);
  }
});
