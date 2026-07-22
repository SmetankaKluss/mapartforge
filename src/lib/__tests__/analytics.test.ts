import { describe, expect, it } from 'vitest';
import { sanitizeAnalyticsPath } from '../analytics';

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
