import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const bucket = required('YC_BACKUP_BUCKET');
const kmsKeyId = required('YC_BACKUP_KMS_KEY_ID');
const endpoint = process.env.YC_STORAGE_ENDPOINT || 'https://storage.yandexcloud.net';
const maximumBackupAgeHours = Number.parseInt(process.env.MAPKLUSS_MAX_BACKUP_AGE_HOURS || '36', 10);
const maximumRestoreAgeDays = Number.parseInt(process.env.MAPKLUSS_MAX_RESTORE_AGE_DAYS || '35', 10);

const listing = awsJson([
  's3api', 'list-objects-v2', '--endpoint-url', endpoint,
  '--bucket', bucket, '--prefix', 'postgres/daily/', '--output', 'json', '--no-cli-pager',
]);
const archives = (listing.Contents || [])
  .filter((item) => /^postgres\/daily\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.tar\.gz$/.test(item.Key || ''))
  .sort((left, right) => Date.parse(right.LastModified) - Date.parse(left.LastModified));
assert(archives.length > 0, 'No daily backup archives were found');

const latest = archives[0];
const backupAgeMs = Date.now() - Date.parse(latest.LastModified);
assert(Number.isFinite(backupAgeMs) && backupAgeMs >= 0, 'Latest backup timestamp is invalid');
assert(backupAgeMs <= maximumBackupAgeHours * 3_600_000, `Latest backup is older than ${maximumBackupAgeHours} hours`);

for (const key of [latest.Key, `${latest.Key}.json`, `${latest.Key}.inventory.json`]) {
  const metadata = awsJson([
    's3api', 'head-object', '--endpoint-url', endpoint,
    '--bucket', bucket, '--key', key, '--output', 'json', '--no-cli-pager',
  ]);
  assert(Number(metadata.ContentLength) > 0, 'A backup generation object is empty');
  assert(metadata.ServerSideEncryption === 'aws:kms', 'A backup generation object is not KMS encrypted');
  assert(String(metadata.SSEKMSKeyId || '').endsWith(kmsKeyId), 'A backup generation object uses an unexpected KMS key');
  const remoteSha256 = Object.entries(metadata.Metadata || {})
    .find(([name]) => name.toLowerCase() === 'sha256')?.[1];
  assert(/^[a-f0-9]{64}$/i.test(String(remoteSha256 || '')), 'A backup generation object is missing its SHA-256 metadata');
}

const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapkluss-backup-monitor-'));
try {
  const manifestPath = path.join(manifestDir, 'manifest.json');
  execFileSync('aws', [
    's3api', 'get-object', '--endpoint-url', endpoint,
    '--bucket', bucket, '--key', `${latest.Key}.json`, manifestPath, '--no-cli-pager',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.format === 'supabase-cli-sql-tar-gzip', 'Latest backup manifest has an unexpected format');
  assert(manifest.postgresMajor === 17, 'Latest backup manifest has an unexpected PostgreSQL version');
  assert(manifest.archive?.file === path.posix.basename(latest.Key), 'Latest backup manifest does not match its archive');
  assert(/^[a-f0-9]{64}$/i.test(String(manifest.archive?.sha256 || '')), 'Latest backup manifest is missing the archive checksum');
} finally {
  fs.rmSync(manifestDir, { recursive: true, force: true });
}

await verifyRecentRestore();
console.log(`Backup freshness passed age_hours=${Math.floor(backupAgeMs / 3_600_000)}`);

async function verifyRecentRestore() {
  const repository = required('GITHUB_REPOSITORY');
  const token = required('GITHUB_TOKEN');
  const runs = await github(
    `/repos/${repository}/actions/workflows/backup-supabase.yml/runs?status=success&per_page=30`,
    token,
  );
  for (const run of runs.workflow_runs || []) {
    const ageMs = Date.now() - Date.parse(run.updated_at);
    if (!Number.isFinite(ageMs) || ageMs > maximumRestoreAgeDays * 86_400_000) continue;
    const jobs = await github(`/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`, token);
    const restorePassed = (jobs.jobs || []).some((job) => (
      job.steps || []
    ).some((step) => (
      step.name === 'Restore into disposable Supabase and compare inventory'
      && step.conclusion === 'success'
    )));
    if (restorePassed) return;
  }
  throw new Error(`No successful disposable restore drill was found in the last ${maximumRestoreAgeDays} days`);
}

function awsJson(args) {
  return JSON.parse(execFileSync('aws', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

async function github(pathname, token) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'mapkluss-backup-monitor',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub API GET ${pathname} returned ${response.status}`);
  return response.json();
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
