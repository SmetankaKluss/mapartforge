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

export function selectCollectionItemsFromSnapshot(
  artIds: string[],
  arts: CompanionLibraryItem[],
  favorites: CompanionLibraryItem[],
): { items: CompanionLibraryItem[]; missingArtIds: string[] } {
  const byArtId = new Map<string, CompanionLibraryItem>();
  for (const art of arts) byArtId.set(art.artId, art);
  for (const favorite of favorites) {
    byArtId.set(favorite.artId, { ...favorite, isFavorite: true });
  }

  const items: CompanionLibraryItem[] = [];
  const missingArtIds: string[] = [];
  const seen = new Set<string>();
  for (const artId of artIds) {
    if (seen.has(artId)) continue;
    seen.add(artId);
    const item = byArtId.get(artId);
    if (item) items.push(item);
    else missingArtIds.push(artId);
  }
  return { items, missingArtIds };
}
