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
    <>
      {/* Backdrop */}
      <div className="share-modal-backdrop" onClick={onClose} />
      {/* Modal box */}
      <div className="share-modal-box" role="dialog" aria-modal="true">
        <div className="share-modal-title">LINK CREATED</div>
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
        </div>
        <div className="share-modal-actions">
          <button className="share-copy-btn" onClick={handleCopy}>
            {copied ? '✓ COPIED!' : '⎘ COPY LINK'}
          </button>
          <button className="share-modal-close" onClick={onClose}>
            ✕ CLOSE
          </button>
        </div>
      </div>
    </>
  );
}
