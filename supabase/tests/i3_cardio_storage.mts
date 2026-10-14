// Offline actual handlers -> real disposable SQL. Never discovers DB URLs.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import { decideAndParse } from '../../lib/structuredGate.ts';
import * as contract from '../../lib/workoutValidation.ts';
import { sourceModule } from '../../lib/__tests__/workoutIdentityHarness.ts';
const scratch = process.env.I3_SCRATCH ?? '/Users/me/.hermes/profiles/telegramlite/cache/scratch';
assert.equal(realpathSync(`${scratch}/i3-pg-data`), `${scratch}/i3-pg-data`);
assert.equal(readFileSync(`${scratch}/i3-pg-data/PG_VERSION`, 'utf8').trim(), '15');
const psql = (sql: string) => execFileSync('/opt/homebrew/opt/postgresql@15/bin/psql', ['-h', `${scratch}/i3-pg-socket`, '-p', '55483', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'i3_apply_proposal=true'], { input: sql, encoding: 'utf8' });
assert.equal(psql("SELECT current_setting('listen_addresses');").trim(), '', 'TCP must be disabled');
const lift = sourceModule('supabase/functions/_shared/liftMatching.ts', { './workoutValidation.ts': contract });
const parsed = decideAndParse('Run 5min HR 120.5 12.5cal level 1.5', {});
assert.equal(parsed.kind, 'fast');
if (parsed.kind !== 'fast') throw new Error('parser failed');
assert.equal(parsed.rows[0].heartRate, 120.5);
assert.equal(parsed.rows[0].calories, 12.5);
assert.equal(parsed.rows[0].level, 1.5);
const base = { exercise: 'Run', set: 1, isCardio: true, durationMins: 5, weightLbs: '', reps: '', notes: 'literal raw evidence' };
const cases = [parsed.rows[0], ...[0, 2147483648, Number.MAX_SAFE_INTEGER, 1e100, Number.MAX_VALUE, Number.MIN_VALUE].map(value => ({ ...base, heartRate: value, calories: value, level: value })), base];
let checks = 0;
// SUPERSEDED (handler phase) since P4: log-set/history now write through the apply_workout_operation RPC,
// which this runner mocks. The same 8-value cardio matrix runs through the REAL Edge handlers and the REAL RPC
// in supabase/tests/p4_edge_sql.mts (capacity-row loop) on disposable PG15; use that as the cardio storage gate.
const handlers = process.env.I3_CARDIO_HANDLER ? [process.env.I3_CARDIO_HANDLER] : ['log-set', 'history'];
assert.ok(handlers.every(name => ['log-set', 'history'].includes(name)));
for (const name of handlers) for (const row of cases) {
  assert.equal(contract.validateWorkoutRow(row, true), null);
  let handler: any; let observed: any;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: '00000000-0000-0000-0000-000000000001' } }, error: null }) },
    rpc: async () => ({ error: null }), // Reconcile actually exercised inside SQL fixture; not deployed RPC.
    from(table: string) {
      let record: any;
      const chain: any = {
        select() { return chain; }, eq() { return chain; }, in() { return chain; }, limit() { return chain; }, order() { return chain; }, delete() { return chain; },
        upsert(value: any) { record = value; return chain; },
        single: async () => ({ data: record, error: null }), // Envelope-only offline capture, not a workouts DB claim.
        insert(value: any) {
          assert.equal(table, 'workout_log');
          const rows = Array.isArray(value) ? value : [value];
          const fields = ['user_id','workout_id','workout_date','exercise','set_number','weight_lbs','reps','notes','created_at','is_cardio','duration_mins','distance','distance_unit','heart_rate','calories','level','performance','set_kind'];
          const json = JSON.stringify(rows).replaceAll("'", "''");
          let fixture = readFileSync('supabase/tests/in_session_numeric_integrity.sql', 'utf8').replaceAll('\\ir ../migrations/', `\\ir ${process.cwd()}/supabase/migrations/`);
          const proposal = `${process.cwd()}/supabase/migrations/20261008000200_cardio_metric_capacity.sql`;
          // RED: absent proposal leaves real legacy INTEGER projection, which must fail.
          const apply = process.env.I3_CARDIO_APPLY === 'true' ? `\\ir ${proposal}\n` : '';
          fixture = fixture.replace('ROLLBACK;', () => `
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workout_log' AND column_name IN ('heart_rate','calories','level') AND data_type <> 'integer') THEN RAISE EXCEPTION 'fixture must start with actual INTEGER columns'; END IF;
END $$;
INSERT INTO public.workout_log(exercise,is_cardio,heart_rate,calories,level,weight_lbs,reps,notes) VALUES ('LegacyCardio',true,-1,2147483647,0,'NaN','8oops','unchanged legacy');
${apply}
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.workout_log WHERE exercise='LegacyCardio' AND heart_rate=-1 AND calories=2147483647 AND level=0 AND weight_lbs='NaN' AND reps='8oops' AND notes='unchanged legacy') THEN RAISE EXCEPTION 'legacy evidence changed'; END IF;
END $$;
INSERT INTO public.workout_log (${fields.join(',')}) SELECT ${fields.join(',')} FROM json_populate_recordset(NULL::public.workout_log, '${json}'::json);
SELECT 'CARDIO:' || row_to_json(x)::text FROM (SELECT ${fields.join(',')} FROM public.workout_log WHERE exercise='Run' ORDER BY id DESC LIMIT 1) x;
${apply ? `DO $$ DECLARE metric text; token text; BEGIN
 FOREACH metric IN ARRAY ARRAY['heart_rate','calories','level'] LOOP
  FOREACH token IN ARRAY ARRAY['NaN','Infinity','-Infinity','1e309'] LOOP
   BEGIN
    EXECUTE format('INSERT INTO public.workout_log(exercise,is_cardio,%I) VALUES (%L,true,%L::numeric)',metric,'guard-reject',token);
    RAISE EXCEPTION 'finite guard accepted % %',metric,token;
   EXCEPTION WHEN check_violation THEN NULL;
   END;
  END LOOP;
 END LOOP;
END $$;` : ''}
ROLLBACK;`);
          writeFileSync(`${scratch}/i3-cardio-last.sql`, fixture);
          try {
            const output = psql(fixture);
            assert.ok(output.includes('ROLLBACK'));
            observed = JSON.parse(output.split('\n').find(line => line.startsWith('CARDIO:'))!.slice(7));
            return Promise.resolve({ error: null }); // Only real successful SQL insert/readback yields success.
          } catch (error) { return Promise.resolve({ error: { message: String(error) } }); }
        },
        then(resolve: any, reject: any) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
      };
      return chain;
    },
  };
  const dependencies: any = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: any) => handler = fn },
    'https://esm.sh/@supabase/supabase-js@2.50.1': { createClient: () => client },
    '../_shared/liftMatching.ts': lift, '../_shared/workoutValidation.ts': contract,
    '../_shared/operationErrors.ts': sourceModule('supabase/functions/_shared/operationErrors.ts'),
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(`supabase/functions/${name}/index.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: {}, require: (key: string) => { assert.ok(key in dependencies, key); return dependencies[key]; },
    Deno: { env: { get: () => 'offline-only' } }, Response, URL, console,
  });
  const body = name === 'log-set' ? row : { id: 'offline-cardio', part: 'Cardio', dateISO: '2026-10-08', rows: [row] };
  const response = await handler(new Request(`https://offline.invalid/${name}`, { method: 'POST', headers: { Authorization: 'Bearer offline', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  assert.ok(observed, `${name}: actual SQL projection/insert failed (HTTP ${response.status} alone is not proof)`);
  assert.equal(response.status, 200);
  for (const [input, column] of [['heartRate','heart_rate'],['calories','calories'],['level','level']] as const) assert.equal(observed[column], (row as any)[input] ?? null, `${name} ${column} exact JS numeric readback`);
  assert.equal(observed.notes, row.notes || null);
  assert.equal(observed.weight_lbs, String(row.weightLbs ?? ''));
  assert.equal(observed.reps, String(row.reps ?? ''));
  assert.equal(observed.is_cardio, true);
  checks++;
}
assert.equal(psql("SELECT to_regclass('public.workout_log') IS NULL;").trim(), 't');
console.log(JSON.stringify({ handlerSqlReadbacks: checks, failures: 0, rolledBack: true }));
