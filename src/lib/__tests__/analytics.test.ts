import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsParams, sanitizeAnalyticsPath } from '../analytics';

describe('analytics path sanitization', () => {
  it('keeps acquisition parameters in a stable order', () => {
    expect(sanitizeAnalyticsPath('/wiki?utm_campaign=launch&utm_source=shadowmonya&utm_medium=youtube')).toBe(
      '/wiki?utm_source=shadowmonya&utm_medium=youtube&utm_campaign=launch',
    );
  });

  it('removes editor, cloud, share, and device identifiers', () => {
    expect(sanitizeAnalyticsPath('/?share=private-art&art=uuid&p=%2Fcloud&utm_source=svinland&utm_content=guide')).toBe(
      '/?utm_source=svinland&utm_content=guide',
    );
    expect(sanitizeAnalyticsPath('/device?code=secret&token=private')).toBe('/device');
  });

  it('returns a safe root for malformed input', () => {
    expect(sanitizeAnalyticsPath('http://%')).toBe('/');
  });
});

describe('sanitizeAnalyticsParams', () => {
  it('removes identifiers, credentials, raw errors, and user-created labels', () => {
    expect(sanitizeAnalyticsParams({
      email: 'builder@example.com',
      art_id: 'private-uuid',
      token: 'secret',
      title: 'user art title',
      message: 'request failed with token=secret',
      stack_head: 'private stack',
      event_surface: 'editor',
      map_wide: 3,
    })).toEqual({ event_surface: 'editor', map_wide: 3 });
  });

  it('sanitizes path values and bounds arbitrary strings', () => {
    expect(sanitizeAnalyticsParams({
      path: '/device?code=SECRET&utm_source=guide',
      label: 'x'.repeat(140),
    })).toEqual({ path: '/device?utm_source=guide', label: 'x'.repeat(100) });
  });
});
