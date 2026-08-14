import assert from 'node:assert/strict';
import test from 'node:test';
import { validateArtifactStoragePolicy } from './artifact-storage-policy.mjs';

function fixture() {
  return {
    acl: { Grants: [] },
    bucketPolicyAbsent: true,
    versioning: { Status: 'Enabled' },
    encryption: {
      ServerSideEncryptionConfiguration: {
        Rules: [{
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: 'aws:kms',
            KMSMasterKeyID: 'kms-key-id',
          },
        }],
      },
    },
    cors: {
      CORSRules: [{
        AllowedOrigins: ['https://mapkluss.art'],
        AllowedMethods: ['GET', 'HEAD', 'PUT'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
      }],
    },
    lifecycle: {
      Rules: [{
        Status: 'Enabled',
        Filter: { Prefix: 'cloud/v1/' },
        NoncurrentVersionExpiration: { NoncurrentDays: 7 },
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
      }],
    },
    kmsKeyId: 'kms-key-id',
  };
}

test('accepts the private versioned encrypted browser-upload contract', () => {
  assert.deepEqual(validateArtifactStoragePolicy(fixture()), []);
});

test('rejects public access, a wrong key and incomplete browser CORS', () => {
  const input = fixture();
  input.acl.Grants.push({ Grantee: { URI: 'http://acs.amazonaws.com/groups/global/AllUsers' } });
  input.encryption.ServerSideEncryptionConfiguration.Rules[0]
    .ApplyServerSideEncryptionByDefault.KMSMasterKeyID = 'another-key';
  input.cors.CORSRules[0].AllowedMethods = ['GET'];
  const errors = validateArtifactStoragePolicy(input);
  assert.equal(errors.length, 3);
});

test('rejects any bucket policy or an unverifiable policy state', () => {
  const present = fixture();
  present.bucketPolicyAbsent = false;
  assert.deepEqual(validateArtifactStoragePolicy(present), [
    'bucket policy is present or could not be verified',
  ]);

  const unknown = fixture();
  delete unknown.bucketPolicyAbsent;
  assert.deepEqual(validateArtifactStoragePolicy(unknown), [
    'bucket policy is present or could not be verified',
  ]);
});

test('rejects lifecycle retention that can leak deleted versions', () => {
  const input = fixture();
  input.lifecycle.Rules[0].NoncurrentVersionExpiration.NoncurrentDays = 90;
  input.lifecycle.Rules[0].AbortIncompleteMultipartUpload.DaysAfterInitiation = 30;
  assert.deepEqual(validateArtifactStoragePolicy(input), [
    'bucket lifecycle does not bound old versions and incomplete uploads',
  ]);
});
