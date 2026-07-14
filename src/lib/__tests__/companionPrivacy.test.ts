import { describe, expect, it } from 'vitest';

import { normalizeEditableArtPrivacy } from '../companionTypes';

describe('normalizeEditableArtPrivacy', () => {
  it('keeps first-release editable privacy limited to private and unlisted', () => {
    expect(normalizeEditableArtPrivacy('private')).toBe('private');
    expect(normalizeEditableArtPrivacy('unlisted')).toBe('unlisted');
    expect(normalizeEditableArtPrivacy('public')).toBe('unlisted');
    expect(normalizeEditableArtPrivacy(undefined)).toBe('unlisted');
    expect(normalizeEditableArtPrivacy(null)).toBe('unlisted');
  });
});
