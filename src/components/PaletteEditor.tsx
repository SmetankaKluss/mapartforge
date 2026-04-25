import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { COLOUR_ROWS, BUILTIN_PRESETS } from '../lib/paletteBlocks';
import type { BlockSelection } from '../lib/paletteBlocks';
import { BlockIcon } from './BlockIcon';
import { buildPaletteUrl } from '../lib/paletteShare';
import { PaletteShareModal } from './PaletteShareModal';
import { useLocale } from '../lib/locale';
import { isBlockAvailable } from '../lib/versionPresets';
import type { MinecraftVersion } from '../lib/versionPresets';

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
  minecraftVersion?: MinecraftVersion;
}

export function PaletteEditor({ blockSelection, onSelectionChange, paletteSize, disabled, minecraftVersion }: Props) {
  const { t } = useLocale();
  const [customPresets,   setCustomPresets]   = useState<Record<string, BlockSelection>>(loadStoredPresets);
  const [selectedPreset,  setSelectedPreset]  = useState('');
  const [searchQuery,     setSearchQuery]     = useState('');
  const [showSaveModal,   setShowSaveModal]   = useState(false);
  const [modalName,       setModalName]       = useState('');
  const [clearPending,    setClearPending]    = useState(false);
  const [paletteUrl,      setPaletteUrl]      = useState<string | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);

  // Focus the modal input whenever it opens
  useEffect(() => {
    if (showSaveModal) modalInputRef.current?.focus();
  }, [showSaveModal]);

  // Auto-detect matching preset when blockSelection changes externally
  useEffect(() => {
    const allPresets = { ...BUILTIN_PRESETS, ...customPresets };
    for (const [name, sel] of Object.entries(allPresets)) {
      const norm = (o: BlockSelection) => JSON.stringify(Object.keys(o).sort().map(k => [k, [...(o[+k] ?? [])].sort()]));
      if (norm(blockSelection) === norm(sel)) {
        setSelectedPreset(name);
        return;
      }
    }
    setSelectedPreset('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockSelection]);

  const persistPresets = useCallback((p: Record<string, BlockSelection>) => {
    setCustomPresets(p);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }, []);

  // ── Preset selector ──────────────────────────────────────────────────────

  function handlePresetSelect(name: string) {
    setSelectedPreset(name);
    if (!name) {
      // Reset to empty selection when "select preset" is chosen
      const emptySelection = Object.fromEntries(
        COLOUR_ROWS.map(row => [row.csId, []])
      );
      onSelectionChange(emptySelection);
      return;
    }
    if (name in BUILTIN_PRESETS) {
      onSelectionChange(BUILTIN_PRESETS[name]);
    } else if (name in customPresets) {
      onSelectionChange(customPresets[name]);
    }
  }

  function handleDelete() {
    if (!selectedPreset || selectedPreset in BUILTIN_PRESETS) return;
    const next = { ...customPresets };
    delete next[selectedPreset];
    persistPresets(next);
    setSelectedPreset('');
  }

  // ── Clear all ────────────────────────────────────────────────────────────

  function handleClear() {
    if (!clearPending) {
      // First click: arm the confirmation, auto-cancel after 2 s
      setClearPending(true);
      clearTimerRef.current = setTimeout(() => setClearPending(false), 2000);
    } else {
      // Second click within window: deselect every block
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      setClearPending(false);
      const empty = Object.fromEntries(COLOUR_ROWS.map(r => [r.csId, []]));
      onSelectionChange(empty);
    }
  }

  // ── Save modal ───────────────────────────────────────────────────────────

  function openSaveModal() {
    setModalName('');
    setShowSaveModal(true);
  }

  function confirmSave() {
    const name = modalName.trim();
    if (!name || name in BUILTIN_PRESETS) return;
    persistPresets({ ...customPresets, [name]: blockSelection });
    setSelectedPreset(name);
    setModalName('');
    setShowSaveModal(false);
  }

  function cancelSave() {
    setShowSaveModal(false);
    setModalName('');
  }

  // ── Block toggles ────────────────────────────────────────────────────────

  function toggleBlock(csId: number, blockId: number) {
    // Radio-select: only one block per color group
    const cur = blockSelection[csId] ?? [];
    const isSelected = cur.includes(blockId);
    const next = isSelected ? cur : [blockId];
    onSelectionChange({ ...blockSelection, [csId]: next });
  }

  function toggleRow(csId: number) {
    const row = COLOUR_ROWS[csId];
    const cur = blockSelection[csId] ?? [];
    const hasSelection = cur.length > 0;
    // Toggle: if any block selected, deselect all; otherwise select first block
    const next = hasSelection ? [] : [row.blocks[0]?.blockId ?? 0];
    onSelectionChange({ ...blockSelection, [csId]: next });
  }

  // ── Version filtering ────────────────────────────────────────────────────

  const versionRows = useMemo(() => {
    if (!minecraftVersion) return COLOUR_ROWS;
    return COLOUR_ROWS
      .map(row => ({
        ...row,
        blocks: row.blocks.filter(b => isBlockAvailable(b.nbtName, minecraftVersion)),
      }))
      .filter(row => row.blocks.length > 0);
  }, [minecraftVersion]);

  // ── Search filtering ─────────────────────────────────────────────────────

  const q = searchQuery.trim().toLowerCase();
  const filteredRows = q
    ? versionRows.filter(row =>
        row.colourName.toLowerCase().includes(q) ||
        row.blocks.some(b =>
          b.displayName.toLowerCase().includes(q) ||
          b.nbtName.toLowerCase().includes(q),
        ),
      )
    : versionRows;

  // ── Derived counts ───────────────────────────────────────────────────────

  const customNames = Object.keys(customPresets);
  const blockCount  = COLOUR_ROWS.reduce(
    (sum, row) => sum + (blockSelection[row.csId]?.length ?? 0), 0,
  );
  const modalNameInvalid = modalName.trim() in BUILTIN_PRESETS;

  return (
    <section className="sidebar-section">
      {/* Section header */}
      <h3 className="section-title">
        {t('Палитра', 'Palette')}
        <span className="palette-count">{paletteSize} {t('цветов', 'colors')} · {blockCount} {t('блоков', 'blocks')}</span>
      </h3>

      {/* ── Row 1: preset dropdown ── */}
      <div className="pe-preset-bar">
        <select
          className={`pe-preset-select${selectedPreset ? ' has-value' : ''}`}
          value={selectedPreset}
          onChange={e => handlePresetSelect(e.target.value)}
          disabled={disabled}
        >
          <option value="">{t('— выбрать пресет —', '— select preset —')}</option>
          <optgroup label={t('Встроенные', 'Built-in')}>
            {(Object.keys(BUILTIN_PRESETS) as string[]).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </optgroup>
          {customNames.length > 0 && (
            <optgroup label={t('Свои', 'Custom')}>
              {customNames.map(n => <option key={n} value={n}>{n}</option>)}
            </optgroup>
          )}
        </select>
        {selectedPreset && !(selectedPreset in BUILTIN_PRESETS) && (
          <button
            className="pe-btn pe-btn-delete"
            onClick={handleDelete}
            disabled={disabled}
            title={t('Удалить пресет', 'Delete preset')}
          >✕</button>
        )}
      </div>

      {/* ── Row 2: search + save ── */}
      <div className="pe-search-bar">
        <div className="pe-search-wrap">
          <input
            className="pe-search-input"
            placeholder={t('Поиск блоков…', 'Search blocks…')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            spellCheck={false}
          />
          {searchQuery && (
            <button
              className="pe-search-clear"
              onClick={() => setSearchQuery('')}
              title={t('Очистить поиск', 'Clear search')}
              tabIndex={-1}
            >×</button>
          )}
        </div>
        <button
          className="pe-save-btn"
          onClick={openSaveModal}
          disabled={disabled}
          title={t('Сохранить текущий выбор блоков как пресет', 'Save current block selection as preset')}
        >{t('Сохранить', 'Save')}</button>
        <button
          className={`pe-clear-btn${clearPending ? ' pending' : ''}`}
          onClick={handleClear}
          disabled={disabled}
          title={clearPending ? t('Нажми ещё раз для подтверждения', 'Click again to confirm') : t('Снять выбор со всех блоков', 'Clear selection from all blocks')}
        >{clearPending ? t('Точно?', 'Sure?') : t('Сброс', 'Reset')}</button>
      </div>

      {/* ── Row 3: share palette ── */}
      <div className="pe-share-bar">
        <button
          className="pe-share-btn"
          onClick={() => setPaletteUrl(buildPaletteUrl(blockSelection))}
          disabled={disabled}
          title={t('Создать ссылку для текущей палитры блоков', 'Create link for current palette')}
        >⬡ {t('Поделиться палитрой', 'Share palette')}</button>
      </div>

      {/* ── Scrollable colour rows ── */}
      <div className="pe-rows">
        {filteredRows.length === 0 ? (
          <p className="pe-no-results">{t('Блоки не найдены', 'No blocks found')}: «{searchQuery}»</p>
        ) : (
          filteredRows.map(row => {
            const activeIds = blockSelection[row.csId] ?? [];
            const allOn = activeIds.length === row.blocks.length;
            const rowOn = activeIds.length > 0;

            // When searching, filter blocks within the row too
            const visibleBlocks = q
              ? row.blocks.filter(b =>
                  row.colourName.toLowerCase().includes(q) ||
                  b.displayName.toLowerCase().includes(q) ||
                  b.nbtName.toLowerCase().includes(q),
                )
              : row.blocks;

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
                    title={allOn ? t('Снять всё', 'Deselect all') : t('Выбрать всё', 'Select all')}
                  >{activeIds.length === 0 ? '○' : allOn ? '●' : '◑'}</button>
                </div>

                <div className="pe-block-grid">
                  {visibleBlocks.map(block => {
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
          })
        )}
      </div>

      {/* ── Palette share modal ── */}
      {paletteUrl && (
        <PaletteShareModal url={paletteUrl} onClose={() => setPaletteUrl(null)} />
      )}

      {/* ── Save preset modal ── */}
      {showSaveModal && (
        <div
          className="pe-modal-backdrop"
          onClick={cancelSave}
          onKeyDown={e => e.key === 'Escape' && cancelSave()}
          role="dialog"
          aria-modal="true"
          aria-label="Save preset"
        >
          <div className="pe-modal" onClick={e => e.stopPropagation()}>
            <div className="pe-modal-title">{t('Сохранить пресет', 'Save preset')}</div>
            <input
              ref={modalInputRef}
              className={`pe-modal-input${modalNameInvalid ? ' invalid' : ''}`}
              placeholder={t('Название пресета…', 'Preset name…')}
              value={modalName}
              onChange={e => setModalName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  confirmSave();
                if (e.key === 'Escape') cancelSave();
              }}
              spellCheck={false}
            />
            {modalNameInvalid && (
              <p className="pe-modal-error">{t('Это название зарезервировано для встроенных пресетов.', 'This name is reserved for built-in presets.')}</p>
            )}
            <div className="pe-modal-actions">
              <button
                className="pe-modal-btn pe-modal-btn-save"
                onClick={confirmSave}
                disabled={!modalName.trim() || modalNameInvalid}
              >{t('СОХРАНИТЬ', 'SAVE')}</button>
              <button
                className="pe-modal-btn pe-modal-btn-cancel"
                onClick={cancelSave}
              >{t('ОТМЕНА', 'CANCEL')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
