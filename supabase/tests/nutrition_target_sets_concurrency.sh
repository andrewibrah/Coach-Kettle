#!/bin/bash
# Separate real psql sessions; only explicitly opted-in private disposable targets.
set -euo pipefail
[[ ${NUTRITION_DISPOSABLE_TEST:-} == YES && -n ${NUTRITION_TEST_SOCKET:-} && -n ${NUTRITION_TEST_DATABASE:-} && -n ${NUTRITION_TEST_USER:-} && -n ${NUTRITION_TEST_PORT:-} ]] || {
  printf 'Requires NUTRITION_DISPOSABLE_TEST=YES and explicit disposable socket/database/user/port\n' >&2; exit 2;
}
# No URLs, inherited PG connection options, password discovery, or TCP targets.
# Isolate Python from PYTHON* settings so safety/evidence assertions stay enabled.
/usr/bin/python3 -I - <<'PY'
import json
import os
import pathlib
import queue
import signal
import stat
import subprocess
import tempfile
import threading
import time
import uuid

socket = os.environ['NUTRITION_TEST_SOCKET']
port = os.environ['NUTRITION_TEST_PORT']
assert port.isdigit() and 1 <= int(port) <= 65535, 'invalid port'
p = pathlib.Path(socket)
assert p.is_absolute() and p.name == 'socket' and p.parent.name.startswith('ck-nutrition.'), 'not a private disposable socket'
assert p.parent.parent.resolve() == pathlib.Path('/tmp').resolve(), 'not a disposable temp cluster'
assert p.parent.stat().st_uid == os.getuid() and stat.S_IMODE(p.parent.stat().st_mode) == 0o700, 'cluster directory must be owned/private'
assert stat.S_ISSOCK((p / ('.s.PGSQL.' + port)).stat().st_mode), 'socket absent'
assert (p.parent / 'data/postmaster.pid').is_file(), 'disposable cluster PID absent'
env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
env.update(PGHOST=socket, PGPORT=port, PGDATABASE=os.environ['NUTRITION_TEST_DATABASE'], PGUSER=os.environ['NUTRITION_TEST_USER'])
for k in ('PGDATABASE', 'PGUSER'):
    assert env[k] and all(c.isalnum() or c == '_' for c in env[k]), 'simple database/user name required'
clients = []
owned = []

def interrupted(signum, frame):
    raise RuntimeError('concurrency runner interrupted')

signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)

class Session:
    def __init__(self):
        self.proc = subprocess.Popen(['/opt/homebrew/opt/postgresql@15/bin/psql', '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                                     env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.lines = queue.Queue()
        clients.append(self)
        threading.Thread(target=self.pump, daemon=True).start()
        self.query("SET statement_timeout='20s'; SET idle_in_transaction_session_timeout='30s';")
        self.pid = int(self.query('SELECT pg_backend_pid();')[0])

    def pump(self):
        for line in self.proc.stdout:
            self.lines.put(line.rstrip('\n'))
        self.lines.put(None)

    def send(self, sql):
        self.marker = 'done_' + uuid.uuid4().hex
        self.proc.stdin.write(sql + '\n\\echo ' + self.marker + '\n')
        self.proc.stdin.flush()

    def receive(self):
        rows = []
        deadline = time.monotonic() + 25
        while True:
            line = self.lines.get(timeout=max(0.01, deadline - time.monotonic()))
            if line is None:
                raise RuntimeError('psql exited: ' + '\n'.join(rows))
            if line == self.marker:
                return rows
            rows.append(line)
            if time.monotonic() > deadline:
                raise TimeoutError('psql response timeout')

    def query(self, sql):
        self.send(sql)
        return self.receive()

    def close(self):
        if self.proc.poll() is None:
            self.proc.stdin.write('ROLLBACK;\n\\q\n')
            self.proc.stdin.flush()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.terminate()
                self.proc.wait(timeout=3)

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def payload(calories, days):
    targets = {'base': {'calories': calories}}
    if days is not None:
        targets['day_overrides'] = [{'day_of_week': day, 'target': {'calories': calories + day}} for day in days]
    return {'source': 'manual', 'provenance': {'user_confirmed': True, 'edited_after_suggestion': False}, 'targets': targets}

def rpc(user, body):
    return 'SELECT public.save_nutrition_target_set_atomic(' + literal(user) + '::uuid,' + literal(json.dumps(body)) + '::jsonb);'

def snapshot(user):
    return """SELECT jsonb_build_object('saved_target_set_id',s.id,'user_id',s.user_id,'source',s.source,
      'updated_at',s.updated_at,'targets',to_jsonb(s)||jsonb_build_object('day_overrides',
      (SELECT coalesce(jsonb_agg(jsonb_build_object('day_of_week',d.day_of_week,'target',d.target,
       'source',d.source,'updated_at',d.updated_at) ORDER BY d.day_of_week),'[]'::jsonb)
       FROM public.nutrition_target_day_overrides d WHERE d.target_set_id=s.id)))
      FROM public.nutrition_target_sets s WHERE s.user_id=""" + literal(user) + ';'

def child_rows(user):
    return "SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY day_of_week),'[]'::jsonb) FROM public.nutrition_target_day_overrides d WHERE user_id=" + literal(user) + ';'

with tempfile.TemporaryDirectory(prefix='ck-nutrition-client.') as config:
    for name in ('pgpass', 'pg_service.conf'):
        path = pathlib.Path(config) / name
        path.touch(mode=0o600)
    env.update(PGPASSFILE=config + '/pgpass', PGSERVICEFILE=config + '/pg_service.conf', PGSYSCONFDIR=config)
    control = Session()
    try:
        assert control.query("SELECT current_setting('listen_addresses') = ''; ") == ['t'], 'TCP listener forbidden'
        # Each scenario owns a distinct randomly generated auth fixture.
        for scenario, seed, second_days in [('first saves', False, [2, 4]), ('replacements', True, [2, 4]), ('omitted overrides', True, None)]:
            user = str(uuid.uuid4())
            control.query('INSERT INTO auth.users(id) VALUES (' + literal(user) + ') RETURNING id;')
            owned.append(user)
            if seed:
                control.query(rpc(user, payload(900.125, [0, 6])))
            before = control.query(snapshot(user))
            a, b = Session(), Session()
            # A's completed RPC is the deterministic barrier: its transaction stays open.
            a.query('BEGIN; SET LOCAL ROLE service_role;')
            receipt_a = json.loads(a.query(rpc(user, payload(1100.125, [1, 5])))[0])
            assert receipt_a == json.loads(a.query(snapshot(user))[0]), 'A receipt differs from its exact transaction snapshot'
            children_a = a.query(child_rows(user))
            b.query('BEGIN; SET LOCAL ROLE service_role;')
            b.send(rpc(user, payload(2200.875, second_days)))
            deadline = time.monotonic() + 10
            while True:
                blocked = control.query(f"SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid={b.pid} AND locktype='advisory' AND NOT granted) AND {a.pid}=ANY(pg_blocking_pids({b.pid}));")[0]
                if blocked == 't':
                    break
                if b.proc.poll() is not None or time.monotonic() > deadline:
                    raise AssertionError('B did not block on A per-user advisory lock')
                time.sleep(0.02)
            assert control.query(snapshot(user)) == before, 'uncommitted A leaked to another session'
            a.query('COMMIT;')
            receipt_b = json.loads(b.receive()[0])
            assert receipt_b == json.loads(b.query(snapshot(user))[0]), 'B receipt differs from its exact transaction snapshot'
            assert receipt_a['targets']['base_target']['calories'] == 1100.125
            assert receipt_b['targets']['base_target']['calories'] == 2200.875
            expected_days = [1, 5] if second_days is None else second_days
            assert [d['day_of_week'] for d in receipt_b['targets']['day_overrides']] == expected_days, 'union/lost overrides'
            if second_days is None:
                assert b.query(child_rows(user)) == children_a, 'omission failed to preserve serialized predecessor IDs/timestamps'
                assert receipt_b['targets']['day_overrides'] == receipt_a['targets']['day_overrides']
            else:
                assert all(d['target']['calories'] == 2200.875 + d['day_of_week'] for d in receipt_b['targets']['day_overrides']), 'mixed child receipt'
            b.query('COMMIT;')
            assert receipt_b == json.loads(control.query(snapshot(user))[0]), 'final state differs from B receipt'
            assert receipt_a != receipt_b, 'receipts unexpectedly collapsed'
            a.close()
            b.close()
            print('PASS concurrent ' + scenario + ': advisory barrier, isolated receipts, exact final snapshot', flush=True)
        # Coherent read: acquire a statement snapshot, pause at a real advisory
        # lock barrier, commit B, then finish that SAME statement. Parent IDs
        # are deliberately reused; compare full child IDs/timestamps/values.
        for role in ('service_role', 'authenticated'):
            user = str(uuid.uuid4())
            control.query('INSERT INTO auth.users(id) VALUES (' + literal(user) + ');')
            owned.append(user)
            control.query(rpc(user, payload(2100, [6, 0, 3])))
            reader, writer = Session(), Session()
            reader.query('SET ROLE ' + role + '; SELECT set_config(\'request.jwt.claim.sub\',' + literal(user) + ',false);')
            read = 'public.read_nutrition_target_set(' + literal(user) + '::uuid)'
            expected_a = json.loads(reader.query('SELECT ' + read + ';')[0])
            writer.query('BEGIN; SET LOCAL ROLE service_role;')
            writer.query(rpc(user, payload(2500, [6, 0, 3])))
            expected_b = json.loads(writer.query('SELECT ' + read + ';')[0])
            assert expected_a['id'] == expected_b['id'], 'test must reuse parent id'
            assert expected_a['updated_at'] != expected_b['updated_at']
            for old, new in zip(expected_a['day_overrides'], expected_b['day_overrides']):
                assert old['id'] != new['id'] and old['updated_at'] != new['updated_at']
                assert old['target']['calories'] == 2100 + old['day_of_week']
                assert new['target']['calories'] == 2500 + new['day_of_week']
            control.query('SELECT pg_advisory_lock(918273645);')
            reader.send('WITH barrier AS MATERIALIZED (SELECT pg_advisory_xact_lock(918273645)) SELECT ' + read + ' FROM barrier;')
            deadline = time.monotonic() + 10
            while control.query(f'SELECT {control.pid}=ANY(pg_blocking_pids({reader.pid}));') != ['t']:
                assert time.monotonic() < deadline, 'read statement barrier timeout'
                time.sleep(0.01)
            writer.query('COMMIT;')
            control.query('SELECT pg_advisory_unlock(918273645);')
            assert json.loads(reader.receive()[0]) == expected_a, 'statement snapshot mixed A parent / B children'
            assert json.loads(reader.query('SELECT ' + read + ';')[0]) == expected_b, 'next statement did not see entire B generation'
            assert [d['day_of_week'] for d in expected_b['day_overrides']] == [0, 3, 6]
            reader.close()
            writer.close()
            print('PASS coherent read/save ' + role + ': same parent, exact A/B children IDs/timestamps/values, statement barrier', flush=True)
    finally:
        for client in clients:
            if client is not control:
                client.close()
        if owned:
            ids = ','.join(literal(u) for u in owned)
            control.query('DELETE FROM auth.users WHERE id IN (' + ids + ');')
            for table, column in [('auth.users', 'id'), ('public.nutrition_target_sets', 'user_id'), ('public.nutrition_target_day_overrides', 'user_id')]:
                assert control.query(f'SELECT count(*) FROM {table} WHERE {column} IN ({ids});') == ['0'], 'fixture cleanup failed'
            print('Concurrency fixture cleanup verified: owned auth/parent/child rows absent', flush=True)
        control.close()
        assert all(c.proc.poll() is not None for c in clients), 'psql child still running'
        print('All concurrency psql sessions exited', flush=True)
PY
