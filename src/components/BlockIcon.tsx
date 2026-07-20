import { useState, useEffect } from 'react';
import { blockTextureUrl, isInSpritesheet, getCachedWikiTexture, fetchWikiTexture } from '../lib/blockTexture';
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
interface WikiResult {
  nbtName: string;
  state: WikiState;
}

/**
 * Renders a block texture icon.
 * - Blocks present in the MapartCraft spritesheet: renders from the spritesheet.
 * - Newly added blocks: fetches from the Minecraft Wiki, with a spinner while loading
 *   and a map-color square as error fallback.
 */
export function BlockIcon({ nbtName, blockId, csId, r, g, b, className = '' }: Props) {
  const inSprite = isInSpritesheet(csId, blockId);
  const cachedTexture = inSprite ? undefined : getCachedWikiTexture(nbtName);

  const [wikiResult, setWikiResult] = useState<WikiResult>(() => {
    if (cachedTexture === undefined) return { nbtName, state: 'loading' };
    return { nbtName, state: cachedTexture === null ? 'error' : 'loaded' };
  });

  const wikiState: WikiState = cachedTexture !== undefined
    ? (cachedTexture === null ? 'error' : 'loaded')
    : wikiResult.nbtName === nbtName
      ? wikiResult.state
      : 'loading';

  useEffect(() => {
    if (inSprite) return;
    if (cachedTexture !== undefined) return;

    let cancelled = false;
    fetchWikiTexture(nbtName).then(
      () => { if (!cancelled) setWikiResult({ nbtName, state: 'loaded' }); },
      () => { if (!cancelled) setWikiResult({ nbtName, state: 'error' }); },
    );
    return () => { cancelled = true; };
  }, [nbtName, inSprite, cachedTexture]);

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
        backgroundImage: `url(${blockTextureUrl(nbtName)})`,
        backgroundSize: 'cover',
        imageRendering: 'pixelated',
      }}
    />
  );
}
