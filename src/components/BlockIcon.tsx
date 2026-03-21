import { useState, useEffect } from 'react';
import { isInSpritesheet, getCachedWikiTexture, fetchWikiTexture, wikiTextureUrl } from '../lib/blockTexture';
import { SPRITE_URL } from './BlockCanvas';

interface Props {
  nbtName: string;
  blockId: number;
  csId: number;
  /** Map color RGB — used for loading placeholder and error fallback. */
  r: number; g: number; b: number;
  className?: string;
}

type WikiState = 'loading' | 'loaded' | 'error';

/**
 * Renders a block texture icon.
 * - Blocks present in the MapartCraft spritesheet: renders from the spritesheet.
 * - Newly added blocks: fetches from the Minecraft Wiki, with a spinner while loading
 *   and a map-color square as error fallback.
 */
export function BlockIcon({ nbtName, blockId, csId, r, g, b, className = '' }: Props) {
  const inSprite = isInSpritesheet(csId, blockId);

  const [wikiState, setWikiState] = useState<WikiState>(() => {
    if (inSprite) return 'loaded'; // state unused for sprite blocks
    const cached = getCachedWikiTexture(nbtName);
    if (cached === undefined) return 'loading';
    return cached === null ? 'error' : 'loaded';
  });

  useEffect(() => {
    if (inSprite) return;

    // Already resolved?
    const cached = getCachedWikiTexture(nbtName);
    if (cached !== undefined) {
      setWikiState(cached === null ? 'error' : 'loaded');
      return;
    }

    let cancelled = false;
    fetchWikiTexture(nbtName).then(
      () => { if (!cancelled) setWikiState('loaded'); },
      () => { if (!cancelled) setWikiState('error'); },
    );
    return () => { cancelled = true; };
  }, [nbtName, inSprite]);

  if (inSprite) {
    return (
      <span
        className={className}
        style={{
          backgroundImage: `url(${SPRITE_URL})`,
          backgroundPosition: `-${blockId * 32}px -${csId * 32}px`,
        }}
      />
    );
  }

  if (wikiState === 'loading') {
    return (
      <span
        className={`${className} block-icon-loading`}
        style={{ backgroundColor: `rgb(${r},${g},${b})` }}
      />
    );
  }

  if (wikiState === 'error') {
    return (
      <span
        className={`${className} block-icon-fallback`}
        style={{ background: `rgb(${r},${g},${b})` }}
        title="Texture unavailable"
      />
    );
  }

  // Loaded — render wiki texture
  return (
    <span
      className={`${className} block-icon-wiki`}
      style={{
        backgroundImage: `url(${wikiTextureUrl(nbtName)})`,
        backgroundSize: 'cover',
        imageRendering: 'pixelated',
      }}
    />
  );
}
