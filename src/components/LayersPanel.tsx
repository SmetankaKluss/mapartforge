import { useRef } from 'react';
import type { Layer } from '../lib/layers';

interface Props {
  layers: Layer[];
  activeLayerId: string;
  onSetActive: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

export function LayersPanel({
  layers,
  activeLayerId,
  onSetActive,
  onToggleVisible,
  onAdd,
  onDelete,
  onRename,
  onMoveUp,
  onMoveDown,
}: Props) {
  const editingRef = useRef<HTMLInputElement | null>(null);

  // Layers are stored bottom-to-top internally but displayed top-to-bottom in UI
  const displayLayers = [...layers].reverse();

  return (
    <div className="layers-panel">
      <div className="layers-panel-header">
        <span className="layers-panel-title">СЛОИ</span>
        <button className="layers-add-btn" onClick={onAdd} title="Добавить слой">+</button>
      </div>
      <div className="layers-list">
        {displayLayers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              className={`layer-row${isActive ? ' active' : ''}`}
              onClick={() => onSetActive(layer.id)}
            >
              {/* Visibility toggle */}
              <button
                className={`layer-vis-btn${layer.visible ? '' : ' hidden'}`}
                onClick={e => { e.stopPropagation(); onToggleVisible(layer.id); }}
                title={layer.visible ? 'Скрыть' : 'Показать'}
              >
                {layer.visible ? '👁' : '🚫'}
              </button>

              {/* Layer name (double-click to rename) */}
              <span
                className="layer-name"
                onDoubleClick={e => {
                  e.stopPropagation();
                  const span = e.currentTarget;
                  const input = document.createElement('input');
                  input.className = 'layer-name-input';
                  input.value = layer.name;
                  editingRef.current = input;
                  span.replaceWith(input);
                  input.focus();
                  input.select();
                  const commit = () => {
                    const newName = input.value.trim() || layer.name;
                    onRename(layer.id, newName);
                    // React will re-render and replace input with span
                    input.replaceWith(span);
                  };
                  input.addEventListener('blur', commit);
                  input.addEventListener('keydown', ev => {
                    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
                    if (ev.key === 'Escape') { input.replaceWith(span); }
                  });
                }}
              >
                {layer.name}
              </span>

              {/* Move up/down */}
              <div className="layer-move-btns">
                <button
                  className="layer-move-btn"
                  onClick={e => { e.stopPropagation(); onMoveUp(layer.id); }}
                  title="Выше"
                >▲</button>
                <button
                  className="layer-move-btn"
                  onClick={e => { e.stopPropagation(); onMoveDown(layer.id); }}
                  title="Ниже"
                >▼</button>
              </div>

              {/* Delete */}
              <button
                className="layer-del-btn"
                onClick={e => { e.stopPropagation(); onDelete(layer.id); }}
                title="Удалить слой"
              >✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
