import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const exports: any = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./nutritionTargetLoading.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const owner = 'owner';
const generation = (calories: number) => ({ id: 'same-parent', user_id: owner, base_target: { calories }, source: 'local_draft', provenance: null, day_overrides: [{ id: `child-${calories}`, user_id: owner, target_set_id: 'same-parent', day_of_week: 2, target: { calories }, source: 'local_draft', updated_at: `${calories}` }] });
function host(options: any = {}) {
  let committed = generation(2100);
  const calls: any[] = [];
  const client: any = {
    rpc: async (name: string, args: any) => { calls.push({ name, args }); const data = structuredClone(committed); committed = generation(2500); return options.rpcResult ?? { data, error: null }; },
    from(table: string) {
      calls.push({ table });
      const result = () => {
        if (table === 'nutrition_targets') return { data: options.legacy ?? null, error: options.legacyError ?? null };
        if (table === 'nutrition_target_day_overrides') return { data: committed.day_overrides, error: null };
        const data: any = structuredClone(committed); delete data.day_overrides;
        committed = generation(2500); return { data, error: null };
      };
      const q: any = { select: () => q, eq: () => q, maybeSingle: async () => result(), then: (yes: any) => Promise.resolve(result()).then(yes) }; return q;
    },
  };
  return { client, calls };
}
test('loader stays on generation A when save B commits after parent snapshot', async () => {
  const h = host();
  const result = await exports.loadApprovedNutritionTargetInputs(h.client, owner);
  assert.deepEqual(JSON.parse(JSON.stringify(result.savedTargets)), generation(2100));
  assert.equal(h.calls.filter(c => c.table?.startsWith('nutrition_target_')).length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(c => c.name))), { name: 'read_nutrition_target_set', args: { p_user_id: owner } });
});
test('loader distinguishes absent saved row, failed read, malformed children and ownership', async () => {
  const legacy = { user_id: owner, training_calories: 1900 };
  const empty = host({ rpcResult: { data: null, error: null }, legacy });
  assert.deepEqual(JSON.parse(JSON.stringify(await exports.loadApprovedNutritionTargetInputs(empty.client, owner))), { savedTargets: null, legacyTargets: legacy });
  for (const options of [
    { rpcResult: { data: null, error: { code: '42501' } } },
    { legacyError: {} }, { legacy: { user_id: 'other' } },
    ...[{}, [], { ...generation(2100), user_id: 'other' }, { ...generation(2100), day_overrides: null }, { ...generation(2100), day_overrides: [{ user_id: 'other', target_set_id: 'same-parent' }] }, { ...generation(2100), day_overrides: [{ user_id: owner, target_set_id: 'other' }] }].map(data => ({ rpcResult: { data, error: null } })),
  ]) await assert.rejects(exports.loadApprovedNutritionTargetInputs(host(options).client, owner));
  await assert.rejects(exports.loadApprovedNutritionTargetInputs(host().client, ''));
});
