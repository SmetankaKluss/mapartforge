import { useState, useCallback } from 'react';
import { COLOUR_ROWS, BUILTIN_PRESETS } from '../lib/paletteBlocks';
import type { BlockSelection } from '../lib/paletteBlocks';
import { BlockIcon } from './BlockIcon';

const STORAGE_KEY = 'mapart_custom_presets';

function loadStoredPresets(): Record<string, BlockSelection> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); }
  catch { return {}; }
}

interface Props {
  blockSelection: BlockSelection;
  onSelectionChange: (sel: BlockSelection) => void;
  paletteSize: number;
  disabled: boolean;
}

export function PaletteEditor({ blockSelection, onSelectionChange, paletteSize, disabled }: Props) {
  const [presetName,    setPresetName]    = useState('');
  const [customPresets, setCustomPresets] = useState<Record<string, BlockSelection>>(loadStoredPresets);
  const [selectedPreset, setSelectedPreset] = useState('');

  const persistPresets = useCallback((p: Record<string, BlockSelection>) => {
    setCustomPresets(p);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }, []);

  function handlePresetSelect(name: string) {
    setSelectedPreset(name);
    if (!name) return;
    if (name in BUILTIN_PRESETS) {
      onSelectionChange(BUILTIN_PRESETS[name]);
    } else if (name in customPresets) {
      onSelectionChange(customPresets[name]);
    }
  }

  function handleSave() {
    const name = presetName.trim();
    if (!name || name in BUILTIN_PRESETS) return;
    persistPresets({ ...customPresets, [name]: blockSelection });
    setSelectedPreset(name);
    setPresetName('');
  }

  function handleDelete() {
    if (!selectedPreset || selectedPreset in BUILTIN_PRESETS) return;
    const next = { ...customPresets };
    delete next[selectedPreset];
    persistPresets(next);
    setSelectedPreset('');
  }

  function toggleBlock(csId: number, blockId: number) {
    const cur = blockSelection[csId] ?? [];
    const next = cur.includes(blockId)
      ? cur.filter(id => id !== blockId)
      : [...cur, blockId].sort((a, b) => a - b);
    onSelectionChange({ ...blockSelection, [csId]: next });
  }

  function toggleRow(csId: number) {
    const row = COLOUR_ROWS[csId];
    const cur = blockSelection[csId] ?? [];
    const allOn = cur.length === row.blocks.length;
    onSelectionChange({ ...blockSelection, [csId]: allOn ? [] : row.blocks.map(b => b.blockId) });
  }

  const customNames = Object.keys(customPresets);

  const blockCount = COLOUR_ROWS.reduce(
    (sum, row) => sum + (blockSelection[row.csId]?.length ?? 0), 0,
  );

  return (
    <section className="sidebar-section">
      <h3 className="section-title">
        Palette
        <span className="palette-count">{paletteSize} colors · {blockCount} blocks</span>
      </h3>

      {/* Unified preset selector — built-in + custom */}
      <div className="pe-preset-bar">
        <select
          className={`pe-preset-select${selectedPreset ? ' has-value' : ''}`}
          value={selectedPreset}
          onChange={e => handlePresetSelect(e.target.value)}
          disabled={disabled}
        >
          <option value="">— select preset —</option>
          <optgroup label="Built-in">
            {(Object.keys(BUILTIN_PRESETS) as string[]).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </optgroup>
          {customNames.length > 0 && (
            <optgroup label="Custom">
              {customNames.map(n => <option key={n} value={n}>{n}</option>)}
            </optgroup>
          )}
        </select>
        {selectedPreset && !(selectedPreset in BUILTIN_PRESETS) && (
          <button
            className="pe-btn pe-btn-delete"
            onClick={handleDelete}
            disabled={disabled}
            title="Delete preset"
          >✕</button>
        )}
      </div>

      {/* Save current selection as custom preset */}
      <div className="pe-bar">
        <input
          className="pe-name-input"
          placeholder="Save as preset…"
          value={presetName}
          onChange={e => setPresetName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          disabled={disabled}
        />
        <button
          className="pe-btn pe-btn-save"
          onClick={handleSave}
          disabled={disabled || !presetName.trim() || presetName.trim() in BUILTIN_PRESETS}
          title="Save current selection as a preset"
        >Save</button>
      </div>

      {/* Scrollable colour rows */}
      <div className="pe-rows">
        {COLOUR_ROWS.map(row => {
          const activeIds = blockSelection[row.csId] ?? [];
          const allOn = activeIds.length === row.blocks.length;
          const rowOn = activeIds.length > 0;

          return (
            <div key={row.csId} className={`pe-row${rowOn ? '' : ' row-off'}`}>
              <div className="pe-row-header">
                <div
                  className="pe-swatch"
                  style={{ background: `rgb(${row.r},${row.g},${row.b})` }}
                  title={`#${[row.r, row.g, row.b].map(v => v.toString(16).padStart(2, '0')).join('')}`}
                />
                <span className="pe-row-name">{row.colourName}</span>
                <button
                  className="pe-row-toggle"
                  onClick={() => !disabled && toggleRow(row.csId)}
                  disabled={disabled}
                  title={allOn ? 'Deselect all' : 'Select all'}
                >{activeIds.length === 0 ? '○' : allOn ? '●' : '◑'}</button>
              </div>

              <div className="pe-block-grid">
                {row.blocks.map(block => {
                  const isOn = activeIds.includes(block.blockId);
                  return (
                    <div
                      key={block.blockId}
                      className={`pe-block${isOn ? ' on' : ' off'}`}
                      onClick={() => !disabled && toggleBlock(row.csId, block.blockId)}
                      title={`${block.displayName}\nminecraft:${block.nbtName}`}
                    >
                      <BlockIcon
                        nbtName={block.nbtName}
                        blockId={block.blockId}
                        csId={row.csId}
                        r={row.r} g={row.g} b={row.b}
                        className="pe-block-icon"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
