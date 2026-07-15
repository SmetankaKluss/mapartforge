#!/usr/bin/env bash
set -euo pipefail

for command_name in createdb initdb node pg_ctl psql tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required" >&2
    exit 1
  fi
done

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/mapkluss-backup-test.XXXXXX")
data_dir="$temp_dir/postgres"
socket_dir="$temp_dir/socket"
fixture_dir="$temp_dir/fixture"
bin_dir="$temp_dir/bin"
backup_dir="$temp_dir/backup"
port=$((54000 + RANDOM % 1000))
postgres_started=false

cleanup() {
  if [[ "$postgres_started" == true ]]; then
    pg_ctl -D "$data_dir" -m fast -w stop >/dev/null
  fi
  rm -rf "$temp_dir"
}
trap cleanup EXIT

mkdir -p "$socket_dir" "$fixture_dir" "$bin_dir" "$backup_dir"
initdb -D "$data_dir" --no-locale --encoding=UTF8 --username=postgres >/dev/null
pg_ctl -D "$data_dir" -o "-h 127.0.0.1 -p $port -k $socket_dir" -w start >/dev/null
postgres_started=true

createdb -h 127.0.0.1 -p "$port" -U postgres mapkluss_source
createdb -h 127.0.0.1 -p "$port" -U postgres mapkluss_restore_drill
source_url="postgresql://postgres@127.0.0.1:${port}/mapkluss_source"
target_url="postgresql://postgres@127.0.0.1:${port}/mapkluss_restore_drill"
psql "$target_url" -X -v ON_ERROR_STOP=1 -c "comment on database mapkluss_restore_drill is 'mapkluss-disposable-restore-target'" >/dev/null

cat >"$fixture_dir/roles.sql" <<'SQL'
DO $$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;
SQL

cat >"$fixture_dir/schema.sql" <<'SQL'
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA supabase_migrations;
CREATE EXTENSION pgcrypto;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (id uuid PRIMARY KEY);
CREATE TABLE public.arts (id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.art_versions (id uuid PRIMARY KEY, art_id uuid NOT NULL, owner_id uuid NOT NULL);
CREATE TABLE public.art_artifacts (id uuid PRIMARY KEY, art_id uuid NOT NULL, version_id uuid NOT NULL, owner_id uuid NOT NULL);
CREATE TABLE public.favorites (id uuid PRIMARY KEY);
CREATE TABLE public.collections (id uuid PRIMARY KEY);
CREATE TABLE public.collection_items (id uuid PRIMARY KEY);
CREATE TABLE public.companion_imports (id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.build_sessions (id uuid PRIMARY KEY);
CREATE TABLE public.companion_lens_sessions (id uuid PRIMARY KEY, owner_id uuid NOT NULL);
CREATE TABLE public.companion_lens_placements (id uuid PRIMARY KEY, session_id uuid NOT NULL, owner_id uuid NOT NULL);
CREATE TABLE public.companion_lens_subscribers (id uuid PRIMARY KEY);
CREATE TABLE public.companion_lens_reports (id uuid PRIMARY KEY);
CREATE TABLE storage.buckets (id text PRIMARY KEY);
CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL, metadata jsonb);
CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
SQL

cat >"$fixture_dir/data.sql" <<'SQL'
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.arts VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');
INSERT INTO public.art_versions VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');
INSERT INTO public.art_artifacts VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001');
INSERT INTO public.favorites VALUES ('00000000-0000-0000-0000-000000000005');
INSERT INTO public.collections VALUES ('00000000-0000-0000-0000-000000000006');
INSERT INTO public.collection_items VALUES ('00000000-0000-0000-0000-000000000007');
INSERT INTO public.companion_imports VALUES ('00000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001');
INSERT INTO public.build_sessions VALUES ('00000000-0000-0000-0000-000000000009');
INSERT INTO public.companion_lens_sessions VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001');
INSERT INTO public.companion_lens_placements VALUES ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001');
INSERT INTO public.companion_lens_subscribers VALUES ('00000000-0000-0000-0000-000000000012');
INSERT INTO public.companion_lens_reports VALUES ('00000000-0000-0000-0000-000000000013');
INSERT INTO storage.buckets VALUES ('mapartforge');
INSERT INTO storage.objects VALUES ('00000000-0000-0000-0000-000000000014', 'mapartforge', 'fixture.png', '{"size": "123"}');
INSERT INTO supabase_migrations.schema_migrations VALUES ('fixture');
SQL

cat >"$bin_dir/supabase" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

output_file=
kind=schema
while (($# > 0)); do
  case "$1" in
    -f)
      output_file=$2
      shift 2
      ;;
    --role-only)
      kind=roles
      shift
      ;;
    --data-only)
      kind=data
      shift
      ;;
    *)
      shift
      ;;
  esac
done

test -n "$output_file"
cp "$MAPKLUSS_TEST_FIXTURE_DIR/${kind}.sql" "$output_file"
SH
chmod 700 "$bin_dir/supabase"

psql "$source_url" -X -v ON_ERROR_STOP=1 \
  -f "$fixture_dir/schema.sql" \
  -f "$fixture_dir/data.sql" >/dev/null

PATH="$bin_dir:$PATH" \
  MAPKLUSS_SUPABASE_CLI_BIN="$bin_dir/supabase" \
  MAPKLUSS_TEST_FIXTURE_DIR="$fixture_dir" \
  MAPKLUSS_BACKUP_DIR="$backup_dir" \
  MAPKLUSS_BACKUP_TIMESTAMP="test-fixture" \
  SUPABASE_DB_URL="$source_url" \
  "$script_dir/backup-postgres.sh" >/dev/null

archive_path="$backup_dir/mapkluss-postgres-test-fixture.tar.gz"
if MAPKLUSS_RESTORE_DB_URL="postgresql://postgres@127.0.0.1:${port}/postgres" \
  MAPKLUSS_ALLOW_DESTRUCTIVE_RESTORE=disposable-only \
  "$script_dir/restore-drill.sh" "$archive_path" >/dev/null 2>&1; then
  echo "Restore safety guard accepted the postgres database without disposable-stack acknowledgement" >&2
  exit 1
fi

MAPKLUSS_RESTORE_DB_URL="$target_url" \
  MAPKLUSS_ALLOW_DESTRUCTIVE_RESTORE=disposable-only \
  "$script_dir/restore-drill.sh" "$archive_path" >/dev/null

if MAPKLUSS_RESTORE_DB_URL="$target_url" \
  MAPKLUSS_ALLOW_DESTRUCTIVE_RESTORE=disposable-only \
  "$script_dir/restore-drill.sh" "$archive_path" >/dev/null 2>&1; then
  echo "Restore safety guard accepted a non-empty target" >&2
  exit 1
fi

echo "Backup tooling fixture and disposable restore drill passed"
