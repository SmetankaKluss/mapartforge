import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconGlyph } from './IconGlyph';
import { mkIcons } from './mkIcons';

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
        background: 'var(--overlay-backdrop)',
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
          background: 'var(--color-surface-primary)',
          border: '2px solid var(--color-accent)',
          boxShadow: '0 0 40px rgb(var(--color-accent-rgb) / 0.3)',
          padding: 32,
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          title="Close"
          style={{
            position: 'absolute', top: 12, right: 12,
            background: 'transparent', border: 'none',
            color: 'var(--color-text-secondary)',
            fontFamily: 'inherit', fontSize: 14,
            cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
          }}
          aria-label="Close"
        ><IconGlyph icon={mkIcons.close} /></button>

        {/* Title */}
        <div style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 12, color: 'var(--color-accent)',
          letterSpacing: '0.08em', marginBottom: 12,
        }}>
          PALETTE LINK
        </div>

        {/* Subtitle */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, color: 'var(--color-text-secondary)',
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
            fontSize: 11, color: 'var(--color-accent)',
            background: 'var(--color-field-bg)',
            border: '1px solid var(--color-accent)',
            padding: '10px 12px', marginBottom: 16, outline: 'none',
          }}
        />

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleCopy}
            style={{
              flex: 1, height: 36,
              background: 'rgb(var(--color-accent-rgb) / 0.12)',
              border: '1px solid rgb(var(--color-accent-rgb) / 0.6)',
              color: 'var(--color-accent)',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 8, cursor: 'pointer',
              transition: 'background 0.12s',
            }}
          ><IconGlyph icon={copied ? mkIcons.check : mkIcons.copy} /> {copied ? 'COPIED!' : 'COPY LINK'}</button>
          <button
            onClick={onClose}
            style={{
              flex: '0 0 auto', height: 36, padding: '0 20px',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, cursor: 'pointer',
              transition: 'border-color 0.12s, color 0.12s',
            }}
          ><IconGlyph icon={mkIcons.close} /> CLOSE</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
