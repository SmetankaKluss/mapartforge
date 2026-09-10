import { useEffect, useMemo, useRef, useState } from 'react';
import { gatheringMask, revealGathering } from '../lib/trackerPreview';
import type { SessionMaterial } from '../lib/buildSession';

export function TrackerPreview({ src, materials, gathered, original, building, wide, tall, selected, lang, liveImage }: {
  src: string; materials: SessionMaterial[]; gathered: Record<string, number>; original: boolean;
  building: boolean; wide: number; tall: number; selected: number; lang: 'ru' | 'en'; liveImage?: ImageData | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<{ src: string; data: ImageData } | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!active) return;
      try {
        if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 16777216) throw new Error('image bounds');
        const surface = document.createElement('canvas');
        const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        surface.width = Math.max(1, Math.round(img.naturalWidth * scale));
        surface.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = surface.getContext('2d', { willReadFrequently: true })!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, surface.width, surface.height);
        setImage({ src, data: ctx.getImageData(0, 0, surface.width, surface.height) });
      } catch { setFailed(src); }
    };
    img.onerror = () => { if (active) setFailed(src); };
    img.src = src;
    return () => { active = false; img.onload = img.onerror = null; };
  }, [src]);
  const data = image && image.src === src ? image.data : null;
  const mask = useMemo(() => data ? gatheringMask(data.data, materials) : null, [data, materials]);
  const shown = building && !original && liveImage ? liveImage : data;
  useEffect(() => {
    if (!canvas.current || !shown) return;
    const element = canvas.current;
    element.width = shown.width; element.height = shown.height;
    const output = shown === liveImage || original || !mask ? shown : new ImageData(revealGathering(shown.data, mask, building ? {} : gathered), shown.width, shown.height);
    element.getContext('2d')!.putImageData(output, 0, 0);
  }, [shown, liveImage, mask, gathered, original, building]);
  return <div className="bt-art-surface">
    {shown ? <div className="bt-art-image" style={{ aspectRatio: `${shown.width} / ${shown.height}`, width: `min(100cqw, ${100 * shown.width / shown.height}cqh)` }}>
      <canvas ref={canvas} role="img" aria-label={lang === 'ru' ? 'Превью арта' : 'Artwork preview'} />
      {selected >= 0 && <span className="bt-map-outline" style={{ width: `${100 / wide}%`, height: `${100 / tall}%`, left: `${selected % wide * 100 / wide}%`, top: `${Math.floor(selected / wide) * 100 / tall}%` }} />}
    </div> : <p role="status">{failed === src ? (lang === 'ru' ? 'Превью недоступно' : 'Preview unavailable') : (lang === 'ru' ? 'Загружаю превью…' : 'Loading preview…')}</p>}
  </div>;
}
