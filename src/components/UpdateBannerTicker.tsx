import { useLayoutEffect, useRef, useState } from 'react';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

interface UpdateBannerTickerProps {
  headline: string;
  detail: string;
}

export function UpdateBannerTicker({ headline, detail }: UpdateBannerTickerProps) {
  const tickerRef = useRef<HTMLDivElement>(null);
  const segmentRef = useRef<HTMLSpanElement>(null);
  const [copyCount, setCopyCount] = useState(1);

  useLayoutEffect(() => {
    const ticker = tickerRef.current;
    const segment = segmentRef.current;
    if (!ticker || !segment) return;

    const measure = () => {
      const tickerWidth = ticker.clientWidth;
      const segmentWidth = segment.getBoundingClientRect().width;
      const gap = Number.parseFloat(getComputedStyle(ticker).getPropertyValue('--ticker-gap')) || 0;
      if (tickerWidth <= 0 || segmentWidth <= 0) return;

      const nextCopyCount = Math.max(1, Math.ceil(tickerWidth / (segmentWidth + gap)));
      const groupWidth = nextCopyCount * (segmentWidth + gap);

      ticker.style.setProperty('--ticker-duration', `${Math.max(15, groupWidth / 65).toFixed(2)}s`);
      setCopyCount(nextCopyCount);
    };

    measure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(ticker);
      observer.observe(segment);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [detail, headline]);

  return (
    <div className="update-banner-ticker" aria-hidden="true" ref={tickerRef}>
      <div className="update-banner-track">
        {[0, 1].map(group => (
          <div className="update-banner-group" key={group}>
            {Array.from({ length: copyCount }, (_, copy) => (
              <span
                className="update-banner-segment"
                key={copy}
                ref={group === 0 && copy === 0 ? segmentRef : undefined}
              >
                <strong>{headline}</strong>
                <i />
                <span>{detail}</span>
                <IconGlyph icon={mkIcons.arrowRight} size={14} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
