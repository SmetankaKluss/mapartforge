import { describe, expect, it } from 'vitest';
import { normalizeAppRoutePath } from '../appRoutePath';

describe('app route paths', () => {
  it('accepts fixed application routes with or without a trailing slash', () => {
    expect(normalizeAppRoutePath('/cloud')).toBe('/cloud');
    expect(normalizeAppRoutePath('/cloud/')).toBe('/cloud');
    expect(normalizeAppRoutePath('/device/')).toBe('/device');
  });

  it('keeps the editor root and removes duplicate trailing slashes', () => {
    expect(normalizeAppRoutePath('/')).toBe('/');
    expect(normalizeAppRoutePath('/cloud///')).toBe('/cloud');
  });
});
