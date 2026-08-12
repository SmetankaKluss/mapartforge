import { createHash, randomBytes } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function aws(args, { capture = false } = {}) {
  const result = spawnSync('aws', args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, AWS_PAGER: '' },
  });
  if (result.status !== 0) throw new Error('Object Storage operation failed');
  return result.stdout ?? '';
}

function awsMayFail(args) {
  return spawnSync('aws', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AWS_PAGER: '' },
  });
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function encodeStoragePath(value) {
  return value.split('/').map(encodeURIComponent).join('/');
}

const manifestPath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!manifestPath) throw new Error('Usage: node copy-storage-manifest.mjs <manifest.ndjson> [--dry-run]');

const rows = (await readFile(manifestPath, 'utf8'))
  .split(/\r?\n/)
  .filter(Boolean)
  .map(line => JSON.parse(line));
const confirmed = rows.filter(row => String(row.classification).startsWith('confirmed_'));
const counts = rows.reduce((result, row) => {
  result[row.classification] = (result[row.classification] ?? 0) + 1;
  return result;
}, {});
const captureGenerations = new Set(rows.map(row => row.capture_generation));
if (captureGenerations.size !== 1) throw new Error('Manifest does not have one stable capture generation');
const blockers = (counts.pending_reservation ?? 0)
  + (counts.conflicting_reference ?? 0)
  + (counts.missing_required_source ?? 0);
const targetKeys = new Set(confirmed.map(row => row.target_key));
if (targetKeys.size !== confirmed.length) throw new Error('Confirmed target keys are not unique');

if (dryRun) {
  process.stdout.write(`${JSON.stringify({
    mode: 'dry-run', rows: rows.length, confirmed: confirmed.length, blockers, counts,
  })}\n`);
  process.exit(0);
}

if (blockers > 0) {
  throw new Error('Manifest contains active reservations, conflicting references, or missing required objects');
}

const supabaseUrl = required('SUPABASE_URL').replace(/\/$/, '');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const targetBucket = required('YANDEX_STORAGE_BUCKET');
const endpoint = process.env.YANDEX_STORAGE_ENDPOINT || 'https://storage.yandexcloud.net';
const kmsKeyId = required('YANDEX_STORAGE_KMS_KEY_ID');
const sourceFile = join(tmpdir(), `mapkluss-storage-source-${process.pid}`);
const targetFile = join(tmpdir(), `mapkluss-storage-target-${process.pid}`);
const canaryKey = `_mapkluss-private-preflight/${Date.now()}-${process.pid}`;
let canaryUploaded = false;
let copied = 0;
let reused = 0;
let copiedBytes = 0;

const bucketAcl = JSON.parse(aws([
  's3api', 'get-bucket-acl', '--endpoint-url', endpoint, '--bucket', targetBucket,
  '--output', 'json', '--no-cli-pager',
], { capture: true }));
if ((bucketAcl.Grants ?? []).some(grant => /AllUsers|AllAuthenticatedUsers/i.test(grant.Grantee?.URI ?? ''))) {
  throw new Error('Migration bucket must not grant public access');
}
const versioning = JSON.parse(aws([
  's3api', 'get-bucket-versioning', '--endpoint-url', endpoint, '--bucket', targetBucket,
  '--output', 'json', '--no-cli-pager',
], { capture: true }));
if (versioning.Status !== 'Enabled') throw new Error('Migration bucket versioning is not enabled');
const bucketPolicy = awsMayFail([
  's3api', 'get-bucket-policy', '--endpoint-url', endpoint, '--bucket', targetBucket,
  '--output', 'json', '--no-cli-pager',
]);
if (bucketPolicy.status === 0) throw new Error('Migration bucket must not have a bucket policy');
if (!/NoSuchBucketPolicy/i.test(bucketPolicy.stderr ?? '')) {
  throw new Error('Migration bucket policy could not be verified');
}

async function anonymousTargetDenied(targetKey) {
  const url = `${endpoint}/${encodeURIComponent(targetBucket)}/${encodeStoragePath(targetKey)}`;
  const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
  return response.status === 401 || response.status === 403;
}

async function verifiedTargetMatches(row, digest, size, contentType) {
  try {
    const head = JSON.parse(aws([
      's3api', 'head-object', '--endpoint-url', endpoint, '--bucket', targetBucket,
      '--key', row.target_key, '--output', 'json', '--no-cli-pager',
    ], { capture: true }));
    const encrypted = head.ServerSideEncryption === 'aws:kms'
      && String(head.SSEKMSKeyId ?? '').endsWith(kmsKeyId);
    const actualContentType = String(head.ContentType ?? '').split(';', 1)[0].toLowerCase();
    const expectedContentType = String(contentType ?? '').split(';', 1)[0].toLowerCase();
    if (!encrypted || head.ContentLength !== size || actualContentType !== expectedContentType) return false;
    aws([
      's3api', 'get-object', '--endpoint-url', endpoint, '--bucket', targetBucket,
      '--key', row.target_key, targetFile, '--no-cli-pager',
    ]);
    const targetBytes = await readFile(targetFile);
    return targetBytes.length === size
      && sha256(targetBytes) === digest
      && await anonymousTargetDenied(row.target_key);
  } catch {
    return false;
  } finally {
    await rm(targetFile, { force: true });
  }
}

try {
  const canaryBytes = randomBytes(32);
  await writeFile(sourceFile, canaryBytes, { mode: 0o600 });
  aws([
    's3api', 'put-object', '--endpoint-url', endpoint, '--bucket', targetBucket,
    '--key', canaryKey, '--body', sourceFile, '--content-type', 'application/octet-stream',
    '--server-side-encryption', 'aws:kms', '--ssekms-key-id', kmsKeyId, '--no-cli-pager',
  ]);
  canaryUploaded = true;
  if (!await verifiedTargetMatches({ target_key: canaryKey }, sha256(canaryBytes), canaryBytes.length, 'application/octet-stream')) {
    throw new Error('Migration bucket private-access canary failed');
  }
  await rm(sourceFile, { force: true });

  for (const row of confirmed) {
    const expectedSize = Number(row.expected_size ?? row.observed_size);
    if (!Number.isSafeInteger(expectedSize) || expectedSize < 0) {
      throw new Error('Confirmed object has no trustworthy size');
    }

    const sourceUrl = `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(row.bucket)}/${encodeStoragePath(row.path)}`;
    const response = await fetch(sourceUrl, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Source download failed with HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const digest = sha256(bytes);
    const contentType = row.expected_content_type || row.observed_content_type || 'application/octet-stream';
    if (bytes.length !== expectedSize) throw new Error('Source size verification failed');
    if (row.expected_sha256 && digest !== row.expected_sha256) throw new Error('Source SHA-256 verification failed');
    if (await verifiedTargetMatches(row, digest, bytes.length, contentType)) {
      reused += 1;
      continue;
    }
    await writeFile(sourceFile, bytes, { mode: 0o600 });

    aws([
      's3api', 'put-object', '--endpoint-url', endpoint, '--bucket', targetBucket,
      '--key', row.target_key, '--body', sourceFile,
      '--content-type', contentType,
      '--metadata', `sha256=${digest},source-bucket=${row.bucket}`,
      '--server-side-encryption', 'aws:kms', '--ssekms-key-id', kmsKeyId,
      '--no-cli-pager',
    ]);
    if (!await verifiedTargetMatches(row, digest, bytes.length, contentType)) {
      throw new Error('Target verification failed');
    }
    copied += 1;
    copiedBytes += bytes.length;
    await rm(sourceFile, { force: true });
  }
} finally {
  if (canaryUploaded) {
    try {
      aws([
        's3api', 'delete-object', '--endpoint-url', endpoint, '--bucket', targetBucket,
        '--key', canaryKey, '--no-cli-pager',
      ]);
    } catch {
      process.stderr.write('Warning: private-access canary cleanup requires attention\n');
    }
  }
  await rm(sourceFile, { force: true });
  await rm(targetFile, { force: true });
}

process.stdout.write(`${JSON.stringify({
  mode: 'copy',
  confirmed: confirmed.length,
  copied,
  reused,
  copiedBytes,
  sourcePreserved: true,
})}\n`);
