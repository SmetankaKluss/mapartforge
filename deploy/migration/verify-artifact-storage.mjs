import { spawnSync } from 'node:child_process';
import { validateArtifactStoragePolicy } from './artifact-storage-policy.mjs';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function awsJson(args, { mayBeMissing = false } = {}) {
  const result = spawnSync('aws', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AWS_PAGER: '' },
  });
  if (result.status !== 0) {
    if (mayBeMissing && /NoSuchCORSConfiguration|NoSuchLifecycleConfiguration/i.test(result.stderr ?? '')) {
      return {};
    }
    throw new Error('Object Storage preflight operation failed');
  }
  return JSON.parse(result.stdout || '{}');
}

function hasNoBucketPolicy() {
  const result = spawnSync('aws', [
    's3api',
    'get-bucket-policy',
    '--endpoint-url', endpoint,
    '--bucket', bucket,
    '--output', 'json',
    '--no-cli-pager',
  ], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AWS_PAGER: '' },
  });
  if (result.status === 0) return false;
  if (/NoSuchBucketPolicy/i.test(result.stderr ?? '')) return true;
  throw new Error('Object Storage bucket policy could not be verified');
}

const bucket = required('YANDEX_ARTIFACT_STORAGE_BUCKET');
const kmsKeyId = required('YANDEX_ARTIFACT_STORAGE_KMS_KEY_ID');
const endpoint = process.env.YANDEX_ARTIFACT_STORAGE_ENDPOINT || 'https://storage.yandexcloud.net';
const prefix = `${(process.env.YANDEX_ARTIFACT_STORAGE_PREFIX || 'cloud/v1').replace(/^\/+|\/+$/g, '')}/`;
const base = ['--endpoint-url', endpoint, '--bucket', bucket, '--output', 'json', '--no-cli-pager'];
const policy = {
  acl: awsJson(['s3api', 'get-bucket-acl', ...base]),
  bucketPolicyAbsent: hasNoBucketPolicy(),
  versioning: awsJson(['s3api', 'get-bucket-versioning', ...base]),
  encryption: awsJson(['s3api', 'get-bucket-encryption', ...base]),
  cors: awsJson(['s3api', 'get-bucket-cors', ...base], { mayBeMissing: true }),
  lifecycle: awsJson(['s3api', 'get-bucket-lifecycle-configuration', ...base], { mayBeMissing: true }),
  kmsKeyId,
  prefix,
};
const errors = validateArtifactStoragePolicy(policy);
if (errors.length > 0) throw new Error(`Artifact Storage preflight failed: ${errors.join('; ')}`);
process.stdout.write(`${JSON.stringify({ ok: true, private: true, versioned: true, kms: true, cors: true, lifecycle: true })}\n`);
