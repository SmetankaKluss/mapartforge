import React, { useState } from 'react';

interface SaveProjectModalProps {
  thumbnail: string | null;
  defaultName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export function SaveProjectModal({ thumbnail, defaultName, onSave, onClose }: SaveProjectModalProps) {
  const [name, setName] = useState(defaultName);

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  }

  return (
    <div className="save-project-modal" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-title">SAVE PROJECT</div>
        {thumbnail && (
          <div className="thumbnail-preview">
            <img src={thumbnail} alt="Project preview" />
          </div>
        )}
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Project name..."
          autoFocus
          spellCheck={false}
        />
        <div className="modal-actions">
          <button className="modal-btn modal-btn-save" onClick={handleSave} disabled={!name.trim()}>
            SAVE
          </button>
          <button className="modal-btn modal-btn-cancel" onClick={onClose}>
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
