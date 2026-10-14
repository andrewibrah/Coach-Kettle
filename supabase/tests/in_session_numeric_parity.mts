// Explicit offline runner: only the documented disposable socket/cluster.
// Start it separately; this script never discovers a linked DB or starts servers.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sourceModule } from '../../lib/__tests__/workoutIdentityHarness.ts';
import * as contract from '../../lib/workoutValidation.ts';
const scratch = process.env.I3_SCRATCH ?? '/Users/me/.hermes/profiles/telegramlite/cache/scratch';
assert.equal(realpathSync(`${scratch}/i3-pg-data`), `${scratch}/i3-pg-data`);
assert.equal(readFileSync(`${scratch}/i3-pg-data/PG_VERSION`, 'utf8').trim(), '15');
const lift = sourceModule('supabase/functions/_shared/liftMatching.ts', { './workoutValidation.ts': contract });
const cases: any[] = [
  ['100', '8'], ['0.15', '20'], ['0.33', '20'], ['0.7', '15'], ['0.75', '12'], ['1.5', '27'], ['1.45', '3'], ['1.35', '10'], ['0.15', '1'], ['1.005', '30'],
  [contract.numericText(Number.MAX_VALUE), '8'], [contract.numericText(1e308), '1'], [contract.numericText(1e307), '8'],
  [contract.numericText(1e-300), '8'], [contract.numericText(Number.MIN_VALUE), '8'],
  ['0.' + '0'.repeat(399) + '1', '8'], ['9'.repeat(310), '8'],
  ['NaN', '8'], ['Infinity', '8'], ['8oops', '8'], ['1e2', '8'], ['', '8'], ['0', '12'], ['100', '0'],
  ['100', '9007199254740991'], ['100', '9007199254740992'], ['100', '8', 'bogus'], ['100', '8', null, 'bogus'],
  ['100', '8', 'planned'], ['100', '8', 'performed', 'warmup'], ['100', '8', 'performed', 'work'],
];
// Decimal tie/representation controls, not clinical ranges.
for (const weight of ['0.05', '0.15', '0.45', '1.15', '1.45', '2.25', '100.05']) for (const reps of ['1', '3', '10', '30']) cases.push([weight, reps]);
const quote = (s: any) => s == null ? 'NULL' : `'${String(s).replaceAll("'", "''")}'`;
// null in this fixture's fifth column means legacy omission, not accepted JSON null.
for (const set of [0, '0', '00', 1, '01', null]) cases.push(['100', '8', undefined, undefined, set]);
const rows = cases.map(([weightLbs, reps, performance, setKind, set = 1], i) => ({ exercise: `Golden${i}`, weightLbs, reps,
  ...(set === null ? {} : { set }),
  ...(performance == null ? {} : { performance }), ...(setKind == null ? {} : { setKind }) }));
const values = rows.map(r => {
  const set = contract.numericValue(r.set, true);
  assert.equal(contract.validateWorkoutRow({ exercise: r.exercise, set: r.set }), null);
  // Same validated whole-number conversion as PostgreSQL's integer input; omission defaults to1 in log-set.
  const setNumber = set.kind === 'known' ? set.value : 1;
  return `('00000000-0000-0000-0000-000000000001','golden','2026-10-08',${quote(r.exercise)},${setNumber},${quote(r.weightLbs)},${quote(r.reps)},false,${quote(r.performance)},${quote(r.setKind)})`;
}).join(',\n');
let fixture = readFileSync('supabase/tests/in_session_numeric_integrity.sql', 'utf8');
fixture = fixture.replaceAll('\\ir ../migrations/', `\\ir ${process.cwd()}/supabase/migrations/`);
fixture = fixture.replace('ROLLBACK;', `
\\ir ${process.cwd()}/supabase/migrations/20261008000200_cardio_metric_capacity.sql
INSERT INTO public.pr_tracked_lifts SELECT '00000000-0000-0000-0000-000000000001', 'Golden'||g, true FROM generate_series(0,${rows.length - 1}) g;
INSERT INTO public.workout_log(user_id,workout_id,workout_date,exercise,set_number,weight_lbs,reps,is_cardio,performance,set_kind) VALUES ${values};
SELECT json_agg(json_build_object('exercise',wl.exercise,'raw',wl.weight_lbs,'setNumber',wl.set_number,'load',public.i3_load(wl.weight_lbs),'eligible',public.i3_strength_eligible(wl),'estimate',pl.estimated_1rm,'quarantined',q.id IS NOT NULL) ORDER BY wl.id) FROM public.workout_log wl LEFT JOIN public.pr_lifts pl ON pl.lift_name=wl.exercise LEFT JOIN public.i3_workout_numeric_quarantine q ON q.id=wl.id WHERE wl.workout_id='golden';
SELECT public.reconcile_workout_prs('00000000-0000-0000-0000-000000000001','2026-10-08');
SELECT json_agg(json_build_object('exercise',wl.exercise,'raw',wl.weight_lbs,'setNumber',wl.set_number,'load',public.i3_load(wl.weight_lbs),'eligible',public.i3_strength_eligible(wl),'estimate',pl.estimated_1rm,'quarantined',q.id IS NOT NULL) ORDER BY wl.id) FROM public.workout_log wl LEFT JOIN public.pr_lifts pl ON pl.lift_name=wl.exercise LEFT JOIN public.i3_workout_numeric_quarantine q ON q.id=wl.id WHERE wl.workout_id='golden';
ROLLBACK;`);
const path = `${scratch}/i3-spec-sql-parity-generated.sql`;
writeFileSync(path, fixture);
const output = execFileSync('/opt/homebrew/opt/postgresql@15/bin/psql', ['-h', `${scratch}/i3-pg-socket`, '-p', '55483', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'i3_apply_proposal=true', '-f', path], { encoding: 'utf8' });
assert.ok(output.includes('ROLLBACK'));
const snapshots = output.split('\n').filter((l: string) => l.startsWith('[{"exercise"')).map((l: string) => JSON.parse(l));
assert.equal(snapshots.length, 2);
assert.deepEqual(snapshots[1], snapshots[0], 'reconcile must preserve guarded estimates and raw quarantine');
const actual = snapshots[0];
assert.equal(actual.length, rows.length);
const failures: any[] = [];
for (const [i, row] of rows.entries()) {
  const load = contract.numericValue(row.weightLbs);
  const reps = contract.numericValue(row.reps, true);
  const estimate = load.kind === 'known' && reps.kind === 'known' ? lift.epley1rm(load.value, reps.value) : null;
  const eligible = contract.isStrengthEvidence(row) && load.kind === 'known' && load.value > 0 && reps.kind === 'known' && reps.value <= 2147483647 && estimate !== null;
  const observed = actual[i];
  try {
    assert.equal(observed.raw, row.weightLbs, 'raw evidence');
    assert.equal(observed.setNumber, row.set === undefined ? 1 : Number(row.set), 'normalized whole set number');
    assert.equal(observed.load === null ? null : Number(observed.load), load.kind === 'known' ? load.value : null, 'accepted numeric load');
    assert.equal(observed.eligible, eligible, 'guarded PR eligibility');
    assert.equal(observed.estimate === null ? null : Number(observed.estimate), eligible ? estimate : null, 'actual trigger PR/JS estimate');
    assert.equal(observed.quarantined, !eligible, 'quarantine');
  } catch (e) { failures.push({ i, row, observed, expected: { eligible, estimate }, error: String(e) }); }
}
console.log(JSON.stringify({ cases: rows.length, failures }, null, 2));
assert.equal(failures.length, 0);
