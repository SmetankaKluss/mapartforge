import tls from 'node:tls';

const apiUrl = normalizedUrl(process.env.MAPKLUSS_API_URL || 'https://api.mapkluss.art');
const stageUrl = normalizedUrl(process.env.MAPKLUSS_STAGE_URL || 'https://stage.mapkluss.art');
const timeoutMs = Number.parseInt(process.env.MAPKLUSS_MONITOR_TIMEOUT_MS || '15000', 10);
const minimumCertificateDays = Number.parseInt(process.env.MAPKLUSS_MIN_CERTIFICATE_DAYS || '14', 10);

await expectJson(`${apiUrl}/healthz`, (value) => value.ok === true && value.service === 'mapkluss-gateway');
await expectJson(`${apiUrl}/readyz`, (value) => (
  value.ok === true
  && value.stale === false
  && typeof value.checkedAt === 'number'
));
await expectSpa(`${stageUrl}/`);
await expectSpa(`${stageUrl}/cloud`, { allowErrorDocument: true });
await expectSpa(`${stageUrl}/device`, { allowErrorDocument: true });
await expectSpa(`${stageUrl}/art/mapkluss-monitor-route`, { allowErrorDocument: true });
await verifyCertificate(new URL(apiUrl).hostname);
await verifyCertificate(new URL(stageUrl).hostname);
console.log('MapKluss public monitoring smoke passed');

async function expectJson(url, predicate) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert(response.status === 200, `${url} returned ${response.status}`);
  const value = await response.json();
  assert(predicate(value), `${url} returned an unexpected payload`);
  console.log(`${new URL(url).pathname} ok`);
}

async function expectSpa(url, { allowErrorDocument = false } = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const statusAccepted = response.status === 200 || (allowErrorDocument && response.status === 404);
  assert(statusAccepted, `${url} returned ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  assert(contentType.includes('text/html'), `${url} is not HTML`);
  assert(body.includes('id="root"'), `${url} is missing the React root`);
  console.log(`${new URL(url).pathname} spa ok status=${response.status}`);
}

async function verifyCertificate(hostname) {
  const certificate = await new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: timeoutMs }, () => {
      const peer = socket.getPeerCertificate();
      socket.end();
      resolve(peer);
    });
    socket.once('timeout', () => socket.destroy(new Error(`${hostname} TLS timed out`)));
    socket.once('error', reject);
  });

  assert(certificate?.valid_to, `${hostname} did not provide certificate expiry`);
  const remainingMs = Date.parse(certificate.valid_to) - Date.now();
  assert(remainingMs > minimumCertificateDays * 86_400_000, `${hostname} certificate expires too soon`);
  console.log(`${hostname} tls days=${Math.floor(remainingMs / 86_400_000)}`);
}

function normalizedUrl(value) {
  return new URL(value).toString().replace(/\/$/, '');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
