#!/bin/bash
# PG15 minimal-bootstrap proof, NOT full Supabase PG17/PostgREST coverage.
# ONLY a fresh private PostgreSQL cluster; never uses an existing connection.
set -euo pipefail
[[ ${NUTRITION_DISPOSABLE_TEST:-} == YES ]] || { printf 'Set NUTRITION_DISPOSABLE_TEST=YES to create a disposable cluster\n' >&2; exit 2; }
[[ $# == 0 || ( $# == 1 && $1 == --red ) ]] || exit 2
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
BIN=/opt/homebrew/opt/postgresql@15/bin
for name in $(compgen -v PG); do unset "$name"; done
umask 077
TMP=$(mktemp -d /tmp/ck-coach.XXXXXX)
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -f "$TMP/data/postmaster.pid" ]]; then
    "$BIN/pg_ctl" -D "$TMP/data" -m immediate -w stop >/dev/null || status=1
  fi
  if [[ -f "$TMP/data/postmaster.pid" || -S "$TMP/socket/.s.PGSQL.5432" ]]; then
    printf 'ERROR: owned cluster cleanup failed; retained directory\n' >&2
    exit 1
  fi
  rm -rf "$TMP"
  [[ ! -e "$TMP" ]] || exit 1
  printf 'Disposable cluster stopped; PID/socket absent; owned directory removed\n'
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$TMP/socket" "$TMP/config"
: > "$TMP/config/pgpass"
: > "$TMP/config/pg_service.conf"
export PGPASSFILE="$TMP/config/pgpass" PGSERVICEFILE="$TMP/config/pg_service.conf" PGSYSCONFDIR="$TMP/config"
"$BIN/initdb" -D "$TMP/data" -A trust -U postgres --no-locale >/dev/null
"$BIN/pg_ctl" -D "$TMP/data" -l "$TMP/server.log" -o "-k $TMP/socket -c listen_addresses=''" -w start >/dev/null
export PGHOST="$TMP/socket" PGPORT=5432 PGUSER=postgres PGDATABASE=postgres
PSQL=("$BIN/psql" -X -w -v ON_ERROR_STOP=1)
"${PSQL[@]}" <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS
 'BEGIN NEW.updated_at = now(); RETURN NEW; END';
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
DO $$ BEGIN
 ASSERT current_setting('listen_addresses') = '', 'must not listen on TCP';
END $$;
SQL
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0033_nutrition_system.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0034_coaching_system.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0042_behavior_events_idempotent.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/0044_neutral_day_event.sql"
"${PSQL[@]}" -c 'CREATE TABLE public.notification_preferences(user_id uuid PRIMARY KEY, timezone text);'
if [[ ${1:-} != --red ]]; then
 "${PSQL[@]}" -f "$ROOT/supabase/migrations/20260919000100_atomic_coach_persistence.sql"
fi
"${PSQL[@]}" -f "$ROOT/supabase/tests/coach_persistence.sql"
if [[ ${1:-} != --red ]]; then
 bash "$ROOT/supabase/tests/coach_concurrency.sh"
fi
