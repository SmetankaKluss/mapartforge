import { describe, expect, it } from 'vitest';
import { getExampleByPath, isExamplesIndexPath } from '../examples';

describe('example routes', () => {
  it('accepts the catalogue route with or without a trailing slash', () => {
    expect(isExamplesIndexPath('/examples')).toBe(true);
    expect(isExamplesIndexPath('/examples/')).toBe(true);
    expect(isExamplesIndexPath('/examples/mapkluss-logo')).toBe(false);
  });

  it('accepts example detail routes with or without a trailing slash', () => {
    expect(getExampleByPath('/examples/mapkluss-logo')?.id).toBe('mapkluss-logo');
    expect(getExampleByPath('/examples/mapkluss-logo/')?.id).toBe('mapkluss-logo');
    expect(getExampleByPath('/examples/unknown/')).toBeUndefined();
  });
});
