'use strict';

const tls = require('node:tls');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MINIMUM_CERTIFICATE_DAYS = 14;
const DEFAULT_READYZ_MAX_AGE_SECONDS = 60;
const GITHUB_REPOSITORY = 'SmetankaKluss/mapartforge';

const checks = [
  ['production shell', () => expectSpa('https://mapkluss.art/')],
  ['staging shell', () => expectSpa('https://stage.mapkluss.art/')],
  ['gateway readiness', () => expectReadyz('https://api.mapkluss.art/readyz')],
  ['gateway Auth upstream', () => expectStatus('https://api.mapkluss.art/auth/v1/health', [200, 401])],
  ['production TLS', () => verifyCertificate('mapkluss.art')],
  ['staging TLS', () => verifyCertificate('stage.mapkluss.art')],
  ['gateway TLS', () => verifyCertificate('api.mapkluss.art')],
  ['public smoke schedule', () => expectWorkflowFresh('monitor-public.yml', 4)],
  ['backup workflow', () => expectWorkflowFresh('backup-supabase.yml', 36)],
  ['backup monitor schedule', () => expectWorkflowFresh('monitor-backups.yml', 36)],
];

module.exports.handler = async function handler() {
  const results = await Promise.allSettled(checks.map(async ([name, run]) => {
    await run();
    console.log(`watchdog check passed: ${name}`);
    return name;
  }));

  const failures = results.flatMap((result, index) => (
    result.status === 'rejected'
      ? [`${checks[index][0]}: ${safeError(result.reason)}`]
      : []
  ));

  if (failures.length > 0) {
    throw new Error(`MapKluss watchdog failed (${failures.join('; ')})`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, checks: checks.length }),
  };
};

async function expectSpa(url) {
  const response = await request(url);
  assert(response.status === 200, `HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  assert(contentType.includes('text/html'), 'response is not HTML');
  const body = await response.text();
  assert(body.includes('id="root"'), 'React root is missing');
}

async function expectReadyz(url) {
  const response = await request(url);
  assert(response.status === 200, `HTTP ${response.status}`);
  const value = await response.json();
  validateReadyz(value, Date.now(), readyzMaximumAgeSeconds());
}

function validateReadyz(value, nowMs, maximumAgeSeconds) {
  assert(value && value.ok === true, 'readyz is not healthy');
  assert(value.stale === false, 'readyz is stale');
  assert(Number.isFinite(value.checkedAt), 'readyz checkedAt is missing');
  const ageMs = nowMs - value.checkedAt;
  assert(ageMs >= 0 && ageMs <= maximumAgeSeconds * 1000, 'readyz checkedAt is too old');
}

async function expectStatus(url, acceptedStatuses) {
  const response = await request(url);
  assert(acceptedStatuses.includes(response.status), `HTTP ${response.status}`);
  await response.body?.cancel();
}

async function expectWorkflowFresh(workflowFile, maximumAgeHours) {
  const endpoint = new URL(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${workflowFile}/runs`,
  );
  endpoint.searchParams.set('per_page', '20');
  const response = await request(endpoint, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'mapkluss-yandex-watchdog',
      'x-github-api-version': '2022-11-28',
    },
  });
  assert(response.status === 200, `GitHub API HTTP ${response.status}`);
  const payload = await response.json();
  assertWorkflowHealthy(payload.workflow_runs, maximumAgeHours, Date.now());
}

function assertWorkflowHealthy(runs, maximumAgeHours, nowMs) {
  assert(Array.isArray(runs) && runs.length > 0, 'workflow has no runs');
  const completed = runs
    .filter((run) => run.status === 'completed')
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  assert(completed.length > 0, 'workflow has no completed runs');
  assert(completed[0].conclusion === 'success', `latest completed run is ${completed[0].conclusion || 'unknown'}`);

  const ageMs = nowMs - Date.parse(completed[0].updated_at);
  assert(Number.isFinite(ageMs) && ageMs >= 0, 'latest workflow timestamp is invalid');
  assert(ageMs <= maximumAgeHours * 3_600_000, `latest success is older than ${maximumAgeHours} hours`);
}

async function verifyCertificate(hostname) {
  const certificate = await new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      timeout: timeoutMs(),
    }, () => {
      const peer = socket.getPeerCertificate();
      socket.end();
      resolve(peer);
    });
    socket.once('timeout', () => socket.destroy(new Error('TLS timed out')));
    socket.once('error', reject);
  });

  assert(certificate && certificate.valid_to, 'certificate expiry is missing');
  const remainingMs = Date.parse(certificate.valid_to) - Date.now();
  assert(
    remainingMs > minimumCertificateDays() * 86_400_000,
    `certificate expires within ${minimumCertificateDays()} days`,
  );
}

async function request(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs()),
      });
      if (response.status < 500 || attempt === 2) return response;
      await response.body?.cancel();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }
    await delay(attempt === 0 ? 500 : 1_500);
  }
  throw lastError || new Error('request failed');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function timeoutMs() {
  return positiveInteger('MAPKLUSS_WATCHDOG_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
}

function minimumCertificateDays() {
  return positiveInteger('MAPKLUSS_WATCHDOG_MIN_CERTIFICATE_DAYS', DEFAULT_MINIMUM_CERTIFICATE_DAYS);
}

function readyzMaximumAgeSeconds() {
  return positiveInteger('MAPKLUSS_WATCHDOG_READYZ_MAX_AGE_SECONDS', DEFAULT_READYZ_MAX_AGE_SECONDS);
}

function positiveInteger(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

module.exports._internals = {
  assertWorkflowHealthy,
  validateReadyz,
};
