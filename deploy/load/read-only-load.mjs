const gatewayUrl = normalizeUrl(process.env.MAPKLUSS_API_URL || 'https://api.mapkluss.art');
const directUrl = normalizeUrl(process.env.MAPKLUSS_DIRECT_API_URL || 'https://opxgnyadxybceldaokdi.supabase.co');
const anonKey = required('MAPKLUSS_ANON_KEY');
const timeoutMs = positiveInteger(process.env.MAPKLUSS_LOAD_TIMEOUT_MS || '10000', 'timeout');
const maxP95Ms = positiveInteger(process.env.MAPKLUSS_LOAD_MAX_P95_MS || '3000', 'p95 limit');
const rampMs = positiveInteger(process.env.MAPKLUSS_LOAD_RAMP_MS || '10000', 'ramp duration');
const maxErrorRate = Number.parseFloat(process.env.MAPKLUSS_LOAD_MAX_ERROR_RATE || '0.02');
const levels = parseLevels(process.env.MAPKLUSS_LOAD_LEVELS || '10,25,50,100');
const mode = process.argv.includes('--direct') ? 'direct' : 'gateway';
const baseUrl = mode === 'direct' ? directUrl : gatewayUrl;

if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) {
  throw new Error('MAPKLUSS_LOAD_MAX_ERROR_RATE must be between 0 and 1');
}

console.log(`MapKluss read-only load target=${mode} levels=${levels.join(',')}`);

for (const clients of levels) {
  const startedAt = performance.now();
  const results = await Promise.all(Array.from({ length: clients }, (_, index) => runClient(index, clients)));
  const elapsedMs = performance.now() - startedAt;
  const requests = results.flat();
  const failed = requests.filter((result) => !result.ok);
  const durations = requests.filter((result) => result.ok).map((result) => result.durationMs);
  const errorRate = requests.length === 0 ? 1 : failed.length / requests.length;
  const summary = {
    clients,
    requests: requests.length,
    elapsedMs: Math.round(elapsedMs),
    p50Ms: Math.round(percentile(durations, 0.5)),
    p95Ms: Math.round(percentile(durations, 0.95)),
    maxMs: Math.round(Math.max(0, ...durations)),
    errorRate: Number(errorRate.toFixed(4)),
  };
  console.log(JSON.stringify(summary));

  for (const [name, operationResults] of groupByName(requests)) {
    const successful = operationResults.filter((result) => result.ok).map((result) => result.durationMs);
    console.log(JSON.stringify({
      operation: name,
      p50Ms: Math.round(percentile(successful, 0.5)),
      p95Ms: Math.round(percentile(successful, 0.95)),
      errors: operationResults.length - successful.length,
    }));
  }

  if (failed.length > 0) {
    const failures = [...new Set(failed.map((result) => `${result.name}:${result.error}`))].slice(0, 5);
    console.error(`failures=${failures.join(', ')}`);
  }
  if (errorRate > maxErrorRate || summary.p95Ms > maxP95Ms) {
    throw new Error(`Stop gate reached at ${clients} clients (errorRate=${errorRate}, p95=${summary.p95Ms}ms)`);
  }
}

console.log('MapKluss read-only load passed');

async function runClient(index, clients) {
  // Spread arrivals across a fixed ramp so the test resembles clients joining, not one SYN flood.
  if (index > 0) await delay(Math.floor((index / clients) * rampMs));
  const headers = { apikey: anonKey, authorization: `Bearer ${anonKey}` };
  const operations = mode === 'gateway'
    ? [
      ['health', () => request('/healthz', 200)],
      ['ready', () => request('/readyz', 200)],
    ]
    : [];
  operations.push(
    ['rest', () => request('/rest/v1/profiles?select=id&limit=0', 200, { headers })],
    ['storage', () => request('/storage/v1/object/list/mapartforge', 200, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: 'mapkluss-load-nonexistent', limit: 1 }),
    })],
    ['cloud_edge', () => request('/functions/v1/companion-api', 401, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'library' }),
    })],
    ['lens_edge', () => request('/functions/v1/companion-lens', 401, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'session_poll' }),
    })],
    ['realtime', () => openRealtime()],
  );

  const output = [];
  for (const [name, operation] of operations) {
    const startedAt = performance.now();
    try {
      await operation();
      output.push({ name, ok: true, durationMs: performance.now() - startedAt });
    } catch (error) {
      output.push({ name, ok: false, durationMs: performance.now() - startedAt, error: safeError(error) });
    }
  }
  return output;
}

async function request(path, expectedStatus, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== expectedStatus) throw new Error(`HTTP_${response.status}`);
  await response.body?.cancel();
}

async function openRealtime() {
  if (typeof WebSocket !== 'function') throw new Error('WEBSOCKET_UNAVAILABLE');
  const target = new URL('/realtime/v1/websocket', baseUrl);
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  target.searchParams.set('apikey', anonKey);
  target.searchParams.set('vsn', '1.0.0');
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(target);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('TIMEOUT'));
    }, timeoutMs);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WEBSOCKET_ERROR'));
    }, { once: true });
  });
}

export function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function parseLevels(value) {
  const parsed = value.split(',').map((part) => positiveInteger(part.trim(), 'load level'));
  if (parsed.length === 0 || parsed.length > 8) throw new Error('Expected 1 to 8 load levels');
  return [...new Set(parsed)].sort((left, right) => left - right);
}

function groupByName(results) {
  const grouped = new Map();
  for (const result of results) {
    if (!grouped.has(result.name)) grouped.set(result.name, []);
    grouped.get(result.name).push(result);
  }
  return grouped;
}

function normalizeUrl(value) {
  return new URL(value).toString().replace(/\/$/, '');
}

function positiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error) {
  return error instanceof Error ? error.message.slice(0, 80) : 'UNKNOWN_ERROR';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
