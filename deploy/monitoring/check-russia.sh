#!/usr/bin/env bash
set -euo pipefail

for command_name in globalping jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required" >&2
    exit 1
  fi
done

stage_url=${MAPKLUSS_STAGE_URL:-https://stage.mapkluss.art/}
api_url=${MAPKLUSS_API_URL:-https://api.mapkluss.art/readyz}
storage_url=${MAPKLUSS_STORAGE_URL:-https://storage.yandexcloud.net/}
limit=${MAPKLUSS_RUSSIA_PROBE_LIMIT:-5}
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/mapkluss-russia-check.XXXXXX")

cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT

run_probe() {
  local target=$1
  local location=$2
  local output=$3
  globalping http "$target" from "$location" \
    --limit "$limit" \
    --method GET \
    --json \
    --ci >"$output"
}

summarize_and_assert() {
  local label=$1
  local file=$2
  jq --arg label "$label" '{
    target: $label,
    results: [.results[] | {
      network: .probe.network,
      status: .result.statusCode,
      totalMs: .result.timings.total,
      error: .result.error
    }]
  }' "$file"
  jq -e '.results | length >= 3 and all(.result.statusCode == 200 and .result.error == null)' "$file" >/dev/null
}

run_probe "$stage_url" 'Russia+eyeball' "$temp_dir/stage.json"
measurement_id=$(jq -r '.id' "$temp_dir/stage.json")

globalping http "$api_url" from "$measurement_id" --method GET --json --ci >"$temp_dir/api.json"
globalping http "$storage_url" from "$measurement_id" --method GET --json --ci >"$temp_dir/storage.json"

summarize_and_assert stage "$temp_dir/stage.json"
summarize_and_assert api "$temp_dir/api.json"
summarize_and_assert storage "$temp_dir/storage.json"
echo "Russian eyeball availability gate passed"
