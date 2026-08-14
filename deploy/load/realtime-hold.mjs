const baseUrl = new URL(process.env.MAPKLUSS_API_URL || 'https://api.mapkluss.art');
const anonKey = required('MAPKLUSS_ANON_KEY');
const levels = parseLevels(process.env.MAPKLUSS_LOAD_LEVELS || '10,25,50,100');
const holdMs = positiveInteger(process.env.MAPKLUSS_LOAD_HOLD_MS || '15000', 'hold duration');
const timeoutMs = positiveInteger(process.env.MAPKLUSS_LOAD_TIMEOUT_MS || '10000', 'timeout');

console.log(`MapKluss Realtime hold levels=${levels.join(',')} holdMs=${holdMs}`);

for (const clients of levels) {
  const openedAt = performance.now();
  const attempts = await Promise.all(Array.from({ length: clients }, () => openSocket()));
  const connected = attempts.filter((attempt) => attempt.ok);
  const failed = attempts.filter((attempt) => !attempt.ok);
  const openDurations = connected.map((attempt) => attempt.openMs);
  console.log(JSON.stringify({
    clients,
    connected: connected.length,
    errors: failed.length,
    openP50Ms: Math.round(percentile(openDurations, 0.5)),
    openP95Ms: Math.round(percentile(openDurations, 0.95)),
    openMaxMs: Math.round(Math.max(0, ...openDurations)),
  }));
  if (failed.length > 0) {
    for (const attempt of connected) attempt.socket.close();
    throw new Error(`Realtime connection failures at ${clients} clients`);
  }
  const remainingHoldMs = Math.max(0, holdMs - (performance.now() - openedAt));
  await delay(remainingHoldMs);
  for (const attempt of connected) attempt.socket.close();
  await delay(250);
}

console.log('MapKluss Realtime hold passed');

async function openSocket() {
  const target = new URL('/realtime/v1/websocket', baseUrl);
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  target.searchParams.set('apikey', anonKey);
  target.searchParams.set('vsn', '1.0.0');
  const startedAt = performance.now();
  return await new Promise((resolve) => {
    const socket = new WebSocket(target);
    const timer = setTimeout(() => {
      socket.close();
      resolve({ ok: false, error: 'TIMEOUT' });
    }, timeoutMs);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve({ ok: true, socket, openMs: performance.now() - startedAt });
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, error: 'WEBSOCKET_ERROR' });
    }, { once: true });
  });
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function parseLevels(value) {
  const levels = value.split(',').map((part) => positiveInteger(part.trim(), 'load level'));
  if (levels.length === 0 || levels.length > 8) throw new Error('Expected 1 to 8 load levels');
  return [...new Set(levels)].sort((left, right) => left - right);
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
