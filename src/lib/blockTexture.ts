// Maps csId → the highest blockId present in the MapartCraft spritesheet for that row.
// Any blockId above this value was added by us and needs a wiki-texture fallback.
const SPRITESHEET_ROW_MAX: Partial<Record<number, number>> = {
   1: 12,   // Sand — new blocks start at 13
   8: 10,   // Dirt — new blocks start at 11
   9: 14,   // Stone — new blocks start at 15
  12:  5,   // Birch — new blocks start at 6 (pale oak and others need wiki)
  35:  1,   // White Terracotta — calcite=1 in sprite; cherry blocks (id 2+) need wiki
  41:  0,   // Pink Terracotta — stripped_cherry_log/wood (id 1+) need wiki
  42:  1,   // Gray Terracotta — tuff=1 is in sprite; cherry_log+ and tuff variants need wiki
  14: 19,   // Orange — new blocks start at 20
  15:  7,   // Magenta — new blocks start at 8
  23:  7,   // Purple — new blocks start at 8
  43:  4,   // Light Gray Terracotta — new blocks start at 5
  36:  0,   // Orange Terracotta — Resin Clump at blockId 1 needs wiki texture
  54:  2,   // Warped Nylium — new blocks start at 3
  55:  6,   // Warped Stem — new blocks start at 7
  58:  2,   // Deepslate — new blocks start at 3
};

// Overrides for blocks where simple Title_Case doesn't match the wiki file name.
// Slabs share texture files with their parent blocks; logs use the top-face texture.
const WIKI_NAME_OVERRIDES: Record<string, string> = {
  // Slabs: use parent block texture (no dedicated slab PNG on the wiki)
  tuff_brick_slab:     'Tuff_Bricks',
  polished_tuff_slab:  'Polished_Tuff',
  pale_oak_slab:       'Pale_Oak_Planks',
  cherry_slab:         'Cherry_Planks',
  // Logs: show top face for a cleaner palette icon
  pale_oak_log:            'Pale_Oak_Log_Top',
  stripped_pale_oak_log:   'Stripped_Pale_Oak_Log_Top',
  cherry_log:              'Cherry_Log_Top',
  stripped_cherry_log:     'Stripped_Cherry_Log_Top',
};

/** True if the (csId, blockId) pair has an entry in the MapartCraft spritesheet. */
export function isInSpritesheet(csId: number, blockId: number): boolean {
  const max = SPRITESHEET_ROW_MAX[csId];
  return max === undefined || blockId <= max;
}

/** Build the Minecraft Wiki Special:FilePath URL for a block texture.
 *  Uses WIKI_NAME_OVERRIDES first, then falls back to simple Title_Case. */
export function wikiTextureUrl(nbtName: string): string {
  const filename = WIKI_NAME_OVERRIDES[nbtName] ?? nbtName
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('_');
  return `https://minecraft.wiki/w/Special:FilePath/${filename}.png`;
}

// Module-level cache: nbtName → resolved URL string (success) | null (error) | undefined (not fetched)
const cache = new Map<string, string | null>();

// In-flight callbacks: nbtName → array of (url | null) → void
const pending = new Map<string, Array<(result: string | null) => void>>();

/** Return the cached texture result, or undefined if not yet fetched. */
export function getCachedWikiTexture(nbtName: string): string | null | undefined {
  return cache.get(nbtName);
}

/**
 * Fetch (or return from cache) the wiki texture URL for a block.
 * Multiple concurrent calls for the same nbtName share one in-flight request.
 * Resolves with the wiki URL on success; rejects on failure.
 */
export function fetchWikiTexture(nbtName: string): Promise<string> {
  const cached = cache.get(nbtName);
  if (cached === null) return Promise.reject(new Error('texture load failed'));
  if (cached !== undefined) return Promise.resolve(cached);

  return new Promise<string>((resolve, reject) => {
    if (!pending.has(nbtName)) {
      pending.set(nbtName, []);

      const url = wikiTextureUrl(nbtName);
      const img = new Image();
      // No crossOrigin — we only use the URL for CSS background-image (no canvas access needed)
      img.onload = () => {
        cache.set(nbtName, url);
        pending.get(nbtName)?.forEach(cb => cb(url));
        pending.delete(nbtName);
      };
      img.onerror = () => {
        cache.set(nbtName, null);
        pending.get(nbtName)?.forEach(cb => cb(null));
        pending.delete(nbtName);
      };
      img.src = url;
    }

    pending.get(nbtName)!.push(result => {
      if (result === null) reject(new Error('texture load failed'));
      else resolve(result);
    });
  });
}
