export type SupabaseRouteKind = 'explicit' | 'gateway' | 'direct-fallback';

export interface SupabaseRoute {
  url: string;
  kind: SupabaseRouteKind;
}

export interface SupabaseRoutingOptions {
  explicitUrl?: string;
  gatewayUrl: string;
  directUrl: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 1_200;

export async function selectSupabaseRoute(options: SupabaseRoutingOptions): Promise<SupabaseRoute> {
  const explicitUrl = normalizeOptionalUrl(options.explicitUrl);
  if (explicitUrl) return { url: explicitUrl, kind: 'explicit' };

  const directUrl = normalizeUrl(options.directUrl);
  const gatewayUrl = normalizeOptionalUrl(options.gatewayUrl);
  if (!gatewayUrl || gatewayUrl === directUrl) {
    return { url: directUrl, kind: 'direct-fallback' };
  }

  const ready = await probeGateway(
    gatewayUrl,
    options.fetcher ?? fetch,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  return ready
    ? { url: gatewayUrl, kind: 'gateway' }
    : { url: directUrl, kind: 'direct-fallback' };
}

async function probeGateway(gatewayUrl: string, fetcher: typeof fetch, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const response = await fetcher(`${gatewayUrl}/readyz`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function normalizeOptionalUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? normalizeUrl(trimmed) : null;
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error(`Unsupported Supabase URL protocol: ${url.protocol}`);
  }
  return url.toString().replace(/\/$/, '');
}
