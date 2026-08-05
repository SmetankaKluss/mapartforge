export type CloudSnapshotItem = {
  artId: string;
  isFavorite: boolean;
  updatedAt: string;
};

export function deriveCloudArtSnapshot<T extends CloudSnapshotItem>(
  arts: readonly T[],
  favorites: readonly T[],
  recentLimit = 30,
): { arts: T[]; favorites: T[]; recent: T[] } {
  const byId = new Map<string, T>();
  for (const item of [...arts, ...favorites]) {
    const existing = byId.get(item.artId);
    byId.set(
      item.artId,
      existing
        ? { ...existing, isFavorite: existing.isFavorite || item.isFavorite }
        : item,
    );
  }

  const recent = Array.from(byId.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, Math.max(0, recentLimit));
  return { arts: [...arts], favorites: [...favorites], recent };
}
