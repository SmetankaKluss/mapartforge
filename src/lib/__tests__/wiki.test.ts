import { describe, expect, it } from 'vitest';
import { getWikiArticleFromHash, getWikiArticleFromPath, isWikiPath, searchWiki } from '../wiki';

describe('MapKluss Wiki navigation', () => {
  it('resolves known hashes and falls back to the overview', () => {
    expect(getWikiArticleFromHash('#editing-tools').id).toBe('editing-tools');
    expect(getWikiArticleFromHash('#unknown').id).toBe('welcome');
    expect(getWikiArticleFromHash('').id).toBe('welcome');
  });

  it('recognises wiki routes and resolves article paths', () => {
    expect(isWikiPath('/wiki')).toBe(true);
    expect(isWikiPath('/wiki/editing-tools/')).toBe(true);
    expect(isWikiPath('/examples')).toBe(false);
    expect(getWikiArticleFromPath('/wiki/two-layer').id).toBe('two-layer');
    expect(getWikiArticleFromPath('/wiki/not-real').id).toBe('welcome');
  });

  it('searches Russian titles, English aliases, summaries, and keywords', () => {
    expect(searchWiki('палитра', 'ru')[0].id).toBe('palette-versions');
    expect(searchWiki('Litematic', 'ru').map(item => item.id)).toContain('export-files');
    expect(searchWiki('phantom', 'en')[0].id).toBe('lens');
  });

  it('treats hyphens and spaces as equivalent in search', () => {
    expect(searchWiki('two layer', 'ru')[0].id).toBe('two-layer');
  });

  it('returns the complete ordered index for an empty query', () => {
    const results = searchWiki('   ', 'ru');
    expect(results[0].id).toBe('welcome');
    expect(results.length).toBeGreaterThan(10);
  });
});
