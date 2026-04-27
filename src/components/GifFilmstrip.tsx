import { useRef, useEffect } from 'react';
import type { GifProject, GifFrameConfig } from '../lib/gifProject';

interface Props {
  project: GifProject;
  onFrameSelect: (index: number) => void;
  onConfigChange: (index: number, config: Partial<GifFrameConfig>) => void;
  onClose: () => void;
}

export function GifFilmstrip({ project, onFrameSelect, onClose }: Props) {
  const { frames, thumbnails, currentIndex } = project;
  const stripRef = useRef<HTMLDivElement>(null);

  // Scroll active thumb into view
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const thumb = strip.children[currentIndex] as HTMLElement | undefined;
    if (thumb) thumb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <div className="gif-filmstrip">
      <div className="gif-filmstrip-label">
        <span>GIF</span>
        <span className="gif-filmstrip-counter">{currentIndex + 1} / {frames.length}</span>
      </div>
      <div className="gif-filmstrip-scroll" ref={stripRef}>
        {thumbnails.map((src, i) => (
          <button
            key={i}
            className={`gif-filmstrip-thumb${i === currentIndex ? ' gif-filmstrip-thumb--active' : ''}`}
            onClick={() => onFrameSelect(i)}
            title={`Кадр ${i + 1}`}
          >
            <img src={src} alt={`Frame ${i + 1}`} />
            <span className="gif-filmstrip-num">{i + 1}</span>
          </button>
        ))}
      </div>
      <button className="gif-filmstrip-close" onClick={onClose} title="Закрыть GIF проект">✕</button>
    </div>
  );
}
