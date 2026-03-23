import { useState, useRef, useEffect, useCallback } from 'react';

interface CropBox { x: number; y: number; w: number; h: number; }
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface Props {
  sourceImage: HTMLImageElement;
  targetW: number;
  targetH: number;
  onApply: (img: HTMLImageElement) => void;
  onCancel: () => void;
}

const MAX_DISP = 680;

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function initCrop(imgW: number, imgH: number, ratio: number): CropBox {
  if (imgW / imgH > ratio) {
    const h = imgH, w = h * ratio;
    return { x: (imgW - w) / 2, y: 0, w, h };
  } else {
    const w = imgW, h = w / ratio;
    return { x: 0, y: (imgH - h) / 2, w, h };
  }
}

export function CropModal({ sourceImage, targetW, targetH, onApply, onCancel }: Props) {
  const imgW = sourceImage.naturalWidth;
  const imgH = sourceImage.naturalHeight;
  const ratio = targetW / targetH;

  const dispScale = Math.min(MAX_DISP / imgW, MAX_DISP / imgH, 1);
  const dispW = Math.round(imgW * dispScale);
  const dispH = Math.round(imgH * dispScale);

  const [crop, setCrop] = useState<CropBox>(() => initCrop(imgW, imgH, ratio));
  const cropRef = useRef(crop);
  cropRef.current = crop;

  // Draw source image onto preview canvas (avoids stale blob URL issues)
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width = dispW;
    canvas.height = dispH;
    canvas.getContext('2d')!.drawImage(sourceImage, 0, 0, dispW, dispH);
  }, [sourceImage, dispW, dispH]);

  // Drag state
  const dragRef = useRef<{ handle: Handle; mx: number; my: number; start: CropBox } | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const { handle, mx, my, start } = dragRef.current;
      const dx = (e.clientX - mx) / dispScale;
      const dy = (e.clientY - my) / dispScale;
      const minW = 32;

      let { x, y, w, h } = start;

      if (handle === 'move') {
        x = clamp(start.x + dx, 0, imgW - start.w);
        y = clamp(start.y + dy, 0, imgH - start.h);
        setCrop({ x, y, w, h });
        return;
      }

      // Resize — maintain aspect ratio, primary axis is horizontal
      if (handle === 'se') {
        w = clamp(start.w + dx, minW, imgW - start.x);
        h = w / ratio;
        if (start.y + h > imgH) { h = imgH - start.y; w = h * ratio; }
      } else if (handle === 'sw') {
        w = clamp(start.w - dx, minW, start.x + start.w);
        h = w / ratio;
        if (start.y + h > imgH) { h = imgH - start.y; w = h * ratio; }
        x = start.x + start.w - w;
      } else if (handle === 'nw') {
        w = clamp(start.w - dx, minW, start.x + start.w);
        h = w / ratio;
        if (start.y + start.h - h < 0) { h = start.y + start.h; w = h * ratio; }
        x = start.x + start.w - w;
        y = start.y + start.h - h;
      } else if (handle === 'ne') {
        w = clamp(start.w + dx, minW, imgW - start.x);
        h = w / ratio;
        if (start.y + start.h - h < 0) { h = start.y + start.h; w = h * ratio; }
        y = start.y + start.h - h;
      }

      setCrop({ x, y, w, h });
    }

    function onMouseUp() { dragRef.current = null; }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [imgW, imgH, ratio, dispScale]);

  const startDrag = useCallback((e: React.MouseEvent, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { handle, mx: e.clientX, my: e.clientY, start: { ...cropRef.current } };
  }, []);

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') handleApply();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApply() {
    const c = cropRef.current;
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(c.w);
    canvas.height = Math.round(c.h);
    canvas.getContext('2d')!.drawImage(sourceImage, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); onApply(img); };
      img.src = url;
    }, 'image/png');
  }

  // Display coords for overlay
  const dx = crop.x * dispScale;
  const dy = crop.y * dispScale;
  const dw = crop.w * dispScale;
  const dh = crop.h * dispScale;

  return (
    <div className="crop-backdrop" onClick={onCancel}>
      <div className="crop-modal" onClick={e => e.stopPropagation()}>

        <div className="crop-modal-header">
          <span className="crop-modal-title">CROP IMAGE</span>
          <span className="crop-modal-badge">{targetW} × {targetH} px ratio</span>
          <button className="crop-modal-close" onClick={onCancel} title="Cancel (Esc)">✕</button>
        </div>

        {/* Image + interactive crop overlay */}
        <div className="crop-image-area" style={{ width: dispW, height: dispH }}>
          <canvas ref={previewRef} style={{ display: 'block' }} />

          {/* Dark surrounds */}
          <div className="crop-overlay" style={{ top: 0, left: 0, right: 0, height: dy }} />
          <div className="crop-overlay" style={{ top: dy + dh, left: 0, right: 0, height: dispH - dy - dh }} />
          <div className="crop-overlay" style={{ top: dy, left: 0, width: dx, height: dh }} />
          <div className="crop-overlay" style={{ top: dy, left: dx + dw, right: 0, height: dh }} />

          {/* Crop box — drag to move */}
          <div
            className="crop-box"
            style={{ left: dx, top: dy, width: dw, height: dh }}
            onMouseDown={e => startDrag(e, 'move')}
          >
            {/* Rule-of-thirds guides */}
            <div className="crop-guide crop-guide-v" style={{ left: '33.33%' }} />
            <div className="crop-guide crop-guide-v" style={{ left: '66.66%' }} />
            <div className="crop-guide crop-guide-h" style={{ top:  '33.33%' }} />
            <div className="crop-guide crop-guide-h" style={{ top:  '66.66%' }} />

            {/* Corner handles */}
            <div className="crop-handle crop-nw" onMouseDown={e => startDrag(e, 'nw')} />
            <div className="crop-handle crop-ne" onMouseDown={e => startDrag(e, 'ne')} />
            <div className="crop-handle crop-sw" onMouseDown={e => startDrag(e, 'sw')} />
            <div className="crop-handle crop-se" onMouseDown={e => startDrag(e, 'se')} />
          </div>
        </div>

        <div className="crop-modal-footer">
          <span className="crop-info">
            {Math.round(crop.w)} × {Math.round(crop.h)} px
            &nbsp;·&nbsp;
            {imgW} × {imgH} source
          </span>
          <div className="crop-actions">
            <button className="crop-btn crop-btn-apply" onClick={handleApply}>✓ Crop &amp; Reprocess</button>
            <button className="crop-btn crop-btn-reset" onClick={() => setCrop(initCrop(imgW, imgH, ratio))} title="Reset to optimal fit">↺ Reset</button>
            <button className="crop-btn crop-btn-cancel" onClick={onCancel}>Cancel</button>
          </div>
        </div>

      </div>
    </div>
  );
}
