import { describe, expect, it, vi } from 'vitest';
import { selectSupabaseRoute } from '../supabaseRouting';
import { SUPABASE_AUTH_STORAGE_KEY } from '../supabase';

const gatewayUrl = 'https://api.mapkluss.art';
const directUrl = 'https://project.supabase.co';

describe('Supabase backend routing', () => {
  it('keeps an explicit endpoint override without probing the gateway', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const route = await selectSupabaseRoute({
      explicitUrl: 'https://override.example/',
      gatewayUrl,
      directUrl,
      fetcher,
    });

    expect(route).toEqual({ url: 'https://override.example', kind: 'explicit' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the gateway when its readiness probe succeeds', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const route = await selectSupabaseRoute({ gatewayUrl, directUrl, fetcher });

    expect(route).toEqual({ url: gatewayUrl, kind: 'gateway' });
    expect(fetcher).toHaveBeenCalledWith(`${gatewayUrl}/readyz`, expect.objectContaining({ method: 'GET' }));
  });

  it('falls back directly when the gateway is unavailable', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network unavailable'));
    const route = await selectSupabaseRoute({ gatewayUrl, directUrl, fetcher });

    expect(route).toEqual({ url: directUrl, kind: 'direct-fallback' });
  });

  it('falls back directly when readiness reports an unhealthy gateway', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }));
    const route = await selectSupabaseRoute({ gatewayUrl, directUrl, fetcher });

    expect(route).toEqual({ url: directUrl, kind: 'direct-fallback' });
  });

  it('preserves the existing production auth storage key across routes', () => {
    expect(SUPABASE_AUTH_STORAGE_KEY).toBe('sb-opxgnyadxybceldaokdi-auth-token');
  });
});
