import { describe, expect, it } from 'vitest';
import { detachEditorUrlFromCloudSource } from '../editorCloudSession';

describe('editor Cloud session URL', () => {
  it('removes every Cloud source identity after a successful save', () => {
    expect(detachEditorUrlFromCloudSource(
      'https://mapkluss.art/?art=old-art&artVersion=old-version&companionImport=scan&announcement=0#editor',
    )).toBe('https://mapkluss.art/?announcement=0#editor');
  });

  it('preserves unrelated editor options', () => {
    expect(detachEditorUrlFromCloudSource(
      'https://mapkluss.art/?palette=abc&cloudFolder=1&art=old-art',
    )).toBe('https://mapkluss.art/?palette=abc&cloudFolder=1');
  });
});
