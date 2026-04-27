import { useRef, useState, useEffect, useCallback } from 'react';
import { useLocale } from '../lib/locale';

interface Props {
  imageData: ImageData | null;
  onClose: () => void;
}

interface BgPreset {
  id: string;
  label: string;
  labelEn: string;
  style: React.CSSProperties;
  floorStyle: React.CSSProperties;
}

const BG_PRESETS: BgPreset[] = [
  {
    id: 'oak',
    label: 'Дубовая комната',
    labelEn: 'Oak Room',
    style: {
      background: 'linear-gradient(180deg, #3a2a1a 0%, #2e1e10 60%, #241508 100%)',
    },
    floorStyle: {
      background: 'repeating-linear-gradient(90deg, #5a3a1a 0px, #5a3a1a 31px, #4a2e12 32px, #4a2e12 63px)',
    },
  },
  {
    id: 'stone',
    label: 'Каменное подземелье',
    labelEn: 'Stone Dungeon',
    style: {
      background: 'linear-gradient(180deg, #1a1a1a 0%, #141414 50%, #0e0e0e 100%)',
    },
    floorStyle: {
      background: 'repeating-linear-gradient(90deg, #2a2a2a 0px, #2a2a2a 31px, #222222 32px, #222222 63px)',
    },
  },
  {
    id: 'nether',
    label: 'Нижний мир',
    labelEn: 'Nether',
    style: {
      background: 'linear-gradient(180deg, #3d0a00 0%, #5a1200 40%, #3d0a00 100%)',
    },
    floorStyle: {
      background: 'repeating-linear-gradient(90deg, #6b1500 0px, #6b1500 31px, #540f00 32px, #540f00 63px)',
    },
  },
  {
    id: 'snow',
    label: 'Снежная тундра',
    labelEn: 'Snowy Tundra',
    style: {
      background: 'linear-gradient(180deg, #b0c8e0 0%, #c8dff0 40%, #ddeeff 100%)',
    },
    floorStyle: {
      background: 'repeating-linear-gradient(90deg, #e8f4ff 0px, #e8f4ff 31px, #ddeeff 32px, #ddeeff 63px)',
    },
  },
  {
    id: 'desert',
    label: 'Пустыня',
    labelEn: 'Desert',
    style: {
      background: 'linear-gradient(180deg, #d4a843 0%, #c8962e 50%, #b8821c 100%)',
    },
    floorStyle: {
      background: 'repeating-linear-gradient(90deg, #d4a843 0px, #d4a843 31px, #c49030 32px, #c49030 63px)',
    },
  },
  {
    id: 'night',
    label: 'Ночь',
    labelEn: 'Night',
    style: {
      background: 'linear-gradient(180deg, #050a14 0%, #081020 50%, #050a14 100%)',
    },
    floorStyle: {
      background: 'repeating-linear-gradient(90deg, #0a1428 0px, #0a1428 31px, #081020 32px, #081020 63px)',
    },
  },
];

export function PerspectiveModal({ imageData, onClose }: Props) {
  const { t } = useLocale();
  const [bgId, setBgId] = useState('oak');
  const [rotY, setRotY] = useState(-12);
  const [rotX, setRotX] = useState(4);
  const [downloading, setDownloading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  const bg = BG_PRESETS.find(b => b.id === bgId) ?? BG_PRESETS[0];

  // Draw imageData onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(imageData, 0, 0);
  }, [imageData]);

  const handleDownload = useCallback(async () => {
    const scene = sceneRef.current;
    if (!scene || !imageData) return;
    setDownloading(true);

    try {
      // Compose: background + frame + map art on a flat export canvas
      const scale = 4;
      const mapW = imageData.width;
      const mapH = imageData.height;
      const padX = 80 * scale;
      const padY = 60 * scale;
      const frameW = 6 * scale;
      const exportW = mapW * scale + padX * 2 + frameW * 2;
      const exportH = mapH * scale + padY * 2 + frameW * 2;

      const out = document.createElement('canvas');
      out.width = exportW;
      out.height = exportH;
      const ctx = out.getContext('2d')!;

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, exportH);
      // Parse the gradient from style - simplified: use solid color approximation
      const bgColors: Record<string, string[]> = {
        oak:    ['#3a2a1a', '#241508'],
        stone:  ['#1a1a1a', '#0e0e0e'],
        nether: ['#3d0a00', '#3d0a00'],
        snow:   ['#b0c8e0', '#ddeeff'],
        desert: ['#d4a843', '#b8821c'],
        night:  ['#050a14', '#050a14'],
      };
      const [c1, c2] = bgColors[bgId] ?? ['#111', '#000'];
      bgGrad.addColorStop(0, c1);
      bgGrad.addColorStop(1, c2);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, exportW, exportH);

      // Draw floor tiles
      const tileSize = 32 * scale;
      const floorY = padY + mapH * scale + frameW * 2;
      const floorColors: Record<string, [string, string]> = {
        oak:    ['#5a3a1a', '#4a2e12'],
        stone:  ['#2a2a2a', '#222222'],
        nether: ['#6b1500', '#540f00'],
        snow:   ['#e8f4ff', '#ddeeff'],
        desert: ['#d4a843', '#c49030'],
        night:  ['#0a1428', '#081020'],
      };
      const [fc1, fc2] = floorColors[bgId] ?? ['#333', '#222'];
      for (let x = 0; x < exportW; x += tileSize) {
        const col = Math.floor(x / tileSize) % 2;
        ctx.fillStyle = col === 0 ? fc1 : fc2;
        ctx.fillRect(x, floorY, tileSize, exportH - floorY);
      }

      // Wooden frame (dark brown border)
      const frameX = padX;
      const frameY = padY;
      ctx.fillStyle = '#4a2800';
      ctx.fillRect(frameX, frameY, mapW * scale + frameW * 2, mapH * scale + frameW * 2);
      // Inner lighter frame highlight
      ctx.fillStyle = '#6b3a00';
      ctx.fillRect(frameX + 1, frameY + 1, mapW * scale + frameW * 2 - 2, 2);
      ctx.fillRect(frameX + 1, frameY + 1, 2, mapH * scale + frameW * 2 - 2);

      // Map art
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = mapW;
      tempCanvas.height = mapH;
      const tCtx = tempCanvas.getContext('2d')!;
      tCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, frameX + frameW, frameY + frameW, mapW * scale, mapH * scale);

      out.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mapkluss-preview.png';
        a.click();
        URL.revokeObjectURL(url);
        setDownloading(false);
      }, 'image/png');
    } catch {
      setDownloading(false);
    }
  }, [imageData, bgId]);

  const frameThick = Math.max(8, Math.min(24, Math.round((imageData?.width ?? 128) * 0.05)));

  return (
    <div className="persp-overlay" onClick={onClose}>
      <div className="persp-modal" onClick={e => e.stopPropagation()}>
        <div className="persp-header">
          <span className="persp-title">🖼 {t('ПРЕДПРОСМОТР', 'PREVIEW')}</span>
          <button className="persp-close" onClick={onClose}>×</button>
        </div>

        {/* Scene */}
        <div className="persp-scene-wrap" style={bg.style}>
          {/* Floor */}
          <div className="persp-floor" style={bg.floorStyle} />

          {/* 3D Map on wall */}
          <div
            ref={sceneRef}
            className="persp-map-3d"
            style={{ transform: `perspective(900px) rotateY(${rotY}deg) rotateX(${rotX}deg)` }}
          >
            {/* Wooden frame */}
            <div className="persp-frame" style={{ padding: frameThick }}>
              <canvas ref={canvasRef} className="persp-canvas" />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="persp-controls">
          {/* BG presets */}
          <div className="persp-bg-row">
            <span className="persp-control-label">{t('ФОН', 'BACKGROUND')}</span>
            <div className="persp-bg-presets">
              {BG_PRESETS.map(p => (
                <button
                  key={p.id}
                  className={`persp-bg-btn${bgId === p.id ? ' active' : ''}`}
                  style={p.style}
                  title={t(p.label, p.labelEn)}
                  onClick={() => setBgId(p.id)}
                >
                  <span className="persp-bg-label">{t(p.label, p.labelEn)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rotation sliders */}
          <div className="persp-sliders">
            <div className="persp-slider-row">
              <span className="persp-control-label">{t('ПОВОРОТ Y', 'ROTATE Y')}</span>
              <input type="range" min={-45} max={45} value={rotY} onChange={e => setRotY(Number(e.target.value))} className="persp-slider" />
              <span className="persp-slider-val">{rotY}°</span>
            </div>
            <div className="persp-slider-row">
              <span className="persp-control-label">{t('ПОВОРОТ X', 'ROTATE X')}</span>
              <input type="range" min={-30} max={30} value={rotX} onChange={e => setRotX(Number(e.target.value))} className="persp-slider" />
              <span className="persp-slider-val">{rotX}°</span>
            </div>
          </div>

          {/* Actions */}
          <div className="persp-actions">
            <button className="persp-reset-btn" onClick={() => { setRotY(-12); setRotX(4); }}>
              {t('Сбросить', 'Reset')}
            </button>
            <button className="persp-download-btn" onClick={handleDownload} disabled={downloading}>
              {downloading ? t('Сохранение...', 'Saving...') : `↓ ${t('Скачать PNG', 'Download PNG')}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
