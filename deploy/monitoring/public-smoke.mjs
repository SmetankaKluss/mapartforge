import tls from 'node:tls';

const apiUrl = normalizedUrl(process.env.MAPKLUSS_API_URL || 'https://api.mapkluss.art');
const stageUrl = normalizedUrl(process.env.MAPKLUSS_STAGE_URL || 'https://stage.mapkluss.art');
const siteUrl = normalizedUrl(process.env.MAPKLUSS_SITE_URL || 'https://mapkluss.art');
const anonKey = process.env.MAPKLUSS_ANON_KEY?.trim() || '';
const timeoutMs = Number.parseInt(process.env.MAPKLUSS_MONITOR_TIMEOUT_MS || '15000', 10);
const minimumCertificateDays = Number.parseInt(process.env.MAPKLUSS_MIN_CERTIFICATE_DAYS || '14', 10);

await expectJson(`${apiUrl}/healthz`, (value) => value.ok === true && value.service === 'mapkluss-gateway');
await expectJson(`${apiUrl}/readyz`, (value) => (
  value.ok === true
  && value.stale === false
  && typeof value.checkedAt === 'number'
));
if (anonKey) {
  const headers = { apikey: anonKey, authorization: `Bearer ${anonKey}` };
  await expectStatus(`${apiUrl}/auth/v1/health`, 200, { headers });
  await expectStatus(`${apiUrl}/rest/v1/profiles?select=id&limit=0`, 200, { headers });
  await expectStatus(`${apiUrl}/storage/v1/object/list/mapartforge`, 200, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ prefix: 'mapkluss-monitor-nonexistent', limit: 1 }),
  });
  await expectStatus(`${apiUrl}/functions/v1/companion-api`, 200, {
    method: 'OPTIONS',
    headers: {
      ...headers,
      origin: stageUrl,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'apikey,authorization,content-type',
    },
  });
  await expectWebSocket(apiUrl, anonKey);
}
await expectSpa(`${stageUrl}/`);
await expectSpa(`${stageUrl}/cloud`, { allowErrorDocument: true });
await expectSpa(`${stageUrl}/device`, { allowErrorDocument: true });
await expectSpa(`${stageUrl}/art/mapkluss-monitor-route`, { allowErrorDocument: true });
await expectSpa(`${siteUrl}/`);
await expectSpa(`${siteUrl}/cloud`, { allowErrorDocument: true });
await verifyCertificate(new URL(apiUrl).hostname);
await verifyCertificate(new URL(stageUrl).hostname);
await verifyCertificate(new URL(siteUrl).hostname);
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

async function expectStatus(url, expectedStatus, options = {}) {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert(response.status === expectedStatus, `${url} returned ${response.status}`);
  await response.body?.cancel();
  console.log(`${new URL(url).pathname} data-plane ok`);
}

async function expectWebSocket(baseUrl, key) {
  assert(typeof WebSocket === 'function', 'This Node.js runtime does not provide WebSocket');
  const target = new URL('/realtime/v1/websocket', baseUrl);
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  target.searchParams.set('apikey', key);
  target.searchParams.set('vsn', '1.0.0');

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(target);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${target.hostname} Realtime WebSocket timed out`));
    }, timeoutMs);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`${target.hostname} Realtime WebSocket failed`));
    }, { once: true });
  });
  console.log(`${target.pathname} websocket ok`);
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
