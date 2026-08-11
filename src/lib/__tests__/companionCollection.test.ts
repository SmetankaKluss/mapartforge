import { describe, expect, it } from 'vitest';
import { buildCollectionOverview } from '../companionCollection';
import type { CompanionCollection, CompanionLibraryItem } from '../companionTypes';

const collection: CompanionCollection = {
  id: 'collection-a',
  name: 'Build queue',
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  itemCount: 99,
};

const item: CompanionLibraryItem = {
  artId: 'art-a',
  currentVersionId: 'version-a',
  title: 'Test art',
  privacy: 'private',
  grid: { wide: 1, tall: 1 },
  mode: '2d',
  previewUrl: null,
  updatedAt: '2026-08-12T00:00:00.000Z',
  isFavorite: false,
};

describe('buildCollectionOverview', () => {
  it('combines the stable collection and item responses', () => {
    expect(buildCollectionOverview([collection], [item], collection.id)).toEqual({
      collection: { ...collection, itemCount: 1 },
      items: [item],
    });
  });

  it('rejects collections that are not visible to the current account', () => {
    expect(() => buildCollectionOverview([collection], [], 'missing')).toThrow('Collection is unavailable.');
  });
});
