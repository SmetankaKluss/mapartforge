import { describe, expect, it } from 'vitest';
import { canonicalPublicPath, getSeoPageByPath, SEO_PAGES } from '../seoPages';

describe('SEO routes', () => {
  it('resolves guide pages with or without a trailing slash', () => {
    const page = SEO_PAGES[0];
    expect(getSeoPageByPath(page.path)).toBe(page);
    expect(getSeoPageByPath(`${page.path}/`)).toBe(page);
  });

  it('returns no page for an unknown path', () => {
    expect(getSeoPageByPath('/not-a-guide/')).toBeUndefined();
  });

  it('produces canonical directory paths', () => {
    expect(canonicalPublicPath('/')).toBe('/');
    expect(canonicalPublicPath('/examples')).toBe('/examples/');
    expect(canonicalPublicPath('/examples///')).toBe('/examples/');
  });
});
