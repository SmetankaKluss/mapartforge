function includesCaseInsensitive(values, expected) {
  return (values ?? []).some(value => String(value).toLowerCase() === expected.toLowerCase());
}

function allowsHeader(allowedHeaders, header) {
  return includesCaseInsensitive(allowedHeaders, '*') || includesCaseInsensitive(allowedHeaders, header);
}

export function validateArtifactStoragePolicy({
  acl,
  bucketPolicyAbsent,
  versioning,
  encryption,
  cors,
  lifecycle,
  kmsKeyId,
  requiredOrigin = 'https://mapkluss.art',
  prefix = 'cloud/v1/',
}) {
  const errors = [];
  if ((acl?.Grants ?? []).some(grant => /AllUsers|AllAuthenticatedUsers/i.test(grant?.Grantee?.URI ?? ''))) {
    errors.push('bucket grants public access');
  }
  if (bucketPolicyAbsent !== true) errors.push('bucket policy is present or could not be verified');
  if (versioning?.Status !== 'Enabled') errors.push('bucket versioning is not enabled');

  const encryptionRules = encryption?.ServerSideEncryptionConfiguration?.Rules ?? [];
  const encryptedWithExpectedKey = encryptionRules.some(rule => {
    const defaults = rule?.ApplyServerSideEncryptionByDefault ?? {};
    return defaults.SSEAlgorithm === 'aws:kms'
      && String(defaults.KMSMasterKeyID ?? '').endsWith(kmsKeyId);
  });
  if (!encryptedWithExpectedKey) errors.push('bucket KMS encryption does not use the expected key');

  const corsRules = cors?.CORSRules ?? [];
  const corsReady = corsRules.some(rule => {
    const methods = rule?.AllowedMethods ?? [];
    const headers = rule?.AllowedHeaders ?? [];
    return includesCaseInsensitive(rule?.AllowedOrigins, requiredOrigin)
      && ['GET', 'HEAD', 'PUT'].every(method => includesCaseInsensitive(methods, method))
      && [
        'content-type',
        'content-md5',
        'if-none-match',
        'x-amz-content-sha256',
        'x-amz-meta-integrity',
        'x-amz-meta-sha256',
        'x-amz-meta-source-bucket',
        'x-amz-server-side-encryption',
        'x-amz-server-side-encryption-aws-kms-key-id',
      ].every(header => allowsHeader(headers, header));
  });
  if (!corsReady) errors.push('bucket CORS does not allow the signed browser upload contract');

  const lifecycleRules = lifecycle?.Rules ?? [];
  const lifecycleReady = lifecycleRules.some(rule => {
    const rulePrefix = String(rule?.Filter?.Prefix ?? rule?.Prefix ?? '');
    const noncurrentDays = Number(rule?.NoncurrentVersionExpiration?.NoncurrentDays);
    const abortDays = Number(rule?.AbortIncompleteMultipartUpload?.DaysAfterInitiation);
    return rule?.Status === 'Enabled'
      && prefix.startsWith(rulePrefix)
      && Number.isFinite(noncurrentDays) && noncurrentDays >= 1 && noncurrentDays <= 30
      && Number.isFinite(abortDays) && abortDays >= 1 && abortDays <= 7;
  });
  if (!lifecycleReady) errors.push('bucket lifecycle does not bound old versions and incomplete uploads');

  return errors;
}
