import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  url: string;
  onClose: () => void;
}

export function PaletteShareModal({ url, onClose }: Props) {
  const [copied, setCopied]   = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);

  // Select the URL text on open
  useEffect(() => { inputRef.current?.select(); }, []);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette share link"
        style={{
          position: 'relative',
          width: 480,
          background: '#0f0f1a',
          border: '2px solid #57FF6E',
          boxShadow: '0 0 40px rgba(87,255,110,0.3)',
          padding: 32,
        }}
      >
        {/* Close × */}
        <button
          onClick={onClose}
          title="Close"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.45)',
            fontFamily: 'inherit', fontSize: 14,
            cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
          }}
        >✕</button>

        {/* Title */}
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 12, color: '#57FF6E',
          letterSpacing: '0.08em', marginBottom: 12,
        }}>
          PALETTE LINK
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: 'rgba(255,255,255,0.5)',
          marginBottom: 20,
        }}>
          Anyone opening this link will get your block selection
        </div>

        {/* URL input */}
        <input
          ref={inputRef}
          value={url}
          readOnly
          onClick={() => inputRef.current?.select()}
          style={{
            display: 'block', width: '100%', boxSizing: 'border-box',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, color: '#57FF6E',
            background: '#080810',
            border: '1px solid #57FF6E',
            padding: '10px 12px', marginBottom: 16, outline: 'none',
          }}
        />

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1, height: 36,
              background: 'rgba(87,255,110,0.12)',
              border: '1px solid rgba(87,255,110,0.6)',
              color: '#57FF6E',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8, cursor: 'pointer',
              transition: 'background 0.12s',
            }}
          >{copied ? '✓ COPIED!' : '⎘ COPY LINK'}</button>
          <button
            onClick={onClose}
            style={{
              flex: '0 0 auto', height: 36, padding: '0 20px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.5)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, cursor: 'pointer',
              transition: 'border-color 0.12s, color 0.12s',
            }}
          >✕ CLOSE</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
