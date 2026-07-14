#!/usr/bin/env bash
set -euo pipefail

umask 077

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is required" >&2
  exit 1
fi

output_dir=${MAPKLUSS_BACKUP_DIR:-$PWD/.mapkluss-backups}
timestamp=${MAPKLUSS_BACKUP_TIMESTAMP:-$(date -u +%Y-%m-%dT%H-%M-%SZ)}
archive_path="$output_dir/mapkluss-postgres-${timestamp}.tar.gz"
manifest_path="$archive_path.json"
inventory_path="$archive_path.inventory.json"
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
inventory_sql="$script_dir/../migration/inventory.sql"
managed_metadata_sql="$script_dir/managed-metadata.sql"
supabase_cli_version=${MAPKLUSS_SUPABASE_CLI_VERSION:-2.109.1}
postgres_image=${MAPKLUSS_POSTGRES_IMAGE:-postgres:17.6-alpine@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94}
supabase_attempts=${MAPKLUSS_SUPABASE_ATTEMPTS:-4}
supabase_retry_delay=${MAPKLUSS_SUPABASE_RETRY_DELAY_SECONDS:-15}
repository_root=$(cd "$script_dir/../.." && pwd)
mkdir -p "$output_dir"
working_dir=$(mktemp -d "$output_dir/.mapkluss-postgres-${timestamp}.XXXXXX")

cleanup() {
  rm -rf "$working_dir"
}
trap cleanup EXIT

run_supabase() {
  local attempt delay

  if [[ -z "${MAPKLUSS_SUPABASE_CLI_BIN:-}" ]] && ! command -v npx >/dev/null 2>&1; then
    echo "npx or MAPKLUSS_SUPABASE_CLI_BIN is required" >&2
    exit 1
  fi

  for ((attempt = 1; attempt <= supabase_attempts; attempt++)); do
    if [[ -n "${MAPKLUSS_SUPABASE_CLI_BIN:-}" ]]; then
      if "$MAPKLUSS_SUPABASE_CLI_BIN" "$@"; then
        return 0
      fi
    elif npx --yes "supabase@${supabase_cli_version}" "$@"; then
      return 0
    fi

    if ((attempt == supabase_attempts)); then
      echo "Supabase CLI failed after ${supabase_attempts} attempts" >&2
      return 1
    fi

    delay=$((supabase_retry_delay * (1 << (attempt - 1))))
    echo "Supabase CLI attempt ${attempt} failed; retrying in ${delay}s" >&2
    sleep "$delay"
  done
}

run_psql_file() {
  local sql_file=$1
  local output_file=$2

  if command -v psql >/dev/null 2>&1 && [[ $(psql --version) == *" 17."* ]]; then
    psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$sql_file" >"$output_file"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm -i -e SUPABASE_DB_URL "$postgres_image" \
      sh -ceu 'psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1' \
      <"$sql_file" >"$output_file"
  else
    echo "PostgreSQL 17 psql or Docker is required" >&2
    exit 1
  fi
}

run_supabase db dump --db-url "$SUPABASE_DB_URL" -f "$working_dir/roles.sql" --role-only
run_supabase db dump --db-url "$SUPABASE_DB_URL" -f "$working_dir/schema.sql"
run_supabase db dump --db-url "$SUPABASE_DB_URL" -f "$working_dir/data.sql" \
  --use-copy \
  --data-only \
  -x storage.buckets_vectors \
  -x storage.vector_indexes

for sql_file in roles.sql schema.sql data.sql; do
  test -s "$working_dir/$sql_file"
  chmod 600 "$working_dir/$sql_file"
done

run_psql_file "$inventory_sql" "$inventory_path"
run_psql_file "$managed_metadata_sql" "$working_dir/managed-metadata.json"

if find "$repository_root/supabase/migrations" -type l -print -quit | grep -q .; then
  echo "Refusing to archive symlinks from supabase/migrations" >&2
  exit 1
fi
tar -C "$repository_root" -czf "$working_dir/migrations.tar.gz" supabase/migrations

tar -C "$working_dir" -czf "$archive_path" \
  roles.sql \
  schema.sql \
  data.sql \
  managed-metadata.json \
  migrations.tar.gz
chmod 600 "$archive_path" "$inventory_path"

node -e '
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const path = require("node:path");
  const [manifestPath, archivePath, inventoryPath, sqlDir, createdAt, cliVersion, repositoryRoot] = process.argv.slice(1);
  const details = (filePath) => {
    const value = fs.readFileSync(filePath);
    return { bytes: value.length, sha256: crypto.createHash("sha256").update(value).digest("hex") };
  };
  const archiveFiles = ["roles.sql", "schema.sql", "data.sql", "managed-metadata.json", "migrations.tar.gz"];
  const files = Object.fromEntries(archiveFiles.map((name) => [name, details(path.join(sqlDir, name))]));
  let repositoryCommit = "unavailable";
  try {
    repositoryCommit = require("node:child_process").execFileSync(
      "git",
      ["-C", repositoryRoot, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim();
  } catch {}
  fs.writeFileSync(manifestPath, JSON.stringify({
    format: "supabase-cli-sql-tar-gzip",
    postgresMajor: 17,
    createdAt,
    supabaseCliVersion: cliVersion,
    repositoryCommit,
    archive: { file: path.basename(archivePath), ...details(archivePath) },
    inventory: { file: path.basename(inventoryPath), ...details(inventoryPath) },
    files,
    includes: [
      "portable database roles",
      "database schema",
      "database rows",
      "auth metadata",
      "storage metadata",
      "managed auth/storage customization inventory",
      "repository Supabase migrations",
    ],
    excludes: ["Supabase platform internals", "storage object bytes", "database passwords", "JWT and auth provider settings", "Edge Function secrets"],
  }, null, 2) + "\n", { mode: 0o600 });
' "$manifest_path" "$archive_path" "$inventory_path" "$working_dir" "$timestamp" "$supabase_cli_version" "$repository_root"

echo "$archive_path"
echo "$manifest_path"
echo "$inventory_path"
