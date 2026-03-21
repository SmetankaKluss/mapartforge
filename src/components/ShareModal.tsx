import { useState, useEffect, useRef } from 'react';

interface Props {
  url: string;
  onClose: () => void;
}

export function ShareModal({ url, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Select URL text on open
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="share-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="share-modal">
        <div className="share-modal-header">
          <span className="share-modal-title">Share link created</span>
          <button className="share-modal-close" onClick={onClose} title="Close">✕</button>
        </div>
        <p className="share-modal-desc">
          Anyone with this link can view your map art with all current settings.
        </p>
        <div className="share-url-row">
          <input
            ref={inputRef}
            className="share-url-input"
            value={url}
            readOnly
            onClick={() => inputRef.current?.select()}
          />
          <button className="share-copy-btn" onClick={handleCopy}>
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  );
}
