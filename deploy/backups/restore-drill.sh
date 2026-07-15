#!/usr/bin/env bash
set -euo pipefail

archive_path=${1:-}
target_url=${MAPKLUSS_RESTORE_DB_URL:-}
restore_mode=${MAPKLUSS_RESTORE_MODE:-empty}
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
inventory_sql="$script_dir/../migration/inventory.sql"
source_inventory="$archive_path.inventory.json"
target_inventory=$(mktemp "${TMPDIR:-/tmp}/mapkluss-target-inventory.XXXXXX.json")
extract_dir=$(mktemp -d "${TMPDIR:-/tmp}/mapkluss-restore.XXXXXX")

cleanup() {
  rm -f "$target_inventory"
  rm -rf "$extract_dir"
}
trap cleanup EXIT

if [[ ! -f "$archive_path" ]]; then
  echo "Usage: restore-drill.sh /path/to/mapkluss-postgres.tar.gz" >&2
  exit 1
fi

if [[ -z "$target_url" ]]; then
  echo "MAPKLUSS_RESTORE_DB_URL is required" >&2
  exit 1
fi

if [[ "${MAPKLUSS_ALLOW_DESTRUCTIVE_RESTORE:-}" != "disposable-only" ]]; then
  echo "Set MAPKLUSS_ALLOW_DESTRUCTIVE_RESTORE=disposable-only after confirming the target is disposable" >&2
  exit 1
fi

database_name=$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$target_url")
database_host=$(node -e 'console.log(new URL(process.argv[1]).hostname)' "$target_url")
allow_marked_local_postgres=false
if [[ "$database_name" == "postgres" \
  && ( "$database_host" == "127.0.0.1" || "$database_host" == "localhost" ) \
  && "${MAPKLUSS_ALLOW_MARKED_LOCAL_POSTGRES:-}" == "disposable-stack" ]]; then
  allow_marked_local_postgres=true
fi
if [[ ! "$database_name" =~ (_restore_drill|_migration_rehearsal)$ && "$allow_marked_local_postgres" != true ]]; then
  echo "Refusing target database without _restore_drill or _migration_rehearsal suffix" >&2
  exit 1
fi

if [[ "$database_host" != "127.0.0.1" && "$database_host" != "localhost" && "${MAPKLUSS_ALLOW_REMOTE_RESTORE:-}" != "explicit-disposable-remote" ]]; then
  echo "Refusing a non-local restore target without MAPKLUSS_ALLOW_REMOTE_RESTORE=explicit-disposable-remote" >&2
  exit 1
fi

if [[ "$restore_mode" != "empty" && "$restore_mode" != "supabase-base" ]]; then
  echo "MAPKLUSS_RESTORE_MODE must be empty or supabase-base" >&2
  exit 1
fi

for command_name in node psql tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required" >&2
    exit 1
  fi
done

if [[ ! $(psql --version) == *" 17."* ]]; then
  echo "PostgreSQL 17 psql is required" >&2
  exit 1
fi

if tar -tvzf "$archive_path" | awk '$1 ~ /^[lh]/ { found=1 } END { exit !found }'; then
  echo "Backup archive contains link entries" >&2
  exit 1
fi

archive_entries=$(tar -tzf "$archive_path" | sed 's|^\./||' | sort)
expected_entries=$(printf '%s\n' data.sql managed-metadata.json migrations.tar.gz roles.sql schema.sql)
if [[ "$archive_entries" != "$expected_entries" ]]; then
  echo "Backup archive contains unexpected paths" >&2
  exit 1
fi

tar -xzf "$archive_path" -C "$extract_dir"
node "$script_dir/verify-backup.mjs" "$archive_path" "$extract_dir"

database_marker=$(psql "$target_url" -X -v ON_ERROR_STOP=1 -Atc "select coalesce(shobj_description(oid, 'pg_database'), '') from pg_database where datname = current_database()")
if [[ "$database_marker" != "mapkluss-disposable-restore-target" ]]; then
  echo "Refusing a target without the mapkluss-disposable-restore-target database marker" >&2
  exit 1
fi

if [[ "$restore_mode" == "empty" ]]; then
  nonempty_objects=$(psql "$target_url" -X -v ON_ERROR_STOP=1 -Atc "
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
      and n.nspname not like 'pg_toast%'
      and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f');
  ")
  if [[ "$nonempty_objects" != "0" ]]; then
    echo "Refusing to restore into a non-empty database" >&2
    exit 1
  fi
else
  base_state=$(psql "$target_url" -X -v ON_ERROR_STOP=1 -Atc "
    select json_build_object(
      'auth_users_exists', to_regclass('auth.users') is not null,
      'storage_objects_exists', to_regclass('storage.objects') is not null,
      'application_tables', (
        select count(*)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('profiles', 'arts', 'art_versions', 'art_artifacts', 'companion_imports', 'companion_lens_sessions')
      )
    )::text;
  ")
  node -e '
    const state = JSON.parse(process.argv[1]);
    if (!state.auth_users_exists || !state.storage_objects_exists || state.application_tables !== 0) process.exit(1);
  ' "$base_state" || {
    echo "Refusing a target that is not a clean Supabase-compatible base" >&2
    exit 1
  }
  managed_rows=$(psql "$target_url" -X -v ON_ERROR_STOP=1 -Atc "select (select count(*) from auth.users) + (select count(*) from storage.objects)")
  if [[ "$managed_rows" != "0" ]]; then
    echo "Refusing a Supabase base that already contains auth or storage rows" >&2
    exit 1
  fi
fi

psql "$target_url" \
  -X \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$extract_dir/roles.sql" \
  --file "$extract_dir/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$extract_dir/data.sql"

psql "$target_url" -X -q -v ON_ERROR_STOP=1 -f "$inventory_sql" >"$target_inventory"

if [[ -f "$source_inventory" ]]; then
  node "$script_dir/../migration/compare-inventories.mjs" "$source_inventory" "$target_inventory"
else
  echo "Source inventory is missing; restore succeeded but count comparison was skipped" >&2
  exit 1
fi

echo "Disposable restore drill passed"
