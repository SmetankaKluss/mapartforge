import type {
  CompanionCollection,
  CompanionCollectionOverview,
  CompanionLibraryItem,
} from './companionTypes';

export function buildCollectionOverview(
  collections: CompanionCollection[],
  items: CompanionLibraryItem[],
  collectionId: string,
): CompanionCollectionOverview {
  const collection = collections.find(candidate => candidate.id === collectionId);
  if (!collection) throw new Error('Collection is unavailable.');

  return {
    collection: {
      ...collection,
      itemCount: items.length,
    },
    items,
  };
}
