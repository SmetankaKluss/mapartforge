import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const MANAGEMENT_API = 'https://api.supabase.com/v1';
const SAFE_AUTH_KEYS = new Set([
  'api_max_request_duration', 'audit_log_disable_postgres', 'custom_oauth_enabled',
  'custom_oauth_max_providers', 'db_max_pool_size', 'db_max_pool_size_unit',
  'disable_signup', 'external_anonymous_users_enabled', 'external_email_enabled',
  'external_phone_enabled', 'hook_after_user_created_enabled',
  'hook_before_user_created_enabled', 'hook_custom_access_token_enabled',
  'hook_mfa_verification_attempt_enabled', 'hook_password_verification_attempt_enabled',
  'hook_send_email_enabled', 'hook_send_sms_enabled',
  'index_worker_ensure_user_search_indexes_exist', 'jwt_exp',
  'mailer_allow_unverified_email_sign_ins', 'mailer_autoconfirm',
  'mailer_notifications_email_changed_enabled', 'mailer_notifications_identity_linked_enabled',
  'mailer_notifications_identity_unlinked_enabled',
  'mailer_notifications_mfa_factor_enrolled_enabled',
  'mailer_notifications_mfa_factor_unenrolled_enabled',
  'mailer_notifications_password_changed_enabled',
  'mailer_notifications_phone_changed_enabled', 'mailer_otp_exp', 'mailer_otp_length',
  'mailer_secure_email_change_enabled', 'mfa_allow_low_aal', 'mfa_max_enrolled_factors',
  'mfa_phone_enroll_enabled', 'mfa_phone_max_frequency', 'mfa_phone_otp_length',
  'mfa_phone_verify_enabled', 'mfa_totp_enroll_enabled', 'mfa_totp_verify_enabled',
  'mfa_web_authn_enroll_enabled', 'mfa_web_authn_verify_enabled',
  'oauth_server_allow_dynamic_registration', 'oauth_server_enabled', 'passkey_enabled',
  'password_hibp_enabled', 'password_min_length', 'password_required_characters',
  'rate_limit_anonymous_users', 'rate_limit_email_sent', 'rate_limit_otp',
  'rate_limit_sms_sent', 'rate_limit_token_refresh', 'rate_limit_verify', 'rate_limit_web3',
  'refresh_token_rotation_enabled', 'saml_allow_encrypted_assertions', 'saml_enabled',
  'security_captcha_enabled', 'security_captcha_provider', 'security_manual_linking_enabled',
  'security_refresh_token_reuse_interval', 'security_sb_forwarded_for_enabled',
  'security_update_password_require_current_password',
  'security_update_password_require_reauthentication', 'sessions_inactivity_timeout',
  'sessions_single_per_user', 'sessions_tags', 'sessions_timebox', 'site_url',
  'sms_autoconfirm', 'sms_max_frequency', 'sms_otp_exp', 'sms_otp_length',
  'uri_allow_list', 'webauthn_rp_display_name', 'webauthn_rp_id', 'webauthn_rp_origins',
]);
const OMITTED_AUTH_PATTERNS = [
  /^external_(?!anonymous_users_enabled$|email_enabled$|phone_enabled$)/,
  /^hook_.*_(secrets|uri)$/,
  /^mailer_(subjects|templates)_/,
  /^mfa_phone_template$/,
  /^nimbus_oauth_/,
  /^oauth_server_authorization_path$/,
  /^saml_external_url$/,
  /^security_captcha_secret$/,
  /^sms_(messagebird|provider|template|test_otp|textlocal|twilio|vonage)/,
  /^smtp_/,
];
const SAFE_REALTIME_KEYS = new Set([
  'max_bytes_per_second', 'max_channels_per_client', 'max_concurrent_users',
  'max_events_per_second', 'max_joins_per_second', 'max_payload_size_in_kb',
  'max_presence_events_per_second', 'presence_enabled', 'suspend',
]);
const SAFE_POSTGREST_KEYS = new Set([
  'db_extra_search_path', 'db_pool', 'db_pool_acquisition_timeout', 'db_schema', 'max_rows',
]);

export async function collectPlatformConfig({
  accessToken,
  projectRef,
  fetchImpl = fetch,
  managementApi = MANAGEMENT_API,
  capturedAt = new Date().toISOString(),
}) {
  if (!accessToken?.trim()) throw new Error('SUPABASE_ACCESS_TOKEN is required');
  if (!/^[a-z0-9]{20}$/.test(projectRef || '')) throw new Error('SUPABASE_PROJECT_REF is invalid');

  const get = async (suffix) => {
    const response = await fetchImpl(`${managementApi}/projects/${projectRef}${suffix}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Management API ${suffix} returned ${response.status}`);
    const text = await response.text();
    if (Buffer.byteLength(text) > 2_000_000) throw new Error(`Management API ${suffix} response is too large`);
    return JSON.parse(text);
  };

  const [auth, realtime, storage, postgrest, functions, secrets, apiKeys] = await Promise.all([
    get('/config/auth'), get('/config/realtime'), get('/config/storage'), get('/postgrest'),
    get('/functions'), get('/secrets'), get('/api-keys'),
  ]);

  const unknownAuthKeys = Object.keys(auth).filter((key) => (
    !SAFE_AUTH_KEYS.has(key) && !OMITTED_AUTH_PATTERNS.some((pattern) => pattern.test(key))
  ));
  if (unknownAuthKeys.length > 0) {
    throw new Error(`Unclassified Auth fields: ${unknownAuthKeys.sort().join(', ')}`);
  }

  return {
    format: 'mapkluss-supabase-platform-config',
    version: 1,
    capturedAt,
    projectRefSha256: sha256(projectRef),
    auth: {
      ...pick(auth, SAFE_AUTH_KEYS),
      providers: providerStatus(auth),
      smtpConfigured: Boolean(auth.smtp_host && auth.smtp_user && auth.smtp_pass),
    },
    realtime: pickStrict(realtime, SAFE_REALTIME_KEYS, 'Realtime'),
    storage: sanitizeStorage(storage),
    postgrest: pickStrict(postgrest, SAFE_POSTGREST_KEYS, 'PostgREST'),
    functions: requireArray(functions, 'Functions').map((item) => ({
      slug: requiredString(item.slug, 'function slug'),
      name: optionalString(item.name),
      status: optionalString(item.status),
      version: finiteNumber(item.version),
      verifyJwt: Boolean(item.verify_jwt),
      entrypointPath: optionalString(item.entrypoint_path),
      importMapPath: optionalString(item.import_map_path),
      createdAt: optionalString(item.created_at),
      updatedAt: optionalString(item.updated_at),
    })).sort((left, right) => left.slug.localeCompare(right.slug)),
    secretNames: requireArray(secrets, 'Secrets')
      .map((item) => requiredString(item.name, 'secret name')).sort(),
    apiKeys: requireArray(apiKeys, 'API keys').map((item) => ({
      name: optionalString(item.name),
      type: optionalString(item.type),
      createdAt: optionalString(item.inserted_at),
      updatedAt: optionalString(item.updated_at),
    })).sort((left, right) => `${left.type}:${left.name}`.localeCompare(`${right.type}:${right.name}`)),
  };
}

export function assertPlatformConfigSafe(snapshot) {
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of [
    'smtp_pass', 'smtp_user', 'jwt_secret', 'api_key', 'secret_jwt_template',
    'external_google_secret', 'hook_send_email_secrets', 'mailer_templates_',
  ]) {
    if (serialized.includes(forbidden)) throw new Error(`Platform snapshot contains forbidden field ${forbidden}`);
  }
  if (snapshot?.format !== 'mapkluss-supabase-platform-config' || snapshot?.version !== 1) {
    throw new Error('Unexpected platform snapshot format');
  }
  if (!/^[a-f0-9]{64}$/.test(snapshot.projectRefSha256 || '')) {
    throw new Error('Platform snapshot project hash is invalid');
  }
}

export function attachPlatformConfig(manifestPath, platformPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const value = fs.readFileSync(platformPath);
  manifest.manifestVersion = 2;
  manifest.platformConfig = {
    file: path.basename(platformPath),
    bytes: value.length,
    sha256: sha256(value),
  };
  const temporaryPath = `${manifestPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, manifestPath);
}

function pickStrict(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key) && key !== 'jwt_secret');
  if (unknown.length > 0) throw new Error(`Unclassified ${label} fields: ${unknown.sort().join(', ')}`);
  return pick(value, allowed);
}

function pick(value, allowed) {
  return Object.fromEntries([...allowed].filter((key) => key in value).map((key) => [key, value[key]]));
}

function sanitizeStorage(value) {
  const allowed = new Set(['fileSizeLimit', 'features', 'capabilities', 'migrationVersion', 'external']);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`Unclassified Storage fields: ${unknown.sort().join(', ')}`);
  return {
    fileSizeLimit: finiteNumber(value.fileSizeLimit),
    features: {
      imageTransformation: Boolean(value.features?.imageTransformation?.enabled),
      s3Protocol: Boolean(value.features?.s3Protocol?.enabled),
      icebergCatalog: Boolean(value.features?.icebergCatalog?.enabled),
      vectorBuckets: Boolean(value.features?.vectorBuckets?.enabled),
      purgeCache: Boolean(value.features?.purgeCache?.enabled),
    },
    capabilities: {
      listV2: Boolean(value.capabilities?.list_v2),
      icebergCatalog: Boolean(value.capabilities?.iceberg_catalog),
    },
    migrationVersion: optionalString(value.migrationVersion),
    externalConfigured: Boolean(value.external?.upstreamTarget),
  };
}

function providerStatus(auth) {
  const providers = {};
  for (const [key, value] of Object.entries(auth)) {
    const match = key.match(/^external_(.+)_(enabled|email_optional|skip_nonce_check)$/);
    if (!match || typeof value !== 'boolean') continue;
    const [, provider, setting] = match;
    providers[provider] ||= {};
    providers[provider][setting] = value;
  }
  return Object.fromEntries(Object.entries(providers).sort(([left], [right]) => left.localeCompare(right)));
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} response is not an array`);
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function optionalString(value) {
  return typeof value === 'string' ? value : null;
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function main() {
  const archivePath = process.argv[2];
  if (!archivePath) throw new Error('Usage: collect-platform-config.mjs /path/to/backup.tar.gz');
  const platformPath = `${archivePath}.platform.json`;
  const snapshot = await collectPlatformConfig({
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    projectRef: process.env.SUPABASE_PROJECT_REF,
  });
  assertPlatformConfigSafe(snapshot);
  fs.writeFileSync(platformPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  attachPlatformConfig(`${archivePath}.json`, platformPath);
  console.log(platformPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
