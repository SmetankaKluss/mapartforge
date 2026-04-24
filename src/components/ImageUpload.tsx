import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { DragEvent, ChangeEvent, ClipboardEvent } from 'react';
import { useLocale } from '../lib/locale';

interface Props {
  onImageLoaded: (img: HTMLImageElement, file: File) => void;
}

export function ImageUpload({ onImageLoaded }: Props) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [globalDragging, setGlobalDragging] = useState(false);
  // Counter to handle enter/leave across child elements
  const dragCounterRef = useRef(0);

  function loadFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      onImageLoaded(img, file);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  }

  // Обработка вставки из буфера обмена (Ctrl+V)
  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadFile(file);
          return;
        }
      }
    }
  }

  // Глобальные обработчики paste и drag-and-drop для всего документа
  useEffect(() => {
    function handleGlobalPaste(e: Event) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const clipboardEvent = e as unknown as ClipboardEvent;
      const items = clipboardEvent.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); loadFile(file); return; }
        }
      }
    }

    function handleDragEnter(e: Event) {
      const de = e as unknown as DragEvent;
      if (!de.dataTransfer?.types.includes('Files')) return;
      dragCounterRef.current++;
      setGlobalDragging(true);
    }

    function handleDragLeave() {
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setGlobalDragging(false);
      }
    }

    function handleDragOver(e: Event) { e.preventDefault(); }

    function handleGlobalDrop(e: Event) {
      e.preventDefault();
      dragCounterRef.current = 0;
      setGlobalDragging(false);
      const de = e as unknown as DragEvent;
      const file = de.dataTransfer?.files[0];
      if (file) loadFile(file);
    }

    document.addEventListener('paste', handleGlobalPaste);
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleGlobalDrop);
    return () => {
      document.removeEventListener('paste', handleGlobalPaste);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div
        className={`upload-zone ${dragging ? 'drag-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onPaste={onPaste}
        tabIndex={0}
        title={t('Нажми Ctrl+V чтобы вставить изображение из буфера', 'Press Ctrl+V to paste image from clipboard')}
      >
        <div className="upload-icon">⛏</div>
        <p className="upload-sub">{t('нажми или перетащи', 'click or drag')}</p>
        <p className="upload-hint">Ctrl+V</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onChange}
        />
      </div>

      {globalDragging && createPortal(
        <div className="global-drop-overlay">
          <div className="global-drop-inner">
            <div className="global-drop-icon">⛏</div>
            <p className="global-drop-text">{t('Отпусти чтобы загрузить', 'Drop to load image')}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
