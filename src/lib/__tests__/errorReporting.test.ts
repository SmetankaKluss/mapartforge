import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://mapkluss.art' } });
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/140.0' });
});

afterEach(() => vi.unstubAllGlobals());

describe('safe client error telemetry', () => {
  it('classifies an error without exposing its message, URL, or stack', async () => {
    const { buildSafeClientErrorTelemetry } = await import('../errorReporting');
    const result = buildSafeClientErrorTelemetry({
      message: 'Failed token for builder@example.com: insertBefore',
      source: 'https://mapkluss.art/assets/App.js?token=secret',
      line: 12,
      stackHead: 'private stack data',
    }, 'editor', 'runtime');

    expect(result).toEqual({
      error_category: 'insert_before',
      error_origin: 'first_party',
      error_kind: 'runtime',
      has_location: true,
      page_type: 'editor',
      app_version: expect.stringMatching(/^v\d+\.\d+\.\d+$/),
      user_agent_family: 'chrome',
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('builder@example.com');
  });
});
