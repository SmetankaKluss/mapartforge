import { useRef, useEffect, useState } from 'react';
import type { Layer, LayerGroup } from '../lib/layers';

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
  onOpacityChange: (id: string, opacity: number) => void;
  onMoveLayer: (fromIdx: number, toIdx: number) => void;
  onToggleLock: (id: string) => void;
  onMergeDown: () => void;
  onMergeVisible: () => void;
  groups: LayerGroup[];
  onCreateGroup: (layerIds: string[]) => void;
  onDeleteGroup: (groupId: string) => void;
  onToggleGroupCollapse: (groupId: string) => void;
}

// Draw a 40x40 thumbnail for a layer onto a canvas element
function LayerThumbnail({ layer }: { layer: Layer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = 40, H = 40;
    ctx.clearRect(0, 0, W, H);

    // Checkerboard for transparency
    const sq = 5;
    for (let y = 0; y < H; y += sq) {
      for (let x = 0; x < W; x += sq) {
        ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? '#2a2a3a' : '#1a1a28';
        ctx.fillRect(x, y, sq, sq);
      }
    }

    if (!layer.imageData) return;
    // Scale imageData down to 40x40
    const offscreen = document.createElement('canvas');
    offscreen.width  = layer.imageData.width;
    offscreen.height = layer.imageData.height;
    const octx = offscreen.getContext('2d')!;
    octx.putImageData(layer.imageData, 0, 0);
    ctx.drawImage(offscreen, 0, 0, W, H);
  }, [layer.imageData]);

  return (
    <canvas
      ref={canvasRef}
      width={40}
      height={40}
      style={{ width: 40, height: 40, flexShrink: 0, imageRendering: 'pixelated', border: '1px solid rgba(87,255,110,0.12)' }}
    />
  );
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
  onOpacityChange,
  onMoveLayer,
  onToggleLock,
  onMergeDown,
  onMergeVisible,
  groups,
  onCreateGroup,
  onDeleteGroup,
  onToggleGroupCollapse,
}: Props) {
  const editingRef = useRef<HTMLInputElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Layers are stored bottom-to-top internally but displayed top-to-bottom in UI
  const displayLayers = [...layers].reverse();

  function handleLayerClick(e: React.MouseEvent, layerId: string) {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev =>
        prev.includes(layerId) ? prev.filter(id => id !== layerId) : [...prev, layerId],
      );
    } else {
      setSelectedIds([]);
      onSetActive(layerId);
    }
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, idx: number) {
    dragIndexRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, toIdx: number) {
    e.preventDefault();
    const fromIdx = dragIndexRef.current;
    if (fromIdx === null || fromIdx === toIdx) return;
    dragIndexRef.current = null;
    onMoveLayer(fromIdx, toIdx);
  }

  function handleDragEnd() {
    dragIndexRef.current = null;
  }

  return (
    <div className="layers-panel">
      <div className="layers-panel-header">
        <span className="layers-panel-title">СЛОИ</span>
        <button className="layers-add-btn" onClick={onAdd} title="Добавить слой">+</button>
        <button className="layers-add-btn" onClick={onMergeDown} title="Слить вниз" disabled={layers.length <= 1}>↓</button>
        <button className="layers-add-btn" onClick={onMergeVisible} title="Слить видимые" disabled={layers.filter(l => l.visible && l.imageData).length <= 1}>⊞</button>
        {selectedIds.length > 1 && (
          <button className="layers-add-btn" onClick={() => { onCreateGroup(selectedIds); setSelectedIds([]); }} title="Создать группу">⊡</button>
        )}
      </div>
      <div className="layers-list">
        {(() => {
          const rendered: React.ReactNode[] = [];
          let lastGroupId: string | null = undefined as unknown as string | null;

          displayLayers.forEach((layer, idx) => {
            const gid = layer.groupId;
            // Group header row
            if (gid !== lastGroupId && gid !== null) {
              lastGroupId = gid;
              const grp = groups.find(g => g.id === gid);
              if (grp) {
                rendered.push(
                  <div key={`grp-${gid}`} className="layer-group-header">
                    <button className="layer-group-collapse" onClick={() => onToggleGroupCollapse(gid)}>
                      {grp.collapsed ? '▶' : '▼'}
                    </button>
                    <span className="layer-group-name">{grp.name}</span>
                    <button className="layer-del-btn" onClick={() => onDeleteGroup(gid)} title="Разгруппировать">⊠</button>
                  </div>,
                );
              }
            } else if (gid === null) {
              lastGroupId = null;
            }

            // Skip layers in collapsed groups
            if (gid) {
              const grp = groups.find(g => g.id === gid);
              if (grp?.collapsed) return;
            }

            const isActive = layer.id === activeLayerId;
            const isSelected = selectedIds.includes(layer.id);
            rendered.push(
            <div
              key={layer.id}
              className={`layer-row layer-row-v2${isActive ? ' active' : ''}${isSelected ? ' layer-selected' : ''}${gid ? ' layer-in-group' : ''}`}
              onClick={e => handleLayerClick(e, layer.id)}
              draggable
              onDragStart={e => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
            >
              {/* Thumbnail */}
              <LayerThumbnail layer={layer} />

              {/* Main content */}
              <div className="layer-row-main">
                {/* Top row: icons + name */}
                <div className="layer-row-top">
                  {/* Type icon */}
                  <span className="layer-type-icon" title={layer.isText ? 'Текстовый слой' : 'Слой'}>
                    {layer.isText ? 'T' : '⬛'}
                  </span>

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

                  {/* Eye / lock / delete */}
                  <div className="layer-icon-btns">
                    <button
                      className={`layer-vis-btn${layer.visible ? '' : ' hidden'}`}
                      onClick={e => { e.stopPropagation(); onToggleVisible(layer.id); }}
                      title={layer.visible ? 'Скрыть' : 'Показать'}
                    >
                      {layer.visible ? '👁' : '🚫'}
                    </button>
                    <button
                      className={`layer-lock-btn${layer.locked ? ' locked' : ''}`}
                      onClick={e => { e.stopPropagation(); onToggleLock(layer.id); }}
                      title={layer.locked ? 'Разблокировать' : 'Заблокировать'}
                    >
                      {layer.locked ? '🔒' : '🔓'}
                    </button>
                    <button
                      className="layer-del-btn"
                      onClick={e => { e.stopPropagation(); onDelete(layer.id); }}
                      title="Удалить слой"
                    >✕</button>
                  </div>
                </div>

                {/* Bottom row: opacity + move buttons */}
                <div className="layer-row-bottom">
                  <span className="layer-opacity-label">Прозрачность</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={layer.opacity ?? 100}
                    className="layer-opacity-slider"
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onChange={e => { e.stopPropagation(); onOpacityChange(layer.id, Number(e.target.value)); }}
                    title={`Прозрачность: ${layer.opacity ?? 100}%`}
                  />
                  <span className="layer-opacity-val">{layer.opacity ?? 100}%</span>
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
                </div>
              </div>
            </div>
            );
          });
          return rendered;
        })()}
      </div>
    </div>
  );
}
