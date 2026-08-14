import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertPlatformConfigSafe,
  attachPlatformConfig,
  collectPlatformConfig,
} from './collect-platform-config.mjs';

const auth = {
  site_url: 'https://mapkluss.art',
  uri_allow_list: 'https://mapkluss.art/cloud',
  disable_signup: false,
  external_email_enabled: true,
  external_google_enabled: false,
  external_google_secret: 'must-not-leak',
  smtp_host: 'smtp.example.test',
  smtp_user: 'user',
  smtp_pass: 'must-not-leak',
  mailer_templates_magic_link_content: 'must-not-leak',
};

test('collects a redacted platform snapshot', async () => {
  const fixtures = new Map([
    ['/config/auth', auth],
    ['/config/realtime', { max_concurrent_users: 100, presence_enabled: true }],
    ['/config/storage', {
      fileSizeLimit: 1024,
      features: { imageTransformation: { enabled: true } },
      capabilities: { list_v2: true },
      external: { upstreamTarget: 'must-not-leak' },
      migrationVersion: '1',
    }],
    ['/postgrest', { db_schema: 'public', max_rows: 1000, jwt_secret: 'must-not-leak' }],
    ['/functions', [{ slug: 'companion-api', name: 'companion-api', version: 19, verify_jwt: true }]],
    ['/secrets', [{ name: 'TELEGRAM_BOT_TOKEN', value: 'must-not-leak' }]],
    ['/api-keys', [{ name: 'anon', type: 'legacy', api_key: 'must-not-leak', hash: 'must-not-leak' }]],
  ]);
  const snapshot = await collectPlatformConfig({
    accessToken: 'test-token',
    projectRef: 'abcdefghijklmnopqrst',
    managementApi: 'https://management.test/v1',
    capturedAt: '2026-08-14T00:00:00.000Z',
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname.replace('/v1/projects/abcdefghijklmnopqrst', '');
      return new Response(JSON.stringify(fixtures.get(pathname)), { status: 200 });
    },
  });
  assertPlatformConfigSafe(snapshot);
  assert.equal(snapshot.auth.site_url, 'https://mapkluss.art');
  assert.equal(snapshot.storage.externalConfigured, true);
  assert.equal(snapshot.auth.providers.google.enabled, false);
  assert.equal(snapshot.auth.smtpConfigured, true);
  assert.deepEqual(snapshot.secretNames, ['TELEGRAM_BOT_TOKEN']);
  assert.deepEqual(snapshot.apiKeys, [{ name: 'anon', type: 'legacy', createdAt: null, updatedAt: null }]);
  assert.doesNotMatch(JSON.stringify(snapshot), /must-not-leak/);
});

test('fails closed for an unknown Auth field', async () => {
  const fixtures = {
    '/config/auth': { ...auth, brand_new_unclassified_setting: true },
    '/config/realtime': {}, '/config/storage': {}, '/postgrest': {},
    '/functions': [], '/secrets': [], '/api-keys': [],
  };
  await assert.rejects(() => collectPlatformConfig({
    accessToken: 'test-token',
    projectRef: 'abcdefghijklmnopqrst',
    managementApi: 'https://management.test/v1',
    fetchImpl: async (url) => new Response(JSON.stringify(
      fixtures[new URL(url).pathname.replace('/v1/projects/abcdefghijklmnopqrst', '')],
    )),
  }), /Unclassified Auth fields: brand_new_unclassified_setting/);
});

test('attaches the platform checksum atomically to a v2 manifest', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mapkluss-platform-test-'));
  try {
    const manifestPath = path.join(directory, 'backup.tar.gz.json');
    const platformPath = path.join(directory, 'backup.tar.gz.platform.json');
    fs.writeFileSync(manifestPath, '{"format":"supabase-cli-sql-tar-gzip"}\n');
    fs.writeFileSync(platformPath, '{"format":"mapkluss-supabase-platform-config"}\n');
    attachPlatformConfig(manifestPath, platformPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.manifestVersion, 2);
    assert.equal(manifest.platformConfig.file, path.basename(platformPath));
    assert.match(manifest.platformConfig.sha256, /^[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
